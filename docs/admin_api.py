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
from datetime import datetime
from pathlib import Path

from flask import Flask, request, jsonify
from flask_cors import CORS

PROJECT_ROOT = Path(os.environ.get("MRCP_PROJECT_ROOT", "/opt/mrcp-dashboard"))
DOCS_DIR = Path(os.environ.get("MRCP_DOCS_DIR", str(PROJECT_ROOT / "docs")))
TOKEN = os.environ.get("MRCP_ADMIN_TOKEN", "")

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


@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "ok": True,
        "service": "mrcp-admin-api",
        "docs_dir": str(DOCS_DIR),
        "token_configured": bool(TOKEN),
        "time": datetime.now().isoformat(timespec="seconds"),
    })


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

    if lap_overrides is not None:
        path = DOCS_DIR / "lap_overrides.json"
        path.write_text(json.dumps(lap_overrides, ensure_ascii=False, indent=2), encoding="utf-8")
        written.append(str(path))

    if pilot_corrections is not None:
        path = DOCS_DIR / "corrections.json"
        path.write_text(json.dumps(pilot_corrections, ensure_ascii=False, indent=2), encoding="utf-8")
        written.append(str(path))

    commands = []

    commands.append(run_cmd(["python", "build_data_v2.py"], cwd=DOCS_DIR))

    commands.append(run_cmd(["git", "add", "docs"], cwd=PROJECT_ROOT))

    # Commit seulement s'il y a des changements staged
    diff_check = run_cmd(["git", "diff", "--cached", "--quiet"], cwd=PROJECT_ROOT)
    if diff_check["returncode"] == 0:
        return jsonify({
            "ok": True,
            "written": written,
            "message": "Corrections écrites mais aucun changement Git à publier.",
            "commands": commands,
        })

    commit_msg = f"{message} {datetime.now().strftime('%Y-%m-%d %H:%M')}"
    commands.append(run_cmd(["git", "commit", "-m", commit_msg], cwd=PROJECT_ROOT))

    # Rebase avant push pour éviter rejet si cron/autre poste a poussé
    pull = run_cmd(["git", "pull", "--rebase"], cwd=PROJECT_ROOT)
    commands.append(pull)

    if pull["returncode"] != 0:
        return jsonify({
            "ok": False,
            "written": written,
            "error": "git pull --rebase a échoué. Résous le conflit manuellement.",
            "commands": commands,
        }), 500

    push = run_cmd(["git", "push"], cwd=PROJECT_ROOT)
    commands.append(push)

    if push["returncode"] != 0:
        return jsonify({
            "ok": False,
            "written": written,
            "error": "git push a échoué.",
            "commands": commands,
        }), 500

    return jsonify({
        "ok": True,
        "written": written,
        "message": "Corrections appliquées, data_v2.json régénéré et GitHub mis à jour.",
        "commands": commands,
    })


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("MRCP_ADMIN_API_PORT", "5055")))
