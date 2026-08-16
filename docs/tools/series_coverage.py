#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Couverture des series de tours consecutifs dans data_v2.json.

Sert a choisir/valider SERIES_LAP_COUNT dans docs/app_v2_laps.js : si les
roulages deviennent plus courts, une serie de 5 tours peut ne plus concerner
assez de pilotes pour que le classement reste interessant.

Usage :
    py docs/tools/series_coverage.py
"""
from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

DATA_FILE = Path(__file__).resolve().parents[1] / "data_v2.json"


def run_lengths(laps: list[dict]) -> list[int]:
    """Longueurs des suites de tours qui s'enchainent (lap_no +1, meme piste)."""
    lengths: list[int] = []
    current = 0
    prev_no = None
    prev_track = None
    for lap in laps:
        no = lap.get("lap_no")
        track = lap.get("track")
        follows = (
            prev_no is not None
            and isinstance(no, int)
            and no == prev_no + 1
            and track == prev_track
        )
        if follows:
            current += 1
        else:
            if current:
                lengths.append(current)
            current = 1
        prev_no, prev_track = no, track
    if current:
        lengths.append(current)
    return lengths


def main() -> None:
    data = json.loads(DATA_FILE.read_text(encoding="utf-8"))

    best_run_by_pilot: dict[str, int] = {}
    all_runs: Counter[int] = Counter()

    for activity in data.get("activities", []):
        for participant in activity.get("participants", []):
            name = participant.get("pilot_name", "")
            lengths = run_lengths(participant.get("laps", []))
            all_runs.update(lengths)
            if lengths:
                best = max(lengths)
                if best > best_run_by_pilot.get(name, 0):
                    best_run_by_pilot[name] = best

    total_runs = sum(all_runs.values())
    total_pilots = len(best_run_by_pilot)
    print(f"{total_runs} relances, {total_pilots} pilotes\n")
    print("N   relances >= N   pilotes ayant une serie de N")
    for n in (3, 4, 5, 6, 8, 10, 15):
        runs_ge = sum(count for length, count in all_runs.items() if length >= n)
        pilots_ge = sum(1 for best in best_run_by_pilot.values() if best >= n)
        runs_pct = 100 * runs_ge / total_runs if total_runs else 0
        pilots_pct = 100 * pilots_ge / total_pilots if total_pilots else 0
        flag = "  <- SERIES_LAP_COUNT" if n == 5 else ""
        print(f"{n:<4}{runs_ge:6d} ({runs_pct:4.1f}%){pilots_ge:10d} ({pilots_pct:4.1f}%){flag}")


if __name__ == "__main__":
    main()
