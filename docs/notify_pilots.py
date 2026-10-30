#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Envoie aux pilotes inscrits un rapport WhatsApp de leur roulage.

Deux messages possibles par journee :

1. Fin de roulage : le pilote n'a plus passe de tour depuis
   MRCP_NOTIFY_IDLE_MINUTES (15 min par defaut), donc il a range la voiture.
   Le rapport porte sur la journee complete a cet instant.
2. Resume du soir : apres MRCP_NOTIFY_DAY_HOUR, uniquement si le pilote a
   fait plusieurs relances - sinon il ferait doublon avec le message 1.

Appele a chaque passage de update_dashboard.sh (toutes les 3 min). Il doit
tourner meme quand la synchro n'a rien ramene : la fin d'un roulage se
reconnait justement a l'absence de nouveaux tours.

L'inscription des pilotes ne se fait pas ici mais dans admin_api.py, qui
recoit les messages WhatsApp entrants via le webhook WAHA.

Configuration par variables d'environnement :
- MRCP_WAHA_URL        ex. http://192.168.1.50:3000 (vide = rien n'est envoye)
- MRCP_WAHA_SESSION    defaut "default"
- MRCP_WAHA_API_KEY    cle X-Api-Key de WAHA
- MRCP_PUBLIC_BASE_URL lien vers la fiche pilote
- MRCP_NOTIFY_IDLE_MINUTES  defaut 15
- MRCP_NOTIFY_DAY_HOUR      defaut 20
- MRCP_NOTIFY_DRY_RUN=1     affiche les messages au lieu de les envoyer

Usage :
    python notify_pilots.py [--date AAAA-MM-JJ] [--dry-run] [--now HH:MM]
"""
from __future__ import annotations

import argparse
import json
import os
import unicodedata
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any

import requests

ROOT = Path(__file__).resolve().parent
DATA_FILE = ROOT / "data_v2.json"
NOTIFICATIONS_FILE = ROOT / "pilot_notifications.json"
SENT_FILE = ROOT / "daily_summary_sent.json"

WAHA_URL = os.environ.get("MRCP_WAHA_URL", "").rstrip("/")
WAHA_SESSION = os.environ.get("MRCP_WAHA_SESSION", "default")
WAHA_API_KEY = os.environ.get("MRCP_WAHA_API_KEY", "")
PUBLIC_BASE_URL = os.environ.get(
    "MRCP_PUBLIC_BASE_URL",
    "https://mrcp-dashboard.github.io/mrcp-dashboard/index_v2.html",
).rstrip("/")

IDLE_MINUTES = int(os.environ.get("MRCP_NOTIFY_IDLE_MINUTES", "15"))
DAY_HOUR = int(os.environ.get("MRCP_NOTIFY_DAY_HOUR", "20"))

# Meme longueur de serie que le dashboard (SERIES_LAP_COUNT dans app_v2_laps.js).
SERIES_LAP_COUNT = 5
# Au-dela, un envoi rate n'a plus d'interet : le pilote est rentre depuis
# longtemps. Sert surtout a ne pas spammer apres une panne de plusieurs jours.
SENT_KEEP_DAYS = 30


# --------------------------------------------------------------------------
# Lecture / ecriture
# --------------------------------------------------------------------------

def load_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def save_json(path: Path, data: Any) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def match_key(value: str) -> str:
    """Cle de comparaison des noms de pilotes, insensible a la casse et aux accents.

    Un pilote qui tape son nom dans WhatsApp n'ecrira ni les majuscules ni les
    accents comme SpeedHive les stocke.
    """
    text = unicodedata.normalize("NFD", str(value or ""))
    text = "".join(c for c in text if unicodedata.category(c) != "Mn")
    return " ".join(text.lower().split())


# --------------------------------------------------------------------------
# Lecture des tours
# --------------------------------------------------------------------------

def pilot_laps(data: dict, pilot: str, day: str | None = None) -> list[dict]:
    """Tours d'un pilote, tries dans l'ordre ou ils ont ete courus."""
    key = match_key(pilot)
    rows = []
    for activity in data.get("activities", []):
        for participant in activity.get("participants", []):
            if match_key(participant.get("pilot_name")) != key:
                continue
            for lap in participant.get("laps", []):
                if day and str(lap.get("date") or "") != day:
                    continue
                rows.append(lap)
    rows.sort(key=lambda l: (str(l.get("date") or ""), str(l.get("start_time") or "")))
    return rows


def split_runs(laps: list[dict]) -> list[list[dict]]:
    """Decoupe en relances : lap_no qui s'incremente de 1, sur la meme piste.

    Meme regle que lapSeriesRuns() cote dashboard : dans les CSV SpeedHive,
    lap_no repart a 1 a chaque remise en piste.
    """
    runs: list[list[dict]] = []
    current: list[dict] = []
    for lap in laps:
        previous = current[-1] if current else None
        if previous is not None:
            follows = (
                int(lap.get("lap_no") or 0) == int(previous.get("lap_no") or 0) + 1
                and lap.get("track") == previous.get("track")
            )
            if not follows:
                runs.append(current)
                current = []
        current.append(lap)
    if current:
        runs.append(current)
    return runs


def best_series(laps: list[dict], n: int = SERIES_LAP_COUNT) -> float | None:
    """Meilleure moyenne sur n tours qui s'enchainent, sans relance."""
    best = None
    for run in split_runs(laps):
        times = [float(l.get("lap_time") or 0) for l in run]
        if len(times) < n:
            continue
        window = sum(times[:n])
        if best is None or window / n < best:
            best = window / n
        for i in range(n, len(times)):
            window += times[i] - times[i - n]
            if window / n < best:
                best = window / n
    return best


