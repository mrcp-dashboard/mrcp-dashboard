#!/usr/bin/env python3
"""
AMB/MyLaps P3 live decoder daemon for MRCP Dashboard.

It connects to the decoder TCP P3 stream, computes live laps per transponder,
and writes a small JSON state file consumed later by the dashboard.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import socket
import tempfile
import time
from pathlib import Path
from typing import Any, Dict, Optional

from live_decoder_test import P3ParseError, parse_record, split_records


DOCS_DIR = Path(os.environ.get("MRCP_DOCS_DIR", Path(__file__).resolve().parent))
STATE_FILE = Path(os.environ.get("MRCP_DECODER_STATE_FILE", DOCS_DIR / "live_decoder_state.json"))
CORRECTIONS_FILE = Path(os.environ.get("MRCP_CORRECTIONS_FILE", DOCS_DIR / "corrections.json"))


def utc_now() -> str:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()


def local_now() -> str:
    return dt.datetime.now().replace(microsecond=0).isoformat()


def normalize_transponder(value: Any) -> str:
    return str(value or "").replace("/0", "").strip()


def load_pilot_map() -> Dict[str, str]:
    if not CORRECTIONS_FILE.exists():
        return {}
    try:
        data = json.loads(CORRECTIONS_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {}
    mapping = data.get("transponders") if isinstance(data.get("transponders"), dict) else {}
    return {normalize_transponder(k): str(v) for k, v in mapping.items() if str(v).strip()}


def atomic_write_json(path: Path, payload: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
        f.write("\n")
        tmp_name = f.name
    os.replace(tmp_name, path)


def empty_state(host: str, port: int, track: str, status: str, message: str) -> Dict[str, Any]:
    return {
        "status": status,
        "service": "mrcp-live-decoder",
        "mode": "AMB/MyLaps P3",
        "host": host,
        "port": port,
        "track": track,
        "generated_at": utc_now(),
        "local_time": local_now(),
        "message": message,
        "connected": False,
        "passings_count": 0,
        "laps_count": 0,
        "pilots_count": 0,
        "latest_passing": None,
        "ranking": [],
        "decoder": {},
    }


class LiveState:
    def __init__(self, host: str, port: int, track: str, min_lap_seconds: float) -> None:
        self.host = host
        self.port = port
        self.track = track
        self.min_lap_seconds = min_lap_seconds
        self.pilots: Dict[str, Dict[str, Any]] = {}
        self.latest_passing: Optional[Dict[str, Any]] = None
        self.passings_count = 0
        self.decoder: Dict[str, Any] = {}
        self.pilot_map = load_pilot_map()
        self._last_corrections_mtime = CORRECTIONS_FILE.stat().st_mtime if CORRECTIONS_FILE.exists() else None

    def refresh_pilot_map_if_needed(self) -> None:
        mtime = CORRECTIONS_FILE.stat().st_mtime if CORRECTIONS_FILE.exists() else None
        if mtime != self._last_corrections_mtime:
            self._last_corrections_mtime = mtime
            self.pilot_map = load_pilot_map()

    def pilot_name(self, transponder: str) -> str:
        return self.pilot_map.get(transponder) or f"Inconnu #{transponder}"

    def handle_status(self, fields: Dict[str, int]) -> None:
        self.decoder = {
            "decoder_id": fields.get("decoder_id"),
            "noise": fields.get("noise"),
            "temperature": fields.get("temperature"),
            "input_voltage": fields.get("input_voltage"),
            "gps": fields.get("gps"),
            "updated_at": utc_now(),
        }

    def handle_passing(self, fields: Dict[str, int]) -> None:
        self.refresh_pilot_map_if_needed()
        transponder = normalize_transponder(fields.get("transponder"))
        if not transponder:
            return

        now_monotonic = time.monotonic()
        now_iso = utc_now()
        pilot = self.pilots.setdefault(
            transponder,
            {
                "transponder": transponder,
                "pilot": self.pilot_name(transponder),
                "track": self.track,
                "passings": 0,
                "laps": 0,
                "best_lap": None,
                "last_lap": None,
                "avg_lap": None,
                "total_lap_time": 0.0,
                "first_seen_at": now_iso,
                "last_seen_at": None,
                "_last_seen_monotonic": None,
            },
        )
        pilot["pilot"] = self.pilot_name(transponder)
        pilot["passings"] += 1
        pilot["last_seen_at"] = now_iso

        previous = pilot.get("_last_seen_monotonic")
        lap_seconds = None
        if previous is not None:
            delta = now_monotonic - float(previous)
            if delta >= self.min_lap_seconds:
                lap_seconds = round(delta, 3)
                pilot["laps"] += 1
                pilot["last_lap"] = lap_seconds
                pilot["total_lap_time"] = round(float(pilot["total_lap_time"]) + lap_seconds, 3)
                pilot["avg_lap"] = round(float(pilot["total_lap_time"]) / int(pilot["laps"]), 3)
                if pilot["best_lap"] is None or lap_seconds < float(pilot["best_lap"]):
                    pilot["best_lap"] = lap_seconds

        pilot["_last_seen_monotonic"] = now_monotonic
        self.passings_count += 1
        self.latest_passing = {
            "transponder": transponder,
            "pilot": pilot["pilot"],
            "track": self.track,
            "lap_time": lap_seconds,
            "passing_number": fields.get("passing_number"),
            "rtc_time": fields.get("rtc_time"),
            "strength": fields.get("strength"),
            "hits": fields.get("hits"),
            "flags": fields.get("flags"),
            "seen_at": now_iso,
        }

    def payload(self, connected: bool = True, message: str = "ok") -> Dict[str, Any]:
        rows = []
        for pilot in self.pilots.values():
            row = {k: v for k, v in pilot.items() if not k.startswith("_") and k != "total_lap_time"}
            rows.append(row)
        rows.sort(key=lambda r: (
            r["best_lap"] is None,
            r["best_lap"] if r["best_lap"] is not None else 999999,
            -int(r["laps"]),
            r["pilot"],
        ))
        for index, row in enumerate(rows, start=1):
            row["position"] = index

        return {
            "status": "ok" if connected else "degraded",
            "service": "mrcp-live-decoder",
            "mode": "AMB/MyLaps P3",
            "host": self.host,
            "port": self.port,
            "track": self.track,
            "generated_at": utc_now(),
            "local_time": local_now(),
            "message": message,
            "connected": connected,
            "passings_count": self.passings_count,
            "laps_count": sum(int(r["laps"]) for r in rows),
            "pilots_count": len(rows),
            "latest_passing": self.latest_passing,
            "ranking": rows,
            "decoder": self.decoder,
        }


def run_once(host: str, port: int, timeout: float, track: str, min_lap_seconds: float, output: Path) -> int:
    state = LiveState(host, port, track, min_lap_seconds)
    buffer = bytearray()
    atomic_write_json(output, empty_state(host, port, track, "starting", "connexion au decodeur"))
    with socket.create_connection((host, port), timeout=timeout) as sock:
        sock.settimeout(timeout)
        atomic_write_json(output, state.payload(connected=True, message="connecte"))
        while True:
            try:
                chunk = sock.recv(4096)
            except socket.timeout:
                atomic_write_json(output, state.payload(connected=True, message="attente passages"))
                continue
            if not chunk:
                atomic_write_json(output, state.payload(connected=False, message="connexion fermee"))
                return 1

            buffer.extend(chunk)
            changed = False
            for raw_record in split_records(buffer):
                try:
                    record = parse_record(raw_record)
                except P3ParseError:
                    continue
                if record.record_name == "STATUS":
                    state.handle_status(record.fields)
                    changed = True
                elif record.record_name == "PASSING":
                    state.handle_passing(record.fields)
                    changed = True
            if changed:
                atomic_write_json(output, state.payload())


def main() -> int:
    parser = argparse.ArgumentParser(description="MRCP AMB/P3 live decoder daemon")
    parser.add_argument("--host", default=os.environ.get("MRCP_DECODER_HOST", "192.168.1.100"))
    parser.add_argument("--port", type=int, default=int(os.environ.get("MRCP_DECODER_PORT", "5403")))
    parser.add_argument("--track", default=os.environ.get("MRCP_DECODER_TRACK", "TT1/8"))
    parser.add_argument("--timeout", type=float, default=float(os.environ.get("MRCP_DECODER_TIMEOUT", "5")))
    parser.add_argument("--min-lap-seconds", type=float, default=float(os.environ.get("MRCP_DECODER_MIN_LAP_SECONDS", "5")))
    parser.add_argument("--output", type=Path, default=STATE_FILE)
    parser.add_argument("--retry-seconds", type=float, default=float(os.environ.get("MRCP_DECODER_RETRY_SECONDS", "5")))
    args = parser.parse_args()

    while True:
        try:
            return_code = run_once(args.host, args.port, args.timeout, args.track, args.min_lap_seconds, args.output)
            if return_code == 0:
                return 0
        except KeyboardInterrupt:
            return 0
        except OSError as exc:
            atomic_write_json(args.output, empty_state(args.host, args.port, args.track, "error", str(exc)))
        time.sleep(args.retry_seconds)


if __name__ == "__main__":
    raise SystemExit(main())
