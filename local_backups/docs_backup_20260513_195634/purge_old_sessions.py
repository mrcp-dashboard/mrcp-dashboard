#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from pathlib import Path
from datetime import datetime
import json
import re

ROOT = Path(__file__).resolve().parent
CSV_DIR = ROOT / "speedhive_csv"
META_FILE = ROOT / "speedhive_sync_meta.json"

LIMIT_DATE = datetime(2026, 4, 15)

def parse_date(value):
    if not value:
        return None

    value = str(value)

    for fmt in [
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%dT%H:%M:%S.%f",
        "%Y-%m-%d",
        "%d/%m/%Y",
    ]:
        try:
            return datetime.strptime(value[:26], fmt)
        except:
            pass

    m = re.search(r"\d{4}-\d{2}-\d{2}", value)
    if m:
        return datetime.strptime(m.group(0), "%Y-%m-%d")

    return None

meta = {}
if META_FILE.exists():
    meta = json.loads(META_FILE.read_text(encoding="utf-8"))

downloads = meta.get("downloads", {})

deleted = 0
kept = 0
unknown = 0

for csv_path in sorted(CSV_DIR.glob("sessions_*.csv")):
    activity_id = csv_path.stem.replace("sessions_", "")
    info = downloads.get(activity_id, {})

    dt = parse_date(info.get("start_time") or info.get("date") or info.get("last_seen"))

    if not dt:
        unknown += 1
        print(f"DATE INCONNUE, conservé : {csv_path.name}")
        continue

    if dt < LIMIT_DATE:
        csv_path.unlink()
        deleted += 1
        print(f"SUPPRIMÉ : {csv_path.name} | {dt.date()}")
    else:
        kept += 1

print()
print(f"Supprimés : {deleted}")
print(f"Conservés : {kept}")
print(f"Date inconnue : {unknown}")
