#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from pathlib import Path
from datetime import datetime
import json
import re

ROOT = Path(__file__).resolve().parent
CSV_DIR = ROOT / "speedhive_csv"
META_FILE = ROOT / "speedhive_sync_meta.json"
LIMIT = datetime(2026, 4, 15)

def parse_date(value):
    if not value:
        return None

    value = str(value).replace("Z", "")

    try:
        return datetime.fromisoformat(value).replace(tzinfo=None)
    except:
        pass

    m = re.search(r"20\d{2}-\d{2}-\d{2}", value)
    if m:
        return datetime.strptime(m.group(0), "%Y-%m-%d")

    return None

meta = json.loads(META_FILE.read_text(encoding="utf-8"))
downloads = meta.get("downloads", {})

deleted = 0
kept = 0
unknown = 0

for path in sorted(CSV_DIR.glob("sessions_*.csv")):
    activity_id = path.stem.replace("sessions_", "")
    info = downloads.get(activity_id, {})

    dt = parse_date(
        info.get("start_time")
        or info.get("date")
        or info.get("created_at")
        or info.get("last_seen")
    )

    if not dt:
        unknown += 1
        print("DATE INCONNUE, conservé :", path.name)
        continue

    if dt < LIMIT:
        print("SUPPRIMÉ :", path.name, "|", dt.date())
        path.unlink()
        deleted += 1
    else:
        kept += 1

print()
print("Supprimés :", deleted)
print("Conservés :", kept)
print("Inconnus :", unknown)
