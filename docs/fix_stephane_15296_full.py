import json
from pathlib import Path

FILE = Path("data_v2.json")
BAD_LAP = 15.296
BAD_NAME = "STEPHANE AUDIFAX"

def is_bad_lap(v):
    try:
        return abs(float(v) - BAD_LAP) < 0.001
    except:
        return False

def is_stephane(p):
    txt = json.dumps(p, ensure_ascii=False).upper()
    return BAD_NAME in txt or "STEPHANE" in txt or "AUDIFAX" in txt

with FILE.open("r", encoding="utf-8") as f:
    data = json.load(f)

fixed = 0

for activity in data.get("activities", []):

    # Corrige best session
    if is_bad_lap(activity.get("best_lap")) and str(activity.get("best_pilot", "")).upper() == BAD_NAME:
        activity["best_lap"] = None
        activity["best_pilot"] = "Supprimé admin"
        fixed += 1

    # Corrige participants
    for p in activity.get("participants", []):
        if not is_stephane(p):
            continue

        for key in ["best_lap", "best", "bestLap"]:
            if key in p and is_bad_lap(p.get(key)):
                p[key] = None
                fixed += 1

        if isinstance(p.get("laps"), list):
            new_laps = []
            for lap in p["laps"]:
                if isinstance(lap, dict):
                    lap_value = lap.get("lap_time") or lap.get("time") or lap.get("lap")
                    if is_bad_lap(lap_value):
                        fixed += 1
                        continue
                else:
                    if is_bad_lap(lap):
                        fixed += 1
                        continue

                new_laps.append(lap)

            p["laps"] = new_laps

# Recalcule best_lap des activités si vide/supprimé
for activity in data.get("activities", []):
    if activity.get("best_lap") not in [None, "", 0]:
        continue

    best = None
    best_pilot = None

    for p in activity.get("participants", []):
        name = (
            p.get("display_name")
            or p.get("pilot_name")
            or p.get("driver_name")
            or p.get("driver")
            or p.get("pilot")
            or p.get("name")
            or "Pilote inconnu"
        )

        for key in ["best_lap", "best", "bestLap"]:
            if key in p and p.get(key):
                try:
                    v = float(p.get(key))
                except:
                    continue

                if not best or v < best:
                    best = v
                    best_pilot = name

    if best:
        activity["best_lap"] = best
        activity["best_pilot"] = best_pilot

with FILE.open("w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print("Corrections appliquées :", fixed)
