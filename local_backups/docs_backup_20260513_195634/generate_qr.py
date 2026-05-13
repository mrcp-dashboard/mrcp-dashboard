import json
from pathlib import Path
import qrcode

BASE_URL = "https://mrcp-dashboard.github.io/mrcp-dashboard/pilot.html?id="

DATA_FILE = Path("data_v2.json")
QR_DIR = Path("assets/qr")
QR_DIR.mkdir(parents=True, exist_ok=True)

with DATA_FILE.open("r", encoding="utf-8") as f:
    data = json.load(f)

pilots = data.get("pilots", [])
count = 0

for pilot in pilots:
    pid = str(
        pilot.get("id")
        or pilot.get("pilot_id")
        or pilot.get("transponder")
        or pilot.get("transponder_id")
        or ""
    ).strip()

    if not pid:
        continue

    url = BASE_URL + pid

    img = qrcode.make(url)
    img.save(QR_DIR / f"{pid}.png")
    count += 1

print(f"OK : {count} QR codes générés dans {QR_DIR}")
