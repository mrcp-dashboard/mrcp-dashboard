#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
fix_lap_overrides.py

Corrige automatiquement lap_overrides.json pour éviter l'erreur :
AttributeError: 'bool' object has no attribute 'get'

Ancien format :
{
  "excluded": {
    "lap_id": true
  }
}

Nouveau format :
{
  "excluded": {
    "lap_id": {
      "reason": "Exclu admin"
    }
  }
}
"""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PATH = ROOT / "lap_overrides.json"

def main():
    if not PATH.exists():
        print("Aucun lap_overrides.json à corriger.")
        return

    data = json.loads(PATH.read_text(encoding="utf-8"))

    if not isinstance(data, dict):
        raise SystemExit("lap_overrides.json invalide : racine non objet JSON")

    excluded = data.get("excluded", {})
    forced_track = data.get("forced_track", {})

    if not isinstance(excluded, dict):
        excluded = {}

    if not isinstance(forced_track, dict):
        forced_track = {}

    fixed_excluded = {}
    changed = 0

    for lap_id, value in excluded.items():
        if value is True:
            fixed_excluded[lap_id] = {"reason": "Exclu admin"}
            changed += 1
        elif value is False or value is None:
            changed += 1
            continue
        elif isinstance(value, dict):
            if "reason" not in value:
                value["reason"] = "Exclu admin"
                changed += 1
            fixed_excluded[lap_id] = value
        else:
            fixed_excluded[lap_id] = {"reason": str(value)}
            changed += 1

    data["excluded"] = fixed_excluded
    data["forced_track"] = forced_track

    PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"lap_overrides.json corrigé : {changed} entrée(s) convertie(s)")
    print(f"Exclusions : {len(fixed_excluded)}")
    print(f"Pistes forcées : {len(forced_track)}")

if __name__ == "__main__":
    main()