def last_lap_moment(laps: list[dict]) -> datetime | None:
    """Horodatage de fin du dernier tour, pour juger si le pilote roule encore."""
    for lap in reversed(laps):
        stamp = f"{lap.get('date')} {lap.get('start_time')}"
        try:
            started = datetime.strptime(stamp, "%Y-%m-%d %H:%M:%S")
        except ValueError:
            continue
        # start_time est le debut du tour : la voiture est encore en piste
        # pendant sa duree.
        return started + timedelta(seconds=float(lap.get("lap_time") or 0))
    return None


def previous_best(data: dict, pilot: str, day: str, track: str) -> float | None:
    """Meilleur tour du pilote sur cette piste AVANT la journee en cours."""
    times = [
        float(l.get("lap_time"))
        for l in pilot_laps(data, pilot)
        if str(l.get("date") or "") < day and l.get("track") == track
    ]
    return min(times) if times else None


# --------------------------------------------------------------------------
# Redaction
# --------------------------------------------------------------------------

def fmt_time(value: float | None) -> str:
    return "-" if value is None else f"{float(value):.3f} s"


def profile_url(pilot: str) -> str:
    return f"{PUBLIC_BASE_URL}#/pilote/{requests.utils.quote(pilot)}"


def summarize(data: dict, pilot: str, day: str) -> dict | None:
    all_laps = pilot_laps(data, pilot, day)
    if not all_laps:
        return None

    # Tout se calcule sur une seule piste. Un TT1/10 isole au milieu d'une
    # journee de TT1/8 tourne 10 s plus vite et annoncerait un faux record :
    # le 25/10/2026, un tour a 22,354 s s'etait glisse dans une journee a
    # 33 s. On garde la piste ou il a fait le plus de tours.
    tracks: dict[str, int] = {}
    for lap in all_laps:
        tracks[str(lap.get("track") or "-")] = tracks.get(str(lap.get("track") or "-"), 0) + 1
    track = max(tracks, key=lambda t: tracks[t])
    laps = [l for l in all_laps if str(l.get("track") or "-") == track]

    times = [float(l.get("lap_time") or 0) for l in laps]
    best = min(times)
    before = previous_best(data, pilot, day, track)
    return {
        "pilot": pilot,
        "date": day,
        "laps": len(laps),
        "runs": len(split_runs(laps)),
        "best": best,
        "avg": sum(times) / len(times),
        "series": best_series(laps),
        "track": track,
        "previous_best": before,
        "gain": (before - best) if (before is not None and before > best) else None,
        # Sur tous les tours : un tour sur l'autre piste prouve qu'il roule encore.
        "last_moment": last_lap_moment(all_laps),
    }


