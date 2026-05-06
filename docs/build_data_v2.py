#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Build data_v2.json for MRCP SpeedHive dashboard.
Place this file at the root of the project, next to speedhive_csv/ and corrections.json.
Run: python build_data_v2.py
"""
from __future__ import annotations

import csv
import json
import math
import re
import statistics
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent
CSV_DIR = ROOT / "speedhive_csv"
OUT_DIR = ROOT / "speedhive_reports"
CORRECTIONS_FILE = ROOT / "corrections.json"
PILOTS_FILE = ROOT / "speedhive_pilots.json"
LAP_OVERRIDES_FILE = ROOT / "lap_overrides.json"
OUT_FILE = OUT_DIR / "data_v2.json"

LAP_MIN = 15.0
LAP_MAX = 120.0
CLUB_NAME = "Mini Racing Club Palois"


def slugify(value: str) -> str:
    value = value.strip().lower()
    value = re.sub(r"[^a-z0-9àâäéèêëîïôöùûüçñ]+", "-", value, flags=re.I)
    return value.strip("-") or "inconnu"


def parse_laptime(value: str | None) -> float | None:
    if not value:
        return None
    value = value.strip().replace('"', '')
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


def infer_track_from_seconds(seconds: float | None) -> str | None:
    """Règle MRCP : < 30 s = piste TT1/10, >= 30 s = piste TT1/8."""
    if seconds is None:
        return None
    return "TT1/10" if float(seconds) < 30.0 else "TT1/8"


def lap_key(activity_id: str, transponder: str, lap_no: int, start_time: str, lap_time: float) -> str:
    """Même identifiant que l'interface admin JS."""
    return "|".join([
        str(activity_id),
        str(transponder).strip(),
        str(lap_no if lap_no is not None else ""),
        str(start_time or ""),
        f"{float(lap_time):.3f}",
    ])


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
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def load_pilots() -> dict[str, str]:
    data = load_json(PILOTS_FILE, {})
    if isinstance(data, dict):
        return {str(k): str(v) for k, v in data.items()}
    return {}


def load_corrections() -> dict[str, Any]:
    return load_json(CORRECTIONS_FILE, {
        "deleted_laps": [],
        "edited_laps": [],
        "merged_transponders": [],
        "renamed_transponders": []
    })


def load_lap_overrides() -> dict[str, Any]:
    data = load_json(LAP_OVERRIDES_FILE, {"excluded": {}, "forced_track": {}})
    if not isinstance(data, dict):
        return {"excluded": {}, "forced_track": {}}
    return {
        "excluded": data.get("excluded", {}) if isinstance(data.get("excluded", {}), dict) else {},
        "forced_track": data.get("forced_track", {}) if isinstance(data.get("forced_track", {}), dict) else {},
    }


def build_transponder_maps(pilots: dict[str, str], corrections: dict[str, Any]) -> tuple[dict[str, str], dict[str, str]]:
    name_by_transponder = dict(pilots)
    canonical_by_transponder: dict[str, str] = {}

    for item in corrections.get("renamed_transponders", []):
        t = str(item.get("transponder", "")).strip()
        name = str(item.get("name", "")).strip()
        if t and name:
            name_by_transponder[t] = name

    for item in corrections.get("merged_transponders", []):
        source = str(item.get("source", item.get("from", ""))).strip()
        target = str(item.get("target", item.get("to", ""))).strip()
        if source and target:
            canonical_by_transponder[source] = target

    return name_by_transponder, canonical_by_transponder


def canonical_transponder(t: str, merge_map: dict[str, str]) -> str:
    seen = set()
    while t in merge_map and t not in seen:
        seen.add(t)
        t = merge_map[t]
    return t


def is_deleted_lap(corrections: dict[str, Any], transponder: str, date_fr: str, lap_index: int) -> bool:
    for item in corrections.get("deleted_laps", []):
        if str(item.get("transponder")) == transponder and str(item.get("date")) == date_fr and int(item.get("lap_index", -1)) == lap_index:
            return True
    return False


