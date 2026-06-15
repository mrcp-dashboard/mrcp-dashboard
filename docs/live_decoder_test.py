#!/usr/bin/env python3
"""
Test reader for AMB/MyLaps P3 decoder live data.

Usage on the LXC:
    cd /opt/mrcp-dashboard/docs
    ../venv/bin/python live_decoder_test.py --host 192.168.1.100

Then pass a car over the loop. PASSING records should print the transponder,
decoder RTC time, signal strength and hits.
"""

from __future__ import annotations

import argparse
import datetime as dt
import socket
import sys
import time
from dataclasses import dataclass
from typing import Dict, Iterable, Optional


START_BYTE = 0x8E
END_BYTE = 0x8F
ESCAPE_BYTE = 0x8D

RECORD_TYPES = {
    0x00: "RESET",
    0x01: "PASSING",
    0x02: "STATUS",
    0x03: "VERSION",
    0x04: "RESEND",
    0x05: "CLEAR_PASSING",
    0x13: "SERVER_SETTINGS",
    0x15: "SESSION",
    0x16: "NETWORK_SETTINGS",
    0x18: "WATCHDOG",
    0x20: "PING",
    0x24: "GET_TIME",
    0x28: "GENERAL_SETTINGS",
    0x2D: "SIGNALS",
    0x2F: "LOOP_TRIGGER",
    0x30: "GPS_INFO",
    0x45: "FIRST_CONTACT",
    0x4A: "TIMELINE",
    0xFFFF: "ERROR",
}

FIELD_NAMES = {
    0x01: {
        0x01: "passing_number",
        0x03: "transponder",
        0x04: "rtc_time",
        0x05: "strength",
        0x06: "hits",
        0x08: "flags",
    },
    0x02: {
        0x01: "noise",
        0x06: "gps",
        0x07: "temperature",
        0x0A: "sat_in_use",
        0x0B: "loop_triggers",
        0x0C: "input_voltage",
    },
}

GENERAL_FIELDS = {
    0x81: "decoder_id",
    0x83: "controller_id",
    0x85: "request_id",
}


class P3ParseError(ValueError):
    pass


@dataclass
class P3Record:
    record_type: int
    record_name: str
    fields: Dict[str, int]
    length: int
    crc_hex: str
    raw_hex: str


def little_int(data: bytes) -> int:
    return int.from_bytes(data, byteorder="little", signed=False)


def unescape_record(record: bytes) -> bytes:
    out = bytearray()
    i = 0
    while i < len(record):
        b = record[i]
        if b == ESCAPE_BYTE:
            if i + 1 >= len(record):
                raise P3ParseError("dangling escape byte")
            out.append((record[i + 1] - 0x20) & 0xFF)
            i += 2
            continue
        out.append(b)
        i += 1
    return bytes(out)


def split_records(buffer: bytearray) -> Iterable[bytes]:
    while True:
        try:
            start = buffer.index(START_BYTE)
        except ValueError:
            buffer.clear()
            return

        if start:
            del buffer[:start]

        try:
            end = buffer.index(END_BYTE, 1)
        except ValueError:
            return

        record = bytes(buffer[: end + 1])
        del buffer[: end + 1]
        yield record


