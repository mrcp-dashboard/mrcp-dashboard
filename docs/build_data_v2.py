#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
MRCP Dashboard V3.4 - générateur data_v2.json avec fiabilisation.

À placer à la racine du projet, puis renommer en build_data_v2.py.
Il lit :
- speedhive_csv/sessions_*.csv
- speedhive_pilots.json
- corrections.json (optionnel)
- lap_overrides.json (optionnel, exporté depuis /admin)

Il écrit data_v2.json.
"""
from __future__ import annotations

import csv
import json
import re
import statistics
import time
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent
CSV_DIR = ROOT / "speedhive_csv"
ROOT_OUT_FILE = ROOT / "data_v2.json"
CORRECTIONS_FILE = ROOT / "corrections.json"
PILOTS_FILE = ROOT / "speedhive_pilots.json"
LAP_OVERRIDES_FILE = ROOT / "lap_overrides.json"

LAP_MIN = 8.0
LAP_MAX = 300.0
TT10_LIMIT = 30.0
# Un tour est classe TT1/10 sous 30 s, TT1/8 au-dessus (TT10_LIMIT). Un TT1/10
# lent peut donc basculer a tort en TT1/8 : la fenetre ci-dessous sert a le
# reperer pour verification manuelle.
#
# La borne haute etait a 45 s, ce qui couvrait toute la plage normale du TT1/8
# (mediane 38.9 s, record du club 30.4 s) : 83% des tours etaient signales, la
# page Qualite affichait un mur de tours parfaitement normaux et le score
# restait bloque a 0. A 32 s on ne garde que la zone reellement ambigue - les
# TT1/10 avoues montent jusqu'a 33.8 s - soit ~2% des tours, une liste
# reellement relisible.
SUSPECT_TT18_LOW = 30.0
SUSPECT_TT18_HIGH = 32.0
CLUB_NAME = "Mini Racing Club Palois"


def slugify(value: str) -> str:
    value = value.strip().lower()
    value = re.sub(r"[^a-z0-9àâäéèêëîïôöùûüçñ]+", "-", value, flags=re.I)
    return value.strip("-") or "inconnu"


def normalize_transponder(t: Any) -> str:
    return str(t or "").strip().replace("/0", "")


def parse_laptime(value: str | None) -> float | None:
    if not value:
        return None
    value = value.strip().replace('"', '').replace(',', '.')
    try:
        parts = value.split(":")
        if len(parts) == 3:
            h, m, s = parts
            return int(h) * 3600 + int(m) * 60 + float(s)
        if len(parts) == 2:
            m, s = parts
            return int(m) * 60 + float(s)
        return float(value)
    except Exception:
        return None


def parse_date(value: str | None) -> str | None:
    if not value:
        return None
    value = value.strip()
    for fmt in ("%d-%m-%Y", "%d/%m/%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(value, fmt).strftime("%Y-%m-%d")
        except ValueError:
            pass
    return None


def fmt_date_fr(iso: str | None) -> str:
    if not iso:
        return ""
    try:
        return datetime.strptime(iso, "%Y-%m-%d").strftime("%d/%m/%Y")
    except ValueError:
        return iso


def load_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    try:
        with path.open("r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as exc:
        print(f"ATTENTION: impossible de lire {path.name}: {exc}")
        return default


def load_pilots() -> dict[str, str]:
    data = load_json(PILOTS_FILE, {})
    if isinstance(data, dict):
        return {normalize_transponder(k): str(v).strip() for k, v in data.items() if normalize_transponder(k) and str(v).strip()}
    return {}


def load_corrections() -> dict[str, Any]:
    return load_json(CORRECTIONS_FILE, {
        "deleted_laps": [],
        "edited_laps": [],
        "merged_transponders": [],
        "renamed_transponders": []
    })


def load_lap_overrides() -> dict[str, dict[str, Any]]:
    data = load_json(LAP_OVERRIDES_FILE, {"excluded": {}, "forced_track": {}})
    if not isinstance(data, dict):
        data = {}
    return {
        "excluded": data.get("excluded") if isinstance(data.get("excluded"), dict) else {},
        "forced_track": data.get("forced_track") if isinstance(data.get("forced_track"), dict) else {},
    }


def lap_id(activity_id: str, transponder: str, lap_no: Any, start_time: Any, lap_time: float) -> str:
    return "|".join([str(activity_id), normalize_transponder(transponder), str(lap_no if lap_no is not None else ""), str(start_time or ""), f"{float(lap_time):.3f}"])


def infer_track(seconds: float) -> str:
    return "TT1/10" if float(seconds) < TT10_LIMIT else "TT1/8"


def build_transponder_maps(pilots: dict[str, str], corrections: dict[str, Any]) -> tuple[dict[str, str], dict[str, str]]:
    name_by_transponder = dict(pilots)
    canonical_by_transponder: dict[str, str] = {}

    for item in corrections.get("renamed_transponders", []):
        t = normalize_transponder(item.get("transponder", ""))
        name = str(item.get("name", "")).strip()
        if t and name:
            name_by_transponder[t] = name

    for item in corrections.get("merged_transponders", []):
        source = normalize_transponder(item.get("source", item.get("from", "")))
        target = normalize_transponder(item.get("target", item.get("to", "")))
        if source and target:
            canonical_by_transponder[source] = target

    return name_by_transponder, canonical_by_transponder


def canonical_transponder(t: str, merge_map: dict[str, str]) -> str:
    t = normalize_transponder(t)
    seen = set()
    while t in merge_map and t not in seen:
        seen.add(t)
        t = normalize_transponder(merge_map[t])
    return t


def is_deleted_lap(corrections: dict[str, Any], transponder: str, date_fr: str, lap_index: int) -> bool:
    for item in corrections.get("deleted_laps", []):
        try:
            if normalize_transponder(item.get("transponder")) == normalize_transponder(transponder) and str(item.get("date")) == date_fr and int(item.get("lap_index", -1)) == lap_index:
                return True
        except Exception:
            pass
    return False


def read_activity_csv(path: Path, corrections: dict[str, Any], overrides: dict[str, dict[str, Any]], merge_map: dict[str, str], name_map: dict[str, str], quality_collector: dict[str, Any]) -> dict[str, Any]:
    activity_id = path.stem.replace("sessions_", "")
    entries: list[dict[str, Any]] = []
    raw_ignored: list[dict[str, Any]] = []
    lap_index_by_transponder_date: dict[tuple[str, str], int] = defaultdict(int)

    with path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            raw_t = normalize_transponder(row.get("Transponder") or "")
            if not raw_t:
                continue
            iso_date = parse_date(row.get("Date"))
            date_fr = fmt_date_fr(iso_date)
            lap_time = parse_laptime(row.get("Laptime") or row.get("MRCP"))
            if lap_time is None:
                continue
            lap_no = int(float(row.get("Lap") or 0))
            start_time = (row.get("Start time") or "").strip()

            if lap_time < LAP_MIN or lap_time > LAP_MAX:
                raw_ignored.append({"activity_id": activity_id, "date_fr": date_fr, "transponder": raw_t, "lap_time": round(lap_time, 3), "reason": "hors limites"})
                continue

            lap_index = lap_index_by_transponder_date[(raw_t, date_fr)]
            lap_index_by_transponder_date[(raw_t, date_fr)] += 1
            if is_deleted_lap(corrections, raw_t, date_fr, lap_index):
                continue

            t = canonical_transponder(raw_t, merge_map)
            base_track = infer_track(lap_time)
            lid = lap_id(activity_id, t, lap_no, start_time, lap_time)
            if lid in overrides["excluded"]:
                quality_collector["excluded_laps"].append({"lap_id": lid, "activity_id": activity_id, "date_fr": date_fr, "transponder": t, "lap_time": round(lap_time, 3), "reason": (
            overrides["excluded"].get(lid, {}).get("reason", "Exclu")
            if isinstance(overrides["excluded"].get(lid, {}), dict)
            else "Exclu admin"
        )})
                continue
            track = overrides["forced_track"].get(lid) or base_track
            pilot_name = name_map.get(t) or name_map.get(raw_t) or f"Inconnu #{t}"

            entry = {
                "activity_id": activity_id,
                "transponder": t,
                "raw_transponder": raw_t,
                "pilot_name": pilot_name,
                "date": iso_date,
                "date_fr": date_fr,
                "start_time": start_time,
                "lap_no": lap_no,
                "lap_time": round(lap_time, 3),
                "speed": (row.get("Speed") or "").replace('"', '').strip(),
                "track": track,
                "base_track": base_track,
                "lap_id": lid,
            }
            if track == "TT1/8" and SUSPECT_TT18_LOW <= lap_time < SUSPECT_TT18_HIGH:
                quality_collector["suspicious_laps"].append({
                    "lap_id": lid,
                    "activity_id": activity_id,
                    "date_fr": date_fr,
                    "pilot_name": pilot_name,
                    "pilot_slug": slugify(pilot_name + "-" + t),
                    "transponder": t,
                    "lap_no": lap_no,
                    "start_time": start_time,
                    "lap_time": round(lap_time, 3),
                    "track": track,
                    "reason": f"TT1/8 entre {SUSPECT_TT18_LOW:.0f} et {SUSPECT_TT18_HIGH:.0f} s : vérifier si TT1/10 lent",
                })
            entries.append(entry)

    quality_collector["ignored_raw_laps"].extend(raw_ignored)
    date = min((e["date"] for e in entries if e.get("date")), default=None)
    participants = []
    by_pilot: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for e in entries:
        by_pilot[e["transponder"]].append(e)

    for t, laps in by_pilot.items():
        times = [x["lap_time"] for x in laps]
        tracks = sorted({x["track"] for x in laps if x.get("track")})
        track_counts = {tr: sum(1 for x in laps if x.get("track") == tr) for tr in tracks}
        best = min(times)
        participants.append({
            "transponder": t,
            "pilot_name": laps[0]["pilot_name"],
            "pilot_slug": slugify(laps[0]["pilot_name"] + "-" + t),
            "laps_count": len(times),
            "best_lap": round(best, 3),
            "avg_lap": round(sum(times) / len(times), 3),
            "consistency": round(statistics.pstdev(times), 3) if len(times) > 1 else 0,
            "tracks": tracks,
            "track": tracks[0] if len(tracks) == 1 else "mixte",
            "track_counts": track_counts,
            "laps": sorted(laps, key=lambda x: (x["start_time"], x["lap_no"])),
        })

    participants.sort(key=lambda p: (p["best_lap"], -p["laps_count"]))
    for i, p in enumerate(participants, 1):
        p["rank"] = i

    track_counts: dict[str, int] = defaultdict(int)
    for e in entries:
        track_counts[e["track"]] += 1
    tracks = sorted(track_counts)
    best_participant = participants[0] if participants else None
    suspicious_count = sum(1 for s in quality_collector["suspicious_laps"] if s["activity_id"] == activity_id)
    unknown_count = sum(1 for p in participants if str(p["pilot_name"]).startswith("Inconnu #"))
    quality_score = max(0, 100 - suspicious_count * 5 - unknown_count * 3 - len(raw_ignored))

    return {
        "id": activity_id,
        "date": date,
        "date_fr": fmt_date_fr(date),
        "source_file": path.name,
        "pilot_count": len(participants),
        "laps_count": len(entries),
        "best_lap": best_participant["best_lap"] if best_participant else None,
        "best_pilot": best_participant["pilot_name"] if best_participant else None,
        "tracks": tracks,
        "track": tracks[0] if len(tracks) == 1 else "mixte",
        "track_counts": dict(track_counts),
        "quality_score": quality_score,
        "suspicious_laps_count": suspicious_count,
        "unknown_pilots_count": unknown_count,
        "participants": participants,
    }



def normalize_corrections(corrections):
    """Accepte plusieurs formats de corrections pilotes."""
    if not isinstance(corrections, dict):
        return {}, {}

    name_map = {}
    merge_map = {}

    for source in ("name_map", "transponders"):
        for k, v in corrections.get(source, {}).items():
            name_map[str(k).replace("/0", "").strip()] = v

    for source in ("merge_map", "names"):
        for k, v in corrections.get(source, {}).items():
            merge_map[str(k).strip()] = v

    return name_map, merge_map


def build() -> dict[str, Any]:
    corrections = load_corrections()
    pilots = load_pilots()
    overrides = load_lap_overrides()
    name_map, merge_map = build_transponder_maps(pilots, corrections)

    # Compatibilité avec corrections.json exporté depuis l'admin web
    extra_name_map, extra_merge_map = normalize_corrections(corrections)
    name_map.update(extra_name_map)
    merge_map.update(extra_merge_map)
    quality_collector = {"suspicious_laps": [], "ignored_raw_laps": [], "excluded_laps": []}

    activities = []
    for path in sorted(CSV_DIR.glob("sessions_*.csv")):
        activity = read_activity_csv(path, corrections, overrides, merge_map, name_map, quality_collector)
        if activity["laps_count"]:
            activities.append(activity)

    personal_best: dict[tuple[str, str], float] = {}
    chronological_laps = []
    for activity in activities:
        for part in activity["participants"]:
            for lap in part.get("laps", []):
                chronological_laps.append(lap)
    chronological_laps.sort(key=lambda lap: (
        lap.get("date") or "",
        lap.get("start_time") or "",
        lap.get("activity_id") or "",
        lap.get("lap_no") or 0,
    ))
    for lap in chronological_laps:
        key = (str(lap.get("transponder") or ""), str(lap.get("track") or ""))
        best = personal_best.get(key)
        if best is not None and lap["lap_time"] < best:
            lap["personal_record"] = True
        if best is None or lap["lap_time"] < best:
            personal_best[key] = lap["lap_time"]

    for activity in activities:
        for part in activity["participants"]:
            records = [lap for lap in part.get("laps", []) if lap.get("personal_record")]
            part["personal_records_count"] = len(records)
            part["has_personal_record"] = bool(records)

    pilots_index: dict[str, dict[str, Any]] = {}
    for activity in activities:
        for part in activity["participants"]:
            t = part["transponder"]
            p = pilots_index.setdefault(t, {
                "transponder": t,
                "name": part["pilot_name"],
                "slug": part["pilot_slug"],
                "activities": [],
                "total_laps": 0,
                "best_lap": None,
                "tracks": set(),
                "track_counts": defaultdict(int),
            })
            for tr, count in part.get("track_counts", {}).items():
                p["tracks"].add(tr)
                p["track_counts"][tr] += count
            p["activities"].append({
                "activity_id": activity["id"],
                "date": activity["date"],
                "date_fr": activity["date_fr"],
                "rank": part["rank"],
                "laps_count": part["laps_count"],
                "best_lap": part["best_lap"],
                "avg_lap": part["avg_lap"],
                "consistency": part["consistency"],
                "tracks": part.get("tracks", []),
                "track": part.get("track"),
                "track_counts": part.get("track_counts", {}),
            })
            p["total_laps"] += part["laps_count"]
            if p["best_lap"] is None or part["best_lap"] < p["best_lap"]:
                p["best_lap"] = part["best_lap"]

    for p in pilots_index.values():
        p["activities"].sort(key=lambda x: (x["date"] or "", x["activity_id"]), reverse=True)
        p["activities_count"] = len(p["activities"])
        bests = [a["best_lap"] for a in p["activities"] if a.get("best_lap") is not None]
        p["avg_best_lap"] = round(sum(bests) / len(bests), 3) if bests else None
        p["tracks"] = sorted(p["tracks"])
        p["track_counts"] = dict(p["track_counts"])

    pilots_list = sorted(pilots_index.values(), key=lambda p: (p["best_lap"] is None, p["best_lap"] or 9999))
    activities.sort(key=lambda a: (a["date"] or "", a["id"]), reverse=True)

    tracks_summary: dict[str, dict[str, int]] = {}
    for tr in ["TT1/8", "TT1/10"]:
        tracks_summary[tr] = {
            "laps_count": sum(a.get("track_counts", {}).get(tr, 0) for a in activities),
            "activities_count": sum(1 for a in activities if a.get("track_counts", {}).get(tr, 0) > 0),
            "pilots_count": sum(1 for p in pilots_list if p.get("track_counts", {}).get(tr, 0) > 0),
        }

    records = {"best_lap": None, "most_active": None}
    if pilots_list:
        best = min((p for p in pilots_list if p["best_lap"] is not None), key=lambda p: p["best_lap"], default=None)
        active = max(pilots_list, key=lambda p: p["total_laps"], default=None)
        records["best_lap"] = {"pilot": best["name"], "transponder": best["transponder"], "time": best["best_lap"], "slug": best["slug"]} if best else None
        records["most_active"] = {"pilot": active["name"], "transponder": active["transponder"], "laps": active["total_laps"], "slug": active["slug"]} if active else None

    unknown_pilots = [
        {"transponder": p["transponder"], "laps_count": p["total_laps"], "best_lap": p["best_lap"]}
        for p in pilots_list if str(p["name"]).startswith("Inconnu #")
    ]
    suspicious_laps = sorted(quality_collector["suspicious_laps"], key=lambda x: x["lap_time"])
    sessions_quality = sorted([
        {"id": a["id"], "date_fr": a["date_fr"], "tracks": a.get("tracks", []), "laps_count": a["laps_count"], "quality_score": a["quality_score"], "suspicious_laps_count": a["suspicious_laps_count"], "unknown_pilots_count": a["unknown_pilots_count"]}
        for a in activities
    ], key=lambda x: (x["quality_score"], -x["suspicious_laps_count"]))
    # Score proportionnel au volume de donnees. L'ancienne formule retirait
    # 0.6 point par tour suspect en valeur absolue : elle tombait a 0 des
    # 167 tours signales, quel que soit le nombre total de tours, et ne
    # distinguait donc plus un jeu de donnees sain d'un jeu catastrophique.
    total_laps = sum(a["laps_count"] for a in activities)
    suspicious_ratio = (len(suspicious_laps) / total_laps) if total_laps else 0.0
    ignored_ratio = (len(quality_collector["ignored_raw_laps"]) / total_laps) if total_laps else 0.0
    global_score = max(0, min(100, round(
        100
        - suspicious_ratio * 200   # 10% de tours suspects -> -20 points
        - len(unknown_pilots) * 2  # chaque puce non nommee -> -2 points
        - ignored_ratio * 100      # 10% de tours hors limites -> -10 points
    )))

    return {
        "schema_version": 3.5,
        # astimezone() rend l'horodatage non ambigu (ex. ...+00:00). Sans lui,
        # le front recevait une date sans fuseau : le serveur tourne en UTC mais
        # un navigateur francais l'interpretait en heure de Paris, soit 2 h dans
        # le futur - et un age de donnees negatif.
        "generated_at": datetime.now().astimezone().isoformat(timespec="seconds"),
        "club_name": CLUB_NAME,
        "source": "SpeedHive Practice 4308",
        "filters": {"lap_min": LAP_MIN, "lap_max": LAP_MAX, "tt10_limit": TT10_LIMIT},
        "summary": {
            "activities_count": len(activities),
            "pilots_count": len(pilots_list),
            "laps_count": sum(a["laps_count"] for a in activities),
            "tracks": tracks_summary,
        },
        "records": records,
        "data_quality": {
            "global_score": global_score,
            "suspicious_laps_count": len(suspicious_laps),
            "unknown_pilots_count": len(unknown_pilots),
            "ignored_raw_laps_count": len(quality_collector["ignored_raw_laps"]),
            "overrides": {
                "excluded_count": len(overrides["excluded"]),
                "forced_track_count": len(overrides["forced_track"]),
                "excluded_applied_count": len(quality_collector["excluded_laps"]),
            },
            "suspicious_laps": suspicious_laps[:500],
            "unknown_pilots": unknown_pilots[:300],
            "ignored_raw_laps": quality_collector["ignored_raw_laps"][:300],
            "excluded_laps": quality_collector["excluded_laps"][:300],
            "sessions_quality": sessions_quality[:300],
        },
        "activities": activities,
        "pilots": pilots_list,
    }


def write_atomic(target: Path, data: Any) -> None:
    """Ecrit le JSON sans jamais exposer un fichier incomplet.

    Le LXC regenere ce fichier toutes les 3 minutes pendant que son serveur web
    le sert. Avec un simple open("w"), le fichier est vide des l'ouverture puis
    se remplit sur plusieurs Mo : une page chargee pile dans cette fenetre
    recevait un JSON vide ou tronque, et affichait un dashboard a zero sans
    message d'erreur. On ecrit donc a cote, puis on remplace d'un seul coup :
    un lecteur voit soit l'ancien fichier complet, soit le nouveau.
    """
    tmp = target.with_name(target.name + ".tmp")
    with tmp.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    # os.replace est atomique sur le meme systeme de fichiers. Sous Linux - le
    # cas du serveur - il reussit meme si un lecteur a le fichier ouvert : ce
    # lecteur continue simplement sur l'ancienne version. Sous Windows en
    # revanche, remplacer un fichier ouvert leve PermissionError ; ça n'arrive
    # qu'en execution locale, on retente donc brievement avant de se rabattre
    # sur une ecriture directe plutot que d'echouer sans produire de donnees.
    for attempt in range(10):
        try:
            tmp.replace(target)
            return
        except PermissionError:
            time.sleep(0.05)

    print("ATTENTION: remplacement atomique impossible (fichier verrouille), ecriture directe.")
    with target.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    tmp.unlink(missing_ok=True)


def main() -> None:
    data = build()
    write_atomic(ROOT_OUT_FILE, data)
    q = data.get("data_quality", {})
    print(f"OK: data_v2.json généré : {ROOT_OUT_FILE}")
    print("Résumé:", data["summary"])
    print(f"Qualité: score {q.get('global_score')}/100 | suspects {q.get('suspicious_laps_count')} | inconnus {q.get('unknown_pilots_count')} | overrides exclus {q.get('overrides', {}).get('excluded_count')} | pistes forcées {q.get('overrides', {}).get('forced_track_count')}")
    if q.get("suspicious_laps_count"):
        print("ATTENTION: tours suspects détectés. Voir l’onglet Qualité/Admin du dashboard.")


if __name__ == "__main__":
    main()