def read_activity_csv(path: Path, corrections: dict[str, Any], lap_overrides: dict[str, Any], merge_map: dict[str, str], name_map: dict[str, str]) -> dict[str, Any]:
    activity_id = path.stem.replace("sessions_", "")
    entries: list[dict[str, Any]] = []
    lap_index_by_transponder_date: dict[tuple[str, str], int] = defaultdict(int)

    with path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            raw_t = (row.get("Transponder") or "").strip()
            if not raw_t:
                continue
            iso_date = parse_date(row.get("Date"))
            date_fr = fmt_date_fr(iso_date)
            lap_time = parse_laptime(row.get("Laptime") or row.get("MRCP"))
            if lap_time is None or not (LAP_MIN <= lap_time <= LAP_MAX):
                continue
            lap_index = lap_index_by_transponder_date[(raw_t, date_fr)]
            lap_index_by_transponder_date[(raw_t, date_fr)] += 1
            if is_deleted_lap(corrections, raw_t, date_fr, lap_index):
                continue

            t = canonical_transponder(raw_t, merge_map)
            start_time = (row.get("Start time") or "").strip()
            lap_no = int(float(row.get("Lap") or 0))
            lap_time = round(lap_time, 3)
            lap_id = lap_key(activity_id, t, lap_no, start_time, lap_time)

            # Corrections admin définitives : exclusion ou piste forcée.
            if lap_id in lap_overrides.get("excluded", {}):
                continue
            track = lap_overrides.get("forced_track", {}).get(lap_id) or infer_track_from_seconds(lap_time)

            entries.append({
                "activity_id": activity_id,
                "lap_id": lap_id,
                "transponder": t,
                "raw_transponder": raw_t,
                "pilot_name": name_map.get(t) or name_map.get(raw_t) or f"Inconnu #{t}",
                "date": iso_date,
                "date_fr": date_fr,
                "start_time": start_time,
                "lap_no": lap_no,
                "lap_time": lap_time,
                "track": track,
                "speed": (row.get("Speed") or "").replace('"', '').strip(),
            })

    date = min((e["date"] for e in entries if e.get("date")), default=None)
    participants = []
    by_pilot: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for e in entries:
        by_pilot[e["transponder"]].append(e)

    for t, laps in by_pilot.items():
        times = [x["lap_time"] for x in laps]
        best = min(times)
        tracks = sorted({x.get("track") for x in laps if x.get("track")})
        participants.append({
            "transponder": t,
            "pilot_name": laps[0]["pilot_name"],
            "pilot_slug": slugify(laps[0]["pilot_name"]),
            "track": tracks[0] if len(tracks) == 1 else "mixte",
            "tracks": tracks,
            "laps_count": len(times),
            "best_lap": round(best, 3),
            "avg_lap": round(sum(times) / len(times), 3),
            "consistency": round(statistics.pstdev(times), 3) if len(times) > 1 else 0,
            "laps": sorted(laps, key=lambda x: (x["start_time"], x["lap_no"])),
        })

    participants.sort(key=lambda p: (p["best_lap"], -p["laps_count"]))
    for i, p in enumerate(participants, 1):
        p["rank"] = i

    best_participant = participants[0] if participants else None
    activity_tracks = sorted({e.get("track") for e in entries if e.get("track")})
    return {
        "id": activity_id,
        "date": date,
        "track": activity_tracks[0] if len(activity_tracks) == 1 else "mixte",
        "tracks": activity_tracks,
        "date_fr": fmt_date_fr(date),
        "source_file": path.name,
        "pilot_count": len(participants),
        "laps_count": len(entries),
        "best_lap": best_participant["best_lap"] if best_participant else None,
        "best_pilot": best_participant["pilot_name"] if best_participant else None,
        "participants": participants,
    }


def build() -> dict[str, Any]:
    corrections = load_corrections()
    lap_overrides = load_lap_overrides()
    pilots = load_pilots()
    name_map, merge_map = build_transponder_maps(pilots, corrections)

    activities = []
    for path in sorted(CSV_DIR.glob("sessions_*.csv")):
        activity = read_activity_csv(path, corrections, lap_overrides, merge_map, name_map)
        if activity["laps_count"]:
            activities.append(activity)

    # Index pilote : toutes les sessions de roulage d'un pilote, pas seulement agrégé par jour.
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
            })
            p["activities"].append({
                "activity_id": activity["id"],
                "date": activity["date"],
                "date_fr": activity["date_fr"],
                "rank": part["rank"],
                "track": part.get("track"),
                "tracks": part.get("tracks", []),
                "laps_count": part["laps_count"],
                "best_lap": part["best_lap"],
                "avg_lap": part["avg_lap"],
                "consistency": part["consistency"],
            })
            p["total_laps"] += part["laps_count"]
            if p["best_lap"] is None or part["best_lap"] < p["best_lap"]:
                p["best_lap"] = part["best_lap"]

    for p in pilots_index.values():
        p["activities"].sort(key=lambda x: (x["date"] or "", x["activity_id"]), reverse=True)
        p["activities_count"] = len(p["activities"])
        bests = [a["best_lap"] for a in p["activities"] if a.get("best_lap") is not None]
        p["avg_best_lap"] = round(sum(bests) / len(bests), 3) if bests else None

    pilots_list = sorted(pilots_index.values(), key=lambda p: (p["best_lap"] is None, p["best_lap"] or 9999))
    activities.sort(key=lambda a: (a["date"] or "", a["id"]), reverse=True)

    records = {
        "best_lap": None,
        "most_active": None,
    }
    if pilots_list:
        best = min((p for p in pilots_list if p["best_lap"] is not None), key=lambda p: p["best_lap"], default=None)
        active = max(pilots_list, key=lambda p: p["total_laps"], default=None)
        records["best_lap"] = {"pilot": best["name"], "transponder": best["transponder"], "time": best["best_lap"], "slug": best["slug"]} if best else None
        records["most_active"] = {"pilot": active["name"], "transponder": active["transponder"], "laps": active["total_laps"], "slug": active["slug"]} if active else None

    return {
        "schema_version": 2,
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "club_name": CLUB_NAME,
        "source": "SpeedHive Practice 4308",
        "filters": {"lap_min": LAP_MIN, "lap_max": LAP_MAX, "track_rule": "TT1/10 < 30s, TT1/8 >= 30s"},
        "admin_overrides": {
            "excluded_laps_count": len(lap_overrides.get("excluded", {})),
            "forced_track_count": len(lap_overrides.get("forced_track", {})),
        },
        "summary": {
            "activities_count": len(activities),
            "pilots_count": len(pilots_list),
            "laps_count": sum(a["laps_count"] for a in activities),
        },
        "records": records,
        "activities": activities,
        "pilots": pilots_list,
    }


def main() -> None:
    OUT_DIR.mkdir(exist_ok=True)
    data = build()
    with OUT_FILE.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"OK: {OUT_FILE} créé")
    print(data["summary"])


if __name__ == "__main__":
    main()
