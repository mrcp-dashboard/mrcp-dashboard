#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent

LOCATION_ID = 4308
API_BASE = "https://practice-api.speedhive.com/api/v1"

CSV_DIR = ROOT / "speedhive_csv"
META_FILE = ROOT / "speedhive_sync_meta.json"
LOG_FILE = ROOT / "speedhive_sync.log"

LIMIT_DATE = datetime(2026, 4, 15)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
    "Accept": "application/json,text/plain,*/*",
    "Referer": "https://speedhive.mylaps.com/",
    "Origin": "https://speedhive.mylaps.com",
}


def log(message):
    line = f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {message}"
    print(line)
    with LOG_FILE.open("a", encoding="utf-8") as f:
        f.write(line + "\n")


def load_meta():
    if META_FILE.exists():
        try:
            return json.loads(META_FILE.read_text(encoding="utf-8"))
        except Exception:
            return {}
    return {}


def save_meta(meta):
    META_FILE.write_text(
        json.dumps(meta, ensure_ascii=False, indent=2),
        encoding="utf-8"
    )


def parse_activity_date(activity):
    raw = (
        activity.get("startTime")
        or activity.get("start_time")
        or activity.get("date")
        or activity.get("createdAt")
        or activity.get("created_at")
    )

    if not raw:
        return None

    raw = str(raw).replace("Z", "")

    try:
        return datetime.fromisoformat(raw).replace(tzinfo=None)
    except Exception:
        pass

    for fmt in [
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%d",
        "%d/%m/%Y",
    ]:
        try:
            return datetime.strptime(raw[:19], fmt)
        except Exception:
            pass

    return None


def get_activities(limit=200):
    url = f"{API_BASE}/locations/{LOCATION_ID}/activities?count={limit}&offset=0"

    response = requests.get(
        url,
        headers=HEADERS,
        timeout=30
    )

    response.raise_for_status()

    data = response.json()

    return data.get("activities", [])


def activity_label(activity):
    label = (
        activity.get("chipLabel")
        or activity.get("name")
        or activity.get("title")
        or activity.get("id")
        or "activité"
    )

    return str(label).strip()


def download_csv(activity, force=False):
    activity_id = str(activity.get("id", "")).strip()

    if not activity_id:
        return None

    output = CSV_DIR / f"sessions_{activity_id}.csv"

    if output.exists() and output.stat().st_size > 80 and not force:
        return output

    url = f"{API_BASE}/training/activities/{activity_id}/sessions?format=csv"

    response = requests.get(
        url,
        headers=HEADERS,
        timeout=45
    )

    response.raise_for_status()

    content = response.content or b""
    lowered = content[:200].lower()

    if len(content) < 80:
        return None

    if b"<html" in lowered or b"<!doctype" in lowered:
        return None

    output.write_bytes(content)

    return output


def main():
    parser = argparse.ArgumentParser()

    parser.add_argument(
        "--limit",
        type=int,
        default=200,
        help="Nombre d'activités à récupérer"
    )

    parser.add_argument(
        "--force",
        action="store_true",
        help="Retélécharge les CSV même s'ils existent déjà"
    )

    args = parser.parse_args()

    CSV_DIR.mkdir(exist_ok=True)

    log("=" * 70)
    log("SYNC SPEEDHIVE LINUX")
    log("=" * 70)
    log(f"Filtre actif : sessions à partir du {LIMIT_DATE.date()}")

    try:
        activities = get_activities(args.limit)
    except Exception as exc:
        log(f"ERREUR API SpeedHive : {exc}")
        return 1

    log(f"Activités récupérées : {len(activities)}")

    meta = load_meta()

    meta.setdefault("location_id", LOCATION_ID)
    meta.setdefault("downloads", {})

    downloaded = 0
    skipped = 0
    failed = 0
    ignored_old = 0
    unknown_date = 0

    for activity in activities:
        activity_id = str(activity.get("id", "")).strip()
        label = activity_label(activity)
        start_time = (
            activity.get("startTime")
            or activity.get("start_time")
            or activity.get("date")
            or ""
        )

        activity_date = parse_activity_date(activity)

        if activity_date and activity_date < LIMIT_DATE:
            ignored_old += 1
            log(f"Ignoré ancien : {activity_id} | {label} | {activity_date.date()}")
            continue

        if not activity_date:
            unknown_date += 1
            log(f"Date inconnue, conservé : {activity_id} | {label}")

        try:
            before_exists = (CSV_DIR / f"sessions_{activity_id}.csv").exists()

            path = download_csv(
                activity,
                force=args.force
            )

            if path:
                if before_exists and not args.force:
                    skipped += 1
                    log(f"Déjà présent : {path.name} | {label}")
                else:
                    downloaded += 1
                    log(f"Téléchargé : {path.name} | {label}")

                meta["downloads"][activity_id] = {
                    "activity_id": activity_id,
                    "label": label,
                    "start_time": start_time,
                    "csv": path.name,
                    "last_seen": datetime.now().isoformat(timespec="seconds"),
                }

            else:
                failed += 1
                log(f"Pas de CSV exploitable : {activity_id} | {label}")

        except Exception as exc:
            failed += 1
            log(f"Erreur téléchargement {activity_id} | {label} : {exc}")

    meta["last_sync"] = datetime.now().isoformat(timespec="seconds")

    meta["last_summary"] = {
        "activities": len(activities),
        "downloaded": downloaded,
        "skipped": skipped,
        "failed": failed,
        "ignored_old": ignored_old,
        "unknown_date": unknown_date,
        "limit_date": LIMIT_DATE.date().isoformat(),
    }

    save_meta(meta)

    log("-" * 70)
    log(
        "Résumé : "
        f"téléchargés={downloaded} | "
        f"déjà présents={skipped} | "
        f"anciens ignorés={ignored_old} | "
        f"dates inconnues={unknown_date} | "
        f"échecs/vides={failed}"
    )
    log(f"Dossier CSV : {CSV_DIR}")
    log("=" * 70)

    return 0


if __name__ == "__main__":
    sys.exit(main())