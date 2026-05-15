from flask import Flask, jsonify
from flask_socketio import SocketIO
import json
import time
import os
from pathlib import Path
from threading import Thread

PROJECT_ROOT = Path(os.environ.get("MRCP_PROJECT_ROOT", "/opt/mrcp-dashboard"))
DOCS_DIR = Path(os.environ.get("MRCP_DOCS_DIR", str(PROJECT_ROOT / "docs")))
DATA_FILE = Path(os.environ.get("MRCP_DATA_FILE", str(DOCS_DIR / "data_v2.json")))
LIVE_HOST = os.environ.get("MRCP_LIVE_HOST", "0.0.0.0")
LIVE_PORT = int(os.environ.get("MRCP_LIVE_PORT", "5056"))
LIVE_CORS_ORIGINS = os.environ.get("MRCP_LIVE_CORS_ORIGINS", "*")

app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins=LIVE_CORS_ORIGINS)

last_signature = None


def load_data():
    if not DATA_FILE.exists():
        return {"laps": []}

    with DATA_FILE.open("r", encoding="utf-8") as f:
        return json.load(f)


def lap_seconds(lap):
    value = lap.get("lap_seconds") or lap.get("seconds") or lap.get("lap_time_seconds")

    if value is not None:
        try:
            return float(value)
        except:
            pass

    txt = str(lap.get("lap_time") or lap.get("time") or "").replace(",", ".").strip()

    try:
        return float(txt)
    except:
        return 999999


def pilot_name(lap):
    return (
        lap.get("pilot_name")
        or lap.get("driver")
        or lap.get("driver_name")
        or lap.get("name")
        or lap.get("transponder")
        or "Pilote inconnu"
    )


def activity_key(lap):
    return (
        lap.get("activity_id")
        or lap.get("activity_name")
        or lap.get("session_id")
        or lap.get("session")
        or ""
    )


def activity_label(lap):
    return (
        lap.get("activity_name")
        or lap.get("activity_id")
        or lap.get("session")
        or "Session inconnue"
    )


def latest_session_laps(data):
    laps = data.get("laps", [])

    if not laps:
        return []

    latest_activity = None

    # On prend la première activité trouvée dans data_v2.json
    # car le fichier est généralement déjà trié du plus récent au plus ancien.
    for lap in laps:
        key = activity_key(lap)
        if key:
            latest_activity = key
            break

    if not latest_activity:
        return []

    filtered = []

    for lap in laps:
        if activity_key(lap) == latest_activity:
            lap["_pilot"] = pilot_name(lap)
            lap["_seconds"] = lap_seconds(lap)
            filtered.append(lap)

    return filtered


def build_ranking(laps):
    pilots = {}

    for lap in laps:
        p = lap["_pilot"]
        sec = lap["_seconds"]

        if p not in pilots:
            pilots[p] = {
                "pilot": p,
                "best_lap": lap.get("lap_time") or lap.get("time"),
                "best_seconds": sec,
                "laps_count": 1,
                "track": lap.get("track") or "",
            }
        else:
            pilots[p]["laps_count"] += 1
            if sec < pilots[p]["best_seconds"]:
                pilots[p]["best_seconds"] = sec
                pilots[p]["best_lap"] = lap.get("lap_time") or lap.get("time")
                pilots[p]["track"] = lap.get("track") or pilots[p]["track"]

    ranking = list(pilots.values())
    ranking.sort(key=lambda x: x["best_seconds"])

    for i, row in enumerate(ranking, start=1):
        row["position"] = i

    return ranking


def build_records(laps):
    valid = [l for l in laps if l["_seconds"] < 999999]

    if not valid:
        return {}

    best = min(valid, key=lambda x: x["_seconds"])

    by_track = {}

    for lap in valid:
        track = lap.get("track") or "Non classé"

        if track not in by_track or lap["_seconds"] < by_track[track]["_seconds"]:
            by_track[track] = lap

    return {
        "best_overall": {
            "pilot": best["_pilot"],
            "lap_time": best.get("lap_time") or best.get("time"),
            "track": best.get("track") or "",
            "session": activity_label(best),
        },
        "by_track": [
            {
                "track": track,
                "pilot": lap["_pilot"],
                "lap_time": lap.get("lap_time") or lap.get("time"),
                "session": activity_label(lap),
            }
            for track, lap in by_track.items()
        ]
    }


def build_payload():
    data = load_data()
    laps = latest_session_laps(data)

    session_name = activity_label(laps[0]) if laps else "Aucune session"

    return {
        "status": "ok",
        "mode": "Dernière session MRCP",
        "session_name": session_name,
        "laps_count": len(laps),
        "latest_lap": laps[0] if laps else None,
        "ranking": build_ranking(laps),
        "records": build_records(laps),
        "laps": laps[:1000],
    }


def watcher():
    global last_signature

    while True:
        try:
            payload = build_payload()
            signature = str(payload["laps_count"]) + "_" + str(payload["latest_lap"])

            if signature != last_signature:
                last_signature = signature
                socketio.emit("live_update", payload)
                print("Live update envoyé :", payload["session_name"], payload["laps_count"], "tours")

        except Exception as e:
            print("Erreur live watcher:", e)

        time.sleep(3)


@app.route("/")
def index():
    return jsonify({
        "status": "ok",
        "service": "MRCP Live Timing V5.2",
        "mode": "Dernière session MRCP",
        "data_file": str(DATA_FILE)
    })


@app.route("/api/live")
def api_live():
    return jsonify(build_payload())


@socketio.on("connect")
def handle_connect():
    socketio.emit("live_update", build_payload())
    print("Client connecté au live timing")


if __name__ == "__main__":
    Thread(target=watcher, daemon=True).start()
    socketio.run(app, host=LIVE_HOST, port=LIVE_PORT)
