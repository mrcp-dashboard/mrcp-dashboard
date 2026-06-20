#!/usr/bin/env python3
"""Ultra-light MRCP live screen renderer for Raspberry Pi Zero 2 W.

The script fetches live_decoder_state.json, renders a black PNG with the live
ranking, and optionally starts feh in fullscreen reload mode. It avoids a web
browser entirely, which is much lighter on 512 MB devices.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

from PIL import Image, ImageDraw, ImageFont


DEFAULT_URL = "http://192.168.1.2:8080/live_decoder_state.json"
DEFAULT_OUTPUT = "/tmp/mrcp-zero-live.png"
BG = (0, 0, 0)
PANEL = (3, 13, 8)
PANEL_ALT = (18, 14, 4)
LINE = (25, 72, 45)
TEXT = (245, 248, 255)
MUTED = (145, 174, 158)
GREEN = (24, 216, 109)
RED = (255, 74, 61)
GOLD = (244, 189, 53)


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf",
        "arialbd.ttf" if bold else "arial.ttf",
    ]
    for candidate in candidates:
        try:
            return ImageFont.truetype(candidate, size)
        except OSError:
            continue
    return ImageFont.load_default()


FONTS = {
    "title": font(78, True),
    "clock": font(74, True),
    "label": font(22),
    "box": font(48, True),
    "pilot": font(38, True),
    "small": font(20),
    "stat": font(24, True),
    "pos": font(30, True),
    "empty": font(56, True),
}


def fetch_json(url: str, timeout: float) -> Dict[str, Any]:
    req = urllib.request.Request(url, headers={"Cache-Control": "no-cache"})
    with urllib.request.urlopen(req, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def lap_time(value: Any) -> str:
    try:
        n = float(value)
    except (TypeError, ValueError):
        return "-"
    return f"{n:.3f}s"


def pilot_label(row: Dict[str, Any]) -> str:
    name = str(row.get("pilot") or "").strip()
    if not name or name.startswith("Inconnu #") or name == "Pilote inconnu":
        return str(row.get("transponder") or "-")
    return name


def sorted_rows(rows: Iterable[Dict[str, Any]]) -> List[Dict[str, Any]]:
    def best(row: Dict[str, Any]) -> float:
        try:
            return float(row.get("best_lap"))
        except (TypeError, ValueError):
            return 999999.0

    return sorted(
        rows,
        key=lambda row: (
            -int(row.get("laps") or 0),
            best(row),
            pilot_label(row),
        ),
    )


def best_gap(value: Any, leader_best: Optional[float]) -> str:
    if leader_best is None:
        return "-"
    try:
        current = float(value)
    except (TypeError, ValueError):
        return "-"
    diff = current - leader_best
    if abs(diff) < 0.0005:
        return "Leader"
    return f"+{diff:.3f}"


def text_fit(draw: ImageDraw.ImageDraw, text: str, max_width: int, font_obj: ImageFont.ImageFont) -> str:
    if draw.textlength(text, font=font_obj) <= max_width:
        return text
    ellipsis = "..."
    result = text
    while result and draw.textlength(result + ellipsis, font=font_obj) > max_width:
        result = result[:-1]
    return (result + ellipsis) if result else ellipsis


def rect(draw: ImageDraw.ImageDraw, xy: tuple[int, int, int, int], outline=LINE, fill=PANEL, width: int = 2) -> None:
    draw.rectangle(xy, fill=fill, outline=outline, width=width)


def draw_box(draw: ImageDraw.ImageDraw, xy: tuple[int, int, int, int], label: str, value: str) -> None:
    x1, y1, x2, y2 = xy
    rect(draw, xy)
    draw.text((x1 + 14, y1 + 10), label, font=FONTS["label"], fill=MUTED)
    draw.text((x1 + 14, y1 + 36), value, font=FONTS["box"], fill=TEXT)


def render(data: Optional[Dict[str, Any]], error: Optional[str], output: Path, size: tuple[int, int]) -> None:
    width, height = size
    img = Image.new("RGB", size, BG)
    draw = ImageDraw.Draw(img)

    connected = bool(data and data.get("connected")) and error is None
    now = datetime.now().strftime("%H:%M")

    dot_color = GREEN if connected else RED
    draw.ellipse((22, 38, 48, 64), fill=dot_color)
    draw.text((62, 20), "MRCP Live", font=FONTS["title"], fill=TEXT)
    clock_width = int(draw.textlength(now, font=FONTS["clock"]))
    draw.text((width - clock_width - 22, 20), now, font=FONTS["clock"], fill=TEXT)
    draw.line((14, 112, width - 14, 112), fill=LINE, width=3)

    passings = str(int(data.get("passings_count") or 0)) if data else "0"
    laps = str(int(data.get("laps_count") or 0)) if data else "0"
    pilots = str(int(data.get("pilots_count") or 0)) if data else "0"
    message = "OK" if connected else "KO"
    box_y1, box_y2 = 126, 212
    gap = 10
    box_w = (width - 28 - (gap * 3)) // 4
    draw_box(draw, (14, box_y1, 14 + box_w, box_y2), "Connexion", message)
    draw_box(draw, (14 + (box_w + gap), box_y1, 14 + (box_w + gap) * 2 - gap, box_y2), "Passages", passings)
    draw_box(draw, (14 + (box_w + gap) * 2, box_y1, 14 + (box_w + gap) * 3 - gap, box_y2), "Tours", laps)
    draw_box(draw, (14 + (box_w + gap) * 3, box_y1, width - 14, box_y2), "Pilotes / puces", pilots)

    if error:
        draw.text((40, 330), "Live indisponible", font=FONTS["empty"], fill=RED)
        draw.text((40, 400), error[:90], font=FONTS["small"], fill=MUTED)
    else:
        rows = sorted_rows(data.get("ranking") or []) if data else []
        if rows:
            try:
                leader_best = float(rows[0].get("best_lap"))
            except (TypeError, ValueError):
                leader_best = None
            y = 230
            row_h = min(66, max(52, (height - y - 14) // max(1, min(8, len(rows)))))
            max_rows = max(1, (height - y - 14) // row_h)
            for index, row in enumerate(rows[:max_rows], start=1):
                fill = PANEL_ALT if index == 1 else BG
                outline = GOLD if index == 1 else LINE
                rect(draw, (14, y, width - 14, y + row_h - 6), outline=outline, fill=fill)
                pos_box = (26, y + 10, 66, y + 50)
                draw.ellipse(pos_box, fill=GOLD)
                draw.text((38 if index < 10 else 31, y + 14), str(index), font=FONTS["pos"], fill=BG)

                x = width - 670
                name = text_fit(draw, pilot_label(row), max(260, x - 100), FONTS["pilot"])
                draw.text((82, y + 8), name, font=FONTS["pilot"], fill=TEXT)
                draw.text((84, y + 48), str(row.get("transponder") or ""), font=FONTS["small"], fill=MUTED)

                cols = [
                    ("Tours", str(int(row.get("laps") or 0))),
                    ("Dernier", lap_time(row.get("last_lap"))),
                    ("Best", lap_time(row.get("best_lap"))),
                    ("Moy.", lap_time(row.get("avg_lap"))),
                    ("Ecart", best_gap(row.get("best_lap"), leader_best)),
                ]
                col_w = 132
                for label, value in cols:
                    draw.text((x, y + 9), label, font=FONTS["label"], fill=MUTED)
                    draw.text((x, y + 34), value, font=FONTS["stat"], fill=TEXT)
                    x += col_w
                y += row_h
        else:
            draw.text((40, 330), "En attente des passages", font=FONTS["empty"], fill=MUTED)

    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(delete=False, suffix=".png", dir=str(output.parent)) as tmp:
        tmp_path = Path(tmp.name)
    img.save(tmp_path)
    tmp_path.replace(output)


def start_feh(output: Path) -> subprocess.Popen:
    return subprocess.Popen(["feh", "-F", "-Y", "-Z", "--reload", "1", str(output)])


def main() -> int:
    parser = argparse.ArgumentParser(description="Render MRCP live timing as a lightweight PNG.")
    parser.add_argument("--url", default=DEFAULT_URL)
    parser.add_argument("--output", default=DEFAULT_OUTPUT)
    parser.add_argument("--interval", type=float, default=1.5)
    parser.add_argument("--timeout", type=float, default=2.0)
    parser.add_argument("--width", type=int, default=1280)
    parser.add_argument("--height", type=int, default=720)
    parser.add_argument("--display", action="store_true", help="Start feh fullscreen reload mode.")
    args = parser.parse_args()

    output = Path(args.output)
    feh_proc = start_feh(output) if args.display else None
    try:
        while True:
            data: Optional[Dict[str, Any]] = None
            error: Optional[str] = None
            try:
                data = fetch_json(args.url, args.timeout)
            except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError) as exc:
                error = str(exc)
            render(data, error, output, (args.width, args.height))
            time.sleep(max(0.5, args.interval))
    finally:
        if feh_proc and feh_proc.poll() is None:
            feh_proc.terminate()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
