#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Envoie un resume quotidien aux pilotes ayant active les emails.

Configuration SMTP par variables d'environnement :
- MRCP_SMTP_HOST
- MRCP_SMTP_PORT, defaut 587
- MRCP_SMTP_USER
- MRCP_SMTP_PASSWORD
- MRCP_EMAIL_FROM, defaut MRCP_SMTP_USER
- MRCP_PUBLIC_BASE_URL, optionnel pour les liens
- MRCP_EMAIL_DRY_RUN=1 pour simuler
"""

import argparse
import json
import os
import smtplib
import ssl
from collections import defaultdict
from datetime import date, datetime
from email.message import EmailMessage
from pathlib import Path


ROOT = Path(__file__).resolve().parent
DATA_FILE = ROOT / "data_v2.json"
NOTIFICATIONS_FILE = ROOT / "pilot_notifications.json"
SENT_FILE = ROOT / "daily_summary_sent.json"


def load_json(path, default):
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def save_json(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def date_key(value):
    text = str(value or "").strip()
    if len(text) >= 10 and text[4:5] == "-" and text[7:8] == "-":
        return text[:10]
    if len(text) == 10 and text[2:3] in ("-", "/") and text[5:6] in ("-", "/"):
        return f"{text[6:10]}-{text[3:5]}-{text[0:2]}"
    return ""


def seconds(value):
    try:
        return float(value)
    except Exception:
        return None


def iter_laps(data):
    for activity in data.get("activities", []):
        activity_id = str(activity.get("id") or activity.get("activity_id") or "")
        session_name = activity.get("name") or activity.get("date_fr") or activity.get("date") or activity_id
        session_date = activity.get("date") or activity.get("session_date") or ""
        for participant in activity.get("participants", []):
            pilot = participant.get("pilot_name") or participant.get("name") or participant.get("driver") or ""
            transponder = participant.get("transponder") or ""
            for lap in participant.get("laps", []):
                lap_time = seconds(lap.get("lap_time") or lap.get("time") or lap.get("seconds"))
                if lap_time is None:
                    continue
                yield {
                    "activity_id": activity_id,
                    "session_name": session_name,
                    "date": lap.get("date") or session_date,
                    "pilot": pilot,
                    "transponder": transponder,
                    "track": lap.get("track") or participant.get("track") or activity.get("track") or "-",
                    "lap_time": lap_time,
                }


def summarize_pilot_day(data, pilot, day):
    rows = [
        lap for lap in iter_laps(data)
        if lap["pilot"] == pilot and date_key(lap["date"] or lap["session_name"]) == day
    ]
    if not rows:
        return None

    best = min(rows, key=lambda x: x["lap_time"])
    avg = sum(x["lap_time"] for x in rows) / len(rows)
    tracks = sorted({str(x["track"]) for x in rows if x.get("track")})
    sessions = sorted({str(x["activity_id"] or x["session_name"]) for x in rows})

    return {
        "pilot": pilot,
        "date": day,
        "laps": len(rows),
        "best": best["lap_time"],
        "avg": avg,
        "tracks": tracks,
        "sessions": sessions,
    }


def fmt_time(value):
    return f"{float(value):.3f} s"


def build_message(summary, email, profile_url):
    subject = f"Resume MRCP du {summary['date']} - {summary['pilot']}"
    tracks = " / ".join(summary["tracks"]) or "-"
    body = f"""Bonjour,

Voici ton resume MRCP du {summary['date']} :

Pilote : {summary['pilot']}
Tours : {summary['laps']}
Meilleur tour : {fmt_time(summary['best'])}
Moyenne : {fmt_time(summary['avg'])}
Piste(s) : {tracks}
Sessions detectees : {len(summary['sessions'])}

Fiche pilote :
{profile_url or os.environ.get('MRCP_PUBLIC_BASE_URL', '').strip()}

Sportivement,
MRCP Dashboard

Pour ne plus recevoir ces emails, contacte l'administrateur du dashboard.
"""
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = os.environ.get("MRCP_EMAIL_FROM") or os.environ.get("MRCP_SMTP_USER") or "MRCP Dashboard"
    msg["To"] = email
    msg.set_content(body)
    return msg


def send_email(message):
    host = os.environ.get("MRCP_SMTP_HOST", "").strip()
    port = int(os.environ.get("MRCP_SMTP_PORT", "587"))
    user = os.environ.get("MRCP_SMTP_USER", "").strip()
    password = os.environ.get("MRCP_SMTP_PASSWORD", "")

    if not host or os.environ.get("MRCP_EMAIL_DRY_RUN") == "1":
        print(f"DRY RUN email -> {message['To']} | {message['Subject']}")
        return

    context = ssl.create_default_context()
    with smtplib.SMTP(host, port, timeout=30) as smtp:
        smtp.starttls(context=context)
        if user:
            smtp.login(user, password)
        smtp.send_message(message)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--date", default=date.today().isoformat())
    args = parser.parse_args()

    data = load_json(DATA_FILE, {})
    notifications = load_json(NOTIFICATIONS_FILE, {"pilots": {}})
    sent = load_json(SENT_FILE, {"sent": {}})
    sent_map = sent.setdefault("sent", {})

    sent_count = 0
    skipped = 0

    for pilot, cfg in notifications.get("pilots", {}).items():
        if not isinstance(cfg, dict) or not cfg.get("enabled", True):
            continue
        email = str(cfg.get("email") or "").strip()
        if not email:
            continue
        sent_key = f"{args.date}|{pilot}|{email}"
        if sent_map.get(sent_key):
            skipped += 1
            continue
        summary = summarize_pilot_day(data, pilot, args.date)
        if not summary:
            skipped += 1
            continue
        message = build_message(summary, email, cfg.get("profile_url") or "")
        send_email(message)
        sent_map[sent_key] = datetime.now().isoformat(timespec="seconds")
        sent_count += 1

    save_json(SENT_FILE, sent)
    print(f"Termine : envoyes={sent_count} | ignores={skipped}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
