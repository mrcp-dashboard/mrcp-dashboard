#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Validation minimale du fichier data_v2.json avant publication."""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent
DATA_FILE = ROOT / "data_v2.json"
REPORT_DATA_FILE = ROOT / "speedhive_reports" / "data_v2.json"


def fail(message: str) -> int:
    print(f"ERREUR validation data: {message}", file=sys.stderr)
    return 1


def load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def validate_payload(data: Any, source: Path) -> int:
    if not isinstance(data, dict):
        return fail(f"{source} ne contient pas un objet JSON")

    required = ("schema_version", "generated_at", "summary", "activities", "pilots")
    missing = [key for key in required if key not in data]
    if missing:
        return fail(f"{source} champs manquants: {', '.join(missing)}")

    summary = data.get("summary")
    if not isinstance(summary, dict):
        return fail(f"{source} summary invalide")

    activities = data.get("activities")
    pilots = data.get("pilots")
    if not isinstance(activities, list) or not isinstance(pilots, list):
        return fail(f"{source} activities/pilots invalides")

    laps_count = int(summary.get("laps_count") or 0)
    activities_count = int(summary.get("activities_count") or 0)
    pilots_count = int(summary.get("pilots_count") or 0)

    if laps_count <= 0:
        return fail(f"{source} ne contient aucun tour")
    if activities_count <= 0 or len(activities) <= 0:
        return fail(f"{source} ne contient aucune activite")
    if pilots_count <= 0 or len(pilots) <= 0:
        return fail(f"{source} ne contient aucun pilote")

    print(
        "OK validation data:",
        f"{source.name}",
        f"activites={activities_count}",
        f"pilotes={pilots_count}",
        f"tours={laps_count}",
    )
    return 0


def main() -> int:
    if not DATA_FILE.exists():
        return fail(f"{DATA_FILE} introuvable")
    if not REPORT_DATA_FILE.exists():
        return fail(f"{REPORT_DATA_FILE} introuvable")

    for path in (DATA_FILE, REPORT_DATA_FILE):
        try:
            data = load_json(path)
        except Exception as exc:
            return fail(f"lecture impossible {path}: {exc}")
        code = validate_payload(data, path)
        if code:
            return code

    return 0


if __name__ == "__main__":
    sys.exit(main())
