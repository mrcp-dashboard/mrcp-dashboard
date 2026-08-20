#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Y a-t-il une vraie nouveaute a publier ?

Le LXC regenere data_v2.json toutes les 3 minutes. Le champ `generated_at`
change a chaque passage, donc le fichier differe *toujours* de la version
commitee - meme quand personne n'a roule. Resultat mesure le 20/08/2026 : les
119 derniers commits automatiques ne publiaient aucune donnee nouvelle, pour
~480 commits et ~960 executions CI par jour.

Ce script repond a la question "faut-il commiter ?" :

    code de sortie 0 -> il y a du nouveau, commiter
    code de sortie 1 -> rien de neuf, ne pas commiter

Usage (depuis la racine du depot) :
    python docs/tools/data_changed.py [--verbose]
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

DATA_PATH = "docs/data_v2.json"

# Fichiers dont le contenu bouge a chaque passage sans rien apporter au site :
# horodatages de synchronisation. Ils ne declenchent pas de commit a eux seuls,
# mais partent avec le commit quand il y en a un.
BOOKKEEPING = {
    DATA_PATH,
    "docs/speedhive_sync_meta.json",
}

# Champ volatil de data_v2.json : ignore pour la comparaison.
VOLATILE_FIELDS = ("generated_at",)


def run(args: list[str], root: Path) -> subprocess.CompletedProcess:
    return subprocess.run(
        args, cwd=str(root), capture_output=True, text=True, shell=False
    )


def repo_root() -> Path:
    """Racine du depot courant.

    Deduite de git plutot que de __file__ : le script reste correct s'il est
    appele depuis n'importe quel sous-dossier, et il devient testable sur un
    depot temporaire.
    """
    result = subprocess.run(
        ["git", "rev-parse", "--show-toplevel"],
        capture_output=True, text=True, shell=False,
    )
    if result.returncode == 0 and result.stdout.strip():
        return Path(result.stdout.strip())
    return Path(__file__).resolve().parents[2]


def changed_paths(root: Path) -> list[str]:
    """Fichiers modifies ou nouveaux sous docs/ (suivis ou non)."""
    result = run(["git", "status", "--porcelain", "--", "docs"], root)
    if result.returncode != 0:
        # En cas de doute on commite : mieux vaut un commit de trop qu'une
        # donnee jamais publiee.
        return ["<git-status-failed>"]
    paths = []
    for line in result.stdout.splitlines():
        if not line.strip():
            continue
        # Format : XY <chemin>, avec un eventuel "ancien -> nouveau".
        path = line[3:].strip().strip('"')
        if " -> " in path:
            path = path.split(" -> ", 1)[1]
        paths.append(path)
    return paths


def strip_volatile(payload: object) -> object:
    if isinstance(payload, dict):
        return {k: v for k, v in payload.items() if k not in VOLATILE_FIELDS}
    return payload


def data_differs_beyond_timestamp(root: Path) -> bool:
    current_file = root / DATA_PATH
    if not current_file.exists():
        return True

    committed = run(["git", "show", f"HEAD:{DATA_PATH}"], root)
    if committed.returncode != 0:
        # Pas encore dans l'historique : c'est du nouveau.
        return True

    try:
        current = json.loads(current_file.read_text(encoding="utf-8"))
        previous = json.loads(committed.stdout)
    except Exception:
        # JSON illisible d'un cote ou de l'autre : on ne prend pas le risque
        # de bloquer une publication.
        return True

    return strip_volatile(current) != strip_volatile(previous)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--verbose", action="store_true")
    args = parser.parse_args()

    root = repo_root()
    paths = changed_paths(root)

    meaningful = [p for p in paths if p not in BOOKKEEPING]
    if meaningful:
        if args.verbose:
            print("Nouveaute detectee (fichiers) :", ", ".join(sorted(meaningful)[:10]))
        return 0

    if data_differs_beyond_timestamp(root):
        if args.verbose:
            print("Nouveaute detectee : data_v2.json a change au-dela de generated_at")
        return 0

    if args.verbose:
        print("Rien de neuf : seul l'horodatage a bouge")
    return 1


if __name__ == "__main__":
    sys.exit(main())
