import json
from pathlib import Path

DATA = Path("/opt/mrcp-dashboard/docs/data_v2.json")

BAD_PILOT = "Stephane Audifax"
BAD_LAP = 15.296

with open(DATA, "r", encoding="utf-8") as f:
    data = json.load(f)

removed = 0

for activity in data.get("activities", []):

    # -------------------------
    # BEST LAP ACTIVITE
    # -------------------------

    if (
        activity.get("best_pilot") == BAD_PILOT
        and abs(float(activity.get("best_lap", 0)) - BAD_LAP) < 0.001
    ):
        activity["best_lap"] = None
        activity["best_pilot"] = "Supprimé admin"

    # -------------------------
    # PARTICIPANTS
    # -------------------------

    for p in activity.get("participants", []):

        names = [
            p.get("name"),
            p.get("pilot"),
            p.get("driver"),
            p.get("pilot_name"),
            p.get("display_name")
        ]

        if BAD_PILOT not in [str(x) for x in names]:
            continue

        # best lap pilote
        if p.get("best_lap"):

            try:
                if abs(float(p["best_lap"]) - BAD_LAP) < 0.001:
                    p["best_lap"] = None
                    removed += 1
            except:
                pass

        # laps détaillés
        if isinstance(p.get("laps"), list):

            new_laps = []

            for lap in p["laps"]:

                try:
                    lap_time = float(lap)
                except:
                    try:
                        lap_time = float(lap.get("lap_time"))
                    except:
                        new_laps.append(lap)
                        continue

                if abs(lap_time - BAD_LAP) < 0.001:
                    removed += 1
                    continue

                new_laps.append(lap)

            p["laps"] = new_laps

# -------------------------
# SAVE
# -------------------------

with open(DATA, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print(f"OK tours supprimés : {removed}")
print("15.296s de Stephane Audifax supprimé")
