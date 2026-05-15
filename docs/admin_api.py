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
import shutil
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
BACKUP_DIR = DOCS_DIR / "backups" / "admin"
MANAGED_JSON_FILES = ("lap_overrides.json", "corrections.json", "data_v2.json")

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


def make_admin_backup(reason, message=""):
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    backup_id = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
    target = BACKUP_DIR / backup_id
    target.mkdir(parents=True, exist_ok=False)
    files = []

    for filename in MANAGED_JSON_FILES:
        source = DOCS_DIR / filename
        if source.exists():
            shutil.copy2(source, target / filename)
            files.append(filename)

    meta = {
        "id": backup_id,
        "time": datetime.now().isoformat(timespec="seconds"),
        "reason": reason,
        "message": message,
        "files": files,
    }
    (target / "meta.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return meta


def list_admin_backups(limit=20):
    if not BACKUP_DIR.exists():
        return []
    backups = []
    for path in sorted(BACKUP_DIR.iterdir(), reverse=True):
        if not path.is_dir():
            continue
        meta_file = path / "meta.json"
        if meta_file.exists():
            try:
                meta = json.loads(meta_file.read_text(encoding="utf-8"))
            except Exception:
                meta = {}
        else:
            meta = {}
        meta["id"] = meta.get("id") or path.name
        meta["files"] = meta.get("files") if isinstance(meta.get("files"), list) else []
        backups.append(meta)
        if len(backups) >= limit:
            break
    return backups


def file_status(path):
    if not path.exists():
        return {"exists": False}
    stat = path.stat()
    return {
        "exists": True,
        "path": str(path),
        "size": stat.st_size,
        "modified": datetime.fromtimestamp(stat.st_mtime).isoformat(timespec="seconds"),
    }


def git_info():
    branch = run_cmd(["git", "branch", "--show-current"], cwd=PROJECT_ROOT)
    head = run_cmd(["git", "rev-parse", "--short", "HEAD"], cwd=PROJECT_ROOT)
    status = run_cmd(["git", "status", "--short"], cwd=PROJECT_ROOT)
    return {
        "branch": branch["stdout"].strip() if branch["returncode"] == 0 else "",
        "head": head["stdout"].strip() if head["returncode"] == 0 else "",
        "dirty": bool(status["stdout"].strip()) if status["returncode"] == 0 else True,
        "status": status["stdout"].splitlines() if status["returncode"] == 0 else [],
        "errors": [
            item["stderr"].strip()
            for item in (branch, head, status)
            if item["returncode"] != 0 and item["stderr"].strip()
        ],
    }


def restore_admin_backup_files(backup_id):
    if not backup_id or any(part in backup_id for part in ("/", "\\", "..")):
        raise ValueError("backup_id invalide")
    source_dir = BACKUP_DIR / backup_id
    if not source_dir.is_dir():
        raise FileNotFoundError("sauvegarde introuvable")

    restored = []
    for filename in MANAGED_JSON_FILES:
        source = source_dir / filename
        if source.exists():
            shutil.copy2(source, DOCS_DIR / filename)
            restored.append(filename)
    return restored


def publish_docs_changes(message, history_entry):
    commands = []
    build = run_cmd([sys.executable, "build_data_v2.py"], cwd=DOCS_DIR)
    commands.append(build)
    if build["returncode"] != 0:
        history_entry["status"] = "generation_failed"
        return commands, "generation data_v2.json echouee."

    commands.append(run_cmd(["git", "add", "docs"], cwd=PROJECT_ROOT))
    diff_check = run_cmd(["git", "diff", "--cached", "--quiet"], cwd=PROJECT_ROOT)
    if diff_check["returncode"] == 0:
        history_entry["status"] = "no_git_changes"
        return commands, ""

    commit_msg = f"{message} {datetime.now().strftime('%Y-%m-%d %H:%M')}"
    commit = run_cmd(["git", "commit", "-m", commit_msg], cwd=PROJECT_ROOT)
    commands.append(commit)
    if commit["returncode"] != 0:
        history_entry["status"] = "commit_failed"
        return commands, "git commit a echoue."

    commit_hash = run_cmd(["git", "rev-parse", "--short", "HEAD"], cwd=PROJECT_ROOT)
    commands.append(commit_hash)
    if commit_hash["returncode"] == 0:
        history_entry["commit"] = commit_hash["stdout"].strip()

    pull = run_cmd(["git", "pull", "--rebase"], cwd=PROJECT_ROOT)
    commands.append(pull)
    if pull["returncode"] != 0:
        history_entry["status"] = "pull_failed"
        return commands, "git pull --rebase a echoue. Resous le conflit manuellement."

    push = run_cmd(["git", "push"], cwd=PROJECT_ROOT)
    commands.append(push)
    if push["returncode"] != 0:
        history_entry["status"] = "push_failed"
        return commands, "git push a echoue."

    history_entry["status"] = "pushed"
    return commands, ""


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


@app.route("/admin-backups", methods=["GET"])
def admin_backups():
    if not check_auth():
        return jsonify({"ok": False, "error": "unauthorized"}), 401
    return jsonify({"ok": True, "backups": list_admin_backups()})


@app.route("/admin-status", methods=["GET"])
def admin_status():
    if not check_auth():
        return jsonify({"ok": False, "error": "unauthorized"}), 401
    history = load_admin_history()
    backups = list_admin_backups()
    return jsonify({
        "ok": True,
        "service": "mrcp-admin-api",
        "time": datetime.now().isoformat(timespec="seconds"),
        "project_root": str(PROJECT_ROOT),
        "docs_dir": str(DOCS_DIR),
        "token_configured": bool(TOKEN),
        "git": git_info(),
        "files": {
            "data_v2": file_status(DOCS_DIR / "data_v2.json"),
            "lap_overrides": file_status(DOCS_DIR / "lap_overrides.json"),
            "corrections": file_status(DOCS_DIR / "corrections.json"),
            "admin_history": file_status(HISTORY_FILE),
        },
        "history_count": len(history),
        "backup_count": len(backups),
        "latest_history": history[0] if history else None,
        "latest_backup": backups[0] if backups else None,
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
    backup = make_admin_backup("before_apply", message)
    history_entry = {
        "time": datetime.now().isoformat(timespec="seconds"),
        "message": message,
        "counts": correction_counts(lap_overrides, pilot_corrections),
        "written": [],
        "status": "pending",
        "commit": "",
        "backup": backup,
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

@app.route("/restore-backup", methods=["POST"])
def restore_backup():
    if not check_auth():
        return jsonify({"ok": False, "error": "unauthorized"}), 401

    payload = request.get_json(force=True, silent=True) or {}
    backup_id = str(payload.get("backup_id") or "")
    message = payload.get("message") or f"Restaure sauvegarde admin {backup_id}"

    try:
        safety_backup = make_admin_backup("before_restore", message)
        restored = restore_admin_backup_files(backup_id)
    except (FileNotFoundError, ValueError) as exc:
        return jsonify({"ok": False, "error": str(exc)}), 400

    if not restored:
        return jsonify({"ok": False, "error": "Aucun fichier restaurable dans cette sauvegarde."}), 400

    history_entry = {
        "time": datetime.now().isoformat(timespec="seconds"),
        "message": message,
        "counts": {},
        "written": restored,
        "status": "pending",
        "commit": "",
        "backup": safety_backup,
        "restored_backup": backup_id,
    }
    commands, error = publish_docs_changes(message, history_entry)
    append_admin_history(history_entry)

    if error:
        return jsonify({
            "ok": False,
            "restored": restored,
            "history": history_entry,
            "error": error,
            "commands": commands,
        }), 500

    return jsonify({
        "ok": True,
        "restored": restored,
        "history": history_entry,
        "commit": history_entry["commit"],
        "message": "Sauvegarde restauree, data_v2.json regenere et GitHub mis a jour.",
        "commands": commands,
    })


if __name__ == "__main__":
    app.run(host=HOST, port=PORT)