def build_message(summary: dict, kind: str) -> str:
    day_fr = datetime.strptime(summary["date"], "%Y-%m-%d").strftime("%d/%m/%Y")
    title = "ton roulage" if kind == "run" else "ta journee"
    lines = [
        f"\U0001f3c1 MRCP - {title} du {day_fr}",
        "",
        f"Tours : {summary['laps']}" + (f" en {summary['runs']} relances" if summary["runs"] > 1 else ""),
        f"Meilleur tour : {fmt_time(summary['best'])}",
        f"Moyenne : {fmt_time(summary['avg'])}",
    ]
    if summary["series"] is not None:
        lines.append(f"Meilleure serie de {SERIES_LAP_COUNT} tours : {fmt_time(summary['series'])}")
    lines.append(f"Piste : {summary['track']}")
    if summary["gain"] is not None:
        lines.append("")
        lines.append(f"\U0001f525 Record perso battu de {summary['gain']:.3f} s (avant : {fmt_time(summary['previous_best'])})")
    elif summary["previous_best"] is not None:
        ecart = summary["best"] - summary["previous_best"]
        lines.append("")
        lines.append(f"Record perso : {fmt_time(summary['previous_best'])} ({ecart:+.3f} s aujourd'hui)")
    lines += [
        "",
        f"Ta fiche : {profile_url(summary['pilot'])}",
        "",
        "Reponds STOP pour ne plus recevoir ces messages.",
    ]
    return "\n".join(lines)


# --------------------------------------------------------------------------
# Envoi WAHA
# --------------------------------------------------------------------------

def waha_send(chat_id: str, text: str, dry_run: bool = False) -> bool:
    """Envoie un message WhatsApp. Renvoie True si WAHA l'a accepte."""
    if dry_run or not WAHA_URL:
        print(f"DRY RUN WhatsApp -> {chat_id}\n{text}\n{'-' * 40}")
        return True
    try:
        response = requests.post(
            f"{WAHA_URL}/api/sendText",
            json={"session": WAHA_SESSION, "chatId": chat_id, "text": text},
            headers={"X-Api-Key": WAHA_API_KEY} if WAHA_API_KEY else {},
            timeout=20,
        )
        if response.status_code >= 300:
            print(f"ERREUR WAHA {response.status_code} pour {chat_id} : {response.text[:200]}")
            return False
        return True
    except Exception as exc:  # reseau, WAHA eteint, session deconnectee
        print(f"ERREUR WAHA pour {chat_id} : {exc}")
        return False


# --------------------------------------------------------------------------
# Boucle principale
# --------------------------------------------------------------------------

def prune_sent(sent_map: dict, today: str) -> None:
    limit = (datetime.strptime(today, "%Y-%m-%d") - timedelta(days=SENT_KEEP_DAYS)).strftime("%Y-%m-%d")
    for key in [k for k in sent_map if k.split("|", 1)[0] < limit]:
        del sent_map[key]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--date", default=date.today().isoformat())
    parser.add_argument("--now", default="", help="Heure simulee HH:MM (tests)")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    dry_run = args.dry_run or os.environ.get("MRCP_NOTIFY_DRY_RUN") == "1"
    now = datetime.now()
    if args.now:
        now = datetime.strptime(f"{args.date} {args.now}", "%Y-%m-%d %H:%M")

    data = load_json(DATA_FILE, {})
    notifications = load_json(NOTIFICATIONS_FILE, {"pilots": {}})
    sent = load_json(SENT_FILE, {"sent": {}})
    sent_map = sent.setdefault("sent", {})

    sent_count = 0
    for pilot, cfg in notifications.get("pilots", {}).items():
        if not isinstance(cfg, dict) or not cfg.get("enabled", True):
            continue
        chat_id = str(cfg.get("whatsapp") or "").strip()
        if not chat_id:
            continue
        summary = summarize(data, pilot, args.date)
        if not summary:
            continue

        messages = []
        # 1. Fin de roulage : plus rien depuis IDLE_MINUTES.
        if summary["last_moment"] and now - summary["last_moment"] >= timedelta(minutes=IDLE_MINUTES):
            # La cle contient l'heure du dernier tour : s'il repart en piste,
            # elle change et un nouveau rapport part a la fin de la relance.
            messages.append(("run", f"{args.date}|{pilot}|run|{summary['last_moment']:%H:%M:%S}"))
        # 2. Resume du soir, seulement s'il a fait plusieurs relances.
        if now.hour >= DAY_HOUR and summary["runs"] > 1:
            messages.append(("day", f"{args.date}|{pilot}|jour"))

        for kind, key in messages:
            if sent_map.get(key):
                continue
            if waha_send(chat_id, build_message(summary, kind), dry_run):
                sent_map[key] = now.isoformat(timespec="seconds")
                sent_count += 1

    prune_sent(sent_map, args.date)
    if not dry_run:
        save_json(SENT_FILE, sent)
    print(f"Notifications : envoyees={sent_count} | inscrits={len(notifications.get('pilots', {}))}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