def parse_record(raw_record: bytes) -> P3Record:
    record = unescape_record(raw_record)
    if len(record) < 11:
        raise P3ParseError(f"record too short: {len(record)} bytes")
    if record[0] != START_BYTE or record[-1] != END_BYTE:
        raise P3ParseError("invalid start/end byte")

    length = little_int(record[2:4])
    record_type = little_int(record[8:10])
    fields_def = {**FIELD_NAMES.get(record_type, {}), **GENERAL_FIELDS}
    fields: Dict[str, int] = {}

    pos = 10
    while pos < len(record) - 1:
        field_id = record[pos]
        if pos + 1 >= len(record) - 1:
            raise P3ParseError(f"incomplete field at offset 0x{pos:x}")

        field_len = record[pos + 1]
        value_start = pos + 2
        value_end = value_start + field_len
        if value_end > len(record) - 1:
            raise P3ParseError(f"field 0x{field_id:x} overruns record")

        field_name = fields_def.get(field_id, f"unknown_0x{field_id:02x}")
        fields[field_name] = little_int(record[value_start:value_end])
        pos = value_end

    if length != len(record):
        raise P3ParseError(f"length mismatch: header={length}, actual={len(record)}")

    return P3Record(
        record_type=record_type,
        record_name=RECORD_TYPES.get(record_type, f"UNKNOWN_0x{record_type:x}"),
        fields=fields,
        length=length,
        crc_hex=record[4:6][::-1].hex(),
        raw_hex=record.hex(" "),
    )


def format_decoder_time(value: Optional[int]) -> str:
    if value is None:
        return "-"
    seconds = value / 1000
    if 0 <= seconds < 48 * 3600:
        return str(dt.timedelta(seconds=round(seconds, 3)))
    return str(value)


def print_record(record: P3Record, show_all: bool = False, show_hex: bool = False) -> None:
    now = dt.datetime.now().strftime("%H:%M:%S")
    if record.record_name == "PASSING":
        fields = record.fields
        print(
            "[{now}] PASSING transponder={transponder} rtc={rtc} strength={strength} "
            "hits={hits} passing={passing} flags={flags}".format(
                now=now,
                transponder=fields.get("transponder", "-"),
                rtc=format_decoder_time(fields.get("rtc_time")),
                strength=fields.get("strength", "-"),
                hits=fields.get("hits", "-"),
                passing=fields.get("passing_number", "-"),
                flags=fields.get("flags", "-"),
            ),
            flush=True,
        )
    elif show_all:
        print(f"[{now}] {record.record_name} {record.fields}", flush=True)

    if show_hex:
        print(f"    hex={record.raw_hex}", flush=True)


def run(host: str, port: int, timeout: float, show_all: bool, show_hex: bool) -> int:
    address = (host, port)
    buffer = bytearray()

    print(f"Connexion au decodeur AMB/P3 {host}:{port} ...", flush=True)
    with socket.create_connection(address, timeout=timeout) as sock:
        sock.settimeout(timeout)
        print("Connecte. En attente des passages. Ctrl+C pour quitter.", flush=True)
        while True:
            try:
                chunk = sock.recv(4096)
            except socket.timeout:
                print(f"[{dt.datetime.now():%H:%M:%S}] attente...", flush=True)
                continue

            if not chunk:
                print("Connexion fermee par le decodeur.", file=sys.stderr)
                return 1

            buffer.extend(chunk)
            for raw_record in split_records(buffer):
                try:
                    record = parse_record(raw_record)
                except P3ParseError as exc:
                    print(f"Trame ignoree: {exc}", file=sys.stderr, flush=True)
                    if show_hex:
                        print(f"    raw={raw_record.hex(' ')}", file=sys.stderr, flush=True)
                    continue
                print_record(record, show_all=show_all, show_hex=show_hex)


def main() -> int:
    parser = argparse.ArgumentParser(description="Test AMB/MyLaps P3 live decoder reader")
    parser.add_argument("--host", default="192.168.1.100", help="Decoder IP or hostname")
    parser.add_argument("--port", type=int, default=5403, help="Decoder P3 TCP port")
    parser.add_argument("--timeout", type=float, default=5.0, help="Socket timeout in seconds")
    parser.add_argument("--all", action="store_true", help="Print non-passing records too")
    parser.add_argument("--hex", action="store_true", help="Print parsed record hex payloads")
    args = parser.parse_args()

    try:
        return run(args.host, args.port, args.timeout, args.all, args.hex)
    except KeyboardInterrupt:
        print("\nArret demande.")
        return 0
    except OSError as exc:
        print(f"Erreur connexion: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
