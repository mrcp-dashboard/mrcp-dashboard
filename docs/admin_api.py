#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
admin_api.py - API admin locale MRCP Dashboard

But :
- recevoir lap_overrides.json et corrections.json depuis le dashboard admin
- écrire les fichiers dans /opt/mrcp-dashboard/docs
- lancer build_data_v2.py
- commit/push GitHub

Installation :
  pip install flask flask-cors
  export MRCP_ADMIN_TOKEN="ton_token_secret"
  python admin_api.py

Par défaut écoute sur :
  http://0.0.0.0:5055
"""

import json
import os
import subprocess
import sys
from datetime import datetime
from pathlib import Path

from flask import Flask, request, jsonify
from flask_cors import CORS

PROJECT_ROOT = Path(os.environ.get("MRCP_PROJECT_ROOT", "/opt/mrcp-dashboard"))
DOCS_DIR = Path(os.environ.get("MRCP_DOCS_DIR", str(PROJECT_ROOT / "docs")))
TOKEN = os.environ.get("MRCP_ADMIN_TOKEN", "")
HOST = os.environ.get("MRCP_ADMIN_API_HOST", "0.0.0.0")
PORT = int(os.environ.get("MRCP_ADMIN_API_PORT", "5055"))
HISTORY_FILE = DOCS_DIR / "admin_history.json"

if not TOKEN:
    print("ATTENTION: MRCP_ADMIN_TOKEN non défini. Définis un token avant usage en production.")

app = Flask(__name__)
CORS(app)


def run_cmd(cmd, cwd=None):
    result = subprocess.run(
        cmd,
        cwd=str(cwd or DOCS_DIR),
        text=True,
        capture_output=True,
        shell=False,
    )
    return {
        "cmd": " ".join(cmd),
        "returncode": result.returncode,
        "stdout": result.stdout,
        "stderr": result.stderr,
    }


def check_auth():
    if not TOKEN:
        return False
    header = request.headers.get("X-MRCP-Admin-Token", "")
    return header == TOKEN


def correction_counts(lap_overrides, pilot_corrections):
    lap_overrides = lap_overrides if isinstance(lap_overrides, dict) else {}
    pilot_corrections = pilot_corrections if isinstance(pilot_corrections, dict) else {}
    excluded = lap_overrides.get("excluded") if isinstance(lap_overrides.get("excluded"), dict) else {}
    forced_track = lap_overrides.get("forced_track") if isinstance(lap_overrides.get("forced_track"), dict) else {}
    transponders = pilot_corrections.get("transponders") if isinstance(pilot_corrections.get("transponders"), dict) else {}
    names = pilot_corrections.get("names") if isinstance(pilot_corrections.get("names"), dict) else {}
    return {
        "excluded_laps": len(excluded),
        "forced_tracks": len(forced_track),
        "pilot_transponders": len(transponders),
        "pilot_names": len(names),
    }


def load_admin_history():
    if not HISTORY_FILE.exists():
        return []
    try:
        data = json.loads(HISTORY_FILE.read_text(encoding="utf-8"))
    except Exception:
        return []
    return data if isinstance(data, list) else []


def append_admin_history(entry):
    history = load_admin_history()
    history.insert(0, entry)
    HISTORY_FILE.write_text(
        json.dumps(history[:100], ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "ok": True,
        "service": "mrcp-admin-api",
        "docs_dir": str(DOCS_DIR),
        "token_configured": bool(TOKEN),
        "time": datetime.now().isoformat(timespec="seconds"),
    })


@app.route("/check-auth", methods=["POST"])
def check_auth_route():
    if not check_auth():
        return jsonify({"ok": False, "error": "unauthorized"}), 401
    return jsonify({"ok": True, "service": "mrcp-admin-api"})


@app.route("/admin-history", methods=["GET"])
def admin_history():
    if not check_auth():
        return jsonify({"ok": False, "error": "unauthorized"}), 401
    return jsonify({"ok": True, "history": load_admin_history()[:25]})


@app.route("/apply-corrections", methods=["POST"])
def apply_corrections():
    if not check_auth():
        return jsonify({"ok": False, "error": "unauthorized"}), 401

    payload = request.get_json(force=True, silent=True) or {}

    lap_overrides = payload.get("lap_overrides")
    pilot_corrections = payload.get("corrections")
    message = payload.get("message") or "Maj corrections admin dashboard"

    if lap_overrides is None and pilot_corrections is None:
        return jsonify({"ok": False, "error": "Aucune correction reçue"}), 400

    DOCS_DIR.mkdir(parents=True, exist_ok=True)

    written = []
    history_entry = {
        "time": datetime.now().isoformat(timespec="seconds"),
        "message": message,
        "counts": correction_counts(lap_overrides, pilot_corrections),
        "written": [],
        "status": "pending",
        "commit": "",
    }

    if lap_overrides is not None:
        path = DOCS_DIR / "lap_overrides.json"
        path.write_text(json.dumps(lap_overrides, ensure_ascii=False, indent=2), encoding="utf-8")
        written.append(str(path))

    if pilot_corrections is not None:
        path = DOCS_DIR / "corrections.json"
        path.write_text(json.dumps(pilot_corrections, ensure_ascii=False, indent=2), encoding="utf-8")
        written.append(str(path))

    commands = []

    build = run_cmd([sys.executable, "build_data_v2.py"], cwd=DOCS_DIR)
    commands.append(build)
    history_entry["written"] = written
    history_entry["status"] = "generated" if build["returncode"] == 0 else "generation_failed"

    if build["returncode"] != 0:
        append_admin_history(history_entry)
        return jsonify({
            "ok": False,
            "written": written,
            "history": history_entry,
            "error": "generation data_v2.json echouee.",
            "commands": commands,
        }), 500

    commands.append(run_cmd(["git", "add", "docs"], cwd=PROJECT_ROOT))

    # Commit seulement s'il y a des changements staged
    diff_check = run_cmd(["git", "diff", "--cached", "--quiet"], cwd=PROJECT_ROOT)
    if diff_check["returncode"] == 0:
        history_entry["status"] = "no_git_changes"
        append_admin_history(history_entry)
        return jsonify({
            "ok": True,
            "written": written,
            "history": history_entry,
            "message": "Corrections écrites mais aucun changement Git à publier.",
            "commands": commands,
        })

    commit_msg = f"{message} {datetime.now().strftime('%Y-%m-%d %H:%M')}"
    commit = run_cmd(["git", "commit", "-m", commit_msg], cwd=PROJECT_ROOT)
    commands.append(commit)
    if commit["returncode"] != 0:
        history_entry["status"] = "commit_failed"
        append_admin_history(history_entry)
        return jsonify({
            "ok": False,
            "written": written,
            "history": history_entry,
            "error": "git commit a echoue.",
            "commands": commands,
        }), 500

    commit_hash = run_cmd(["git", "rev-parse", "--short", "HEAD"], cwd=PROJECT_ROOT)
    commands.append(commit_hash)
    if commit_hash["returncode"] == 0:
        history_entry["commit"] = commit_hash["stdout"].strip()

    # Rebase avant push pour éviter rejet si cron/autre poste a poussé
    pull = run_cmd(["git", "pull", "--rebase"], cwd=PROJECT_ROOT)
    commands.append(pull)

    if pull["returncode"] != 0:
        history_entry["status"] = "pull_failed"
        append_admin_history(history_entry)
        return jsonify({
            "ok": False,
            "written": written,
            "history": history_entry,
            "error": "git pull --rebase a échoué. Résous le conflit manuellement.",
            "commands": commands,
        }), 500

    push = run_cmd(["git", "push"], cwd=PROJECT_ROOT)
    commands.append(push)

    if push["returncode"] != 0:
        history_entry["status"] = "push_failed"
        append_admin_history(history_entry)
        return jsonify({
            "ok": False,
            "written": written,
            "history": history_entry,
            "error": "git push a échoué.",
            "commands": commands,
        }), 500

    history_entry["status"] = "pushed"
    append_admin_history(history_entry)
    return jsonify({
        "ok": True,
        "written": written,
        "history": history_entry,
        "commit": history_entry["commit"],
        "message": "Corrections appliquées, data_v2.json régénéré et GitHub mis à jour.",
        "commands": commands,
    })


if __name__ == "__main__":
    app.run(host=HOST, port=PORT)
