from flask import Flask, jsonify
from flask_socketio import SocketIO
import json
import time
import os
from threading import Thread
from datetime import datetime

DATA_FILE = "/opt/mrcp-dashboard/docs/data_v2.json"

app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins="*")

last_signature = None


def load_data():
    if not os.path.exists(DATA_FILE):
        return {"laps": []}

    with open(DATA_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def parse_lap_date(lap):
    raw = (
        lap.get("date")
        or lap.get("activity_date")
        or lap.get("datetime")
        or lap.get("timestamp")
        or ""
    )

    if not raw:
        return ""

    return str(raw)[:10]


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


def today_laps(data):
    today = datetime.now().strftime("%Y-%m-%d")
    laps = data.get("laps", [])

    filtered = []
    for lap in laps:
        d = parse_lap_date(lap)
        if d == today:
            lap["_pilot"] = pilot_name(lap)
            lap["_seconds"] = lap_seconds(lap)
            filtered.append(lap)

    return sorted(
        filtered,
        key=lambda x: (
            str(x.get("date") or x.get("activity_date") or ""),
            int(x.get("lap_number") or 0)
        ),
        reverse=True
    )


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
            "session": best.get("activity_name") or best.get("activity_id") or "",
        },
        "by_track": [
            {
                "track": track,
                "pilot": lap["_pilot"],
                "lap_time": lap.get("lap_time") or lap.get("time"),
                "session": lap.get("activity_name") or lap.get("activity_id") or "",
            }
            for track, lap in by_track.items()
        ]
    }


def build_payload():
    data = load_data()
    laps = today_laps(data)

    return {
        "status": "ok",
        "date": datetime.now().strftime("%Y-%m-%d"),
        "laps_count": len(laps),
        "latest_lap": laps[0] if laps else None,
        "ranking": build_ranking(laps),
        "records": build_records(laps),
        "laps": laps[:500]
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
                print("Live update envoyé :", payload["laps_count"], "tours")

        except Exception as e:
            print("Erreur live watcher:", e)

        time.sleep(3)


@app.route("/")
def index():
    return jsonify({
        "status": "ok",
        "service": "MRCP Live Timing V5.1",
        "data_file": DATA_FILE
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
    socketio.run(app, host="0.0.0.0", port=5056)
