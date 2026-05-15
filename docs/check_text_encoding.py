#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Detecte les sequences d'encodage cassees dans les fichiers publics."""

from __future__ import annotations

import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent
PATTERNS = (
    "\u00c3",
    "\u00e2\u20ac\u2122",
    "\u00e2\u20ac\u0153",
    "\u00e2\u20ac",
    "\u00f0\u0178",
    "\u00c2",
    "\ufffd",
)
EXTENSIONS = {
    ".css",
    ".html",
    ".js",
    ".json",
    ".md",
    ".py",
    ".service",
    ".sh",
    ".txt",
    ".webmanifest",
}
IGNORED_DIRS = {"backups", "__pycache__"}


def iter_files(root: Path):
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        if any(part in IGNORED_DIRS for part in path.parts):
            continue
        if path.suffix.lower() in EXTENSIONS:
            yield path


def main() -> int:
    failures: list[str] = []
    for path in iter_files(ROOT):
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError as exc:
            failures.append(f"{path}: UTF-8 invalide ({exc})")
            continue

        for pattern in PATTERNS:
            if pattern in text:
                failures.append(f"{path}: sequence suspecte {pattern!r}")

    if failures:
        print("ERREUR encodage texte:")
        for failure in failures:
            print(f" - {failure}")
        return 1

    print("OK encodage texte: aucun motif suspect dans docs/")
    return 0


if __name__ == "__main__":
    sys.exit(main())
