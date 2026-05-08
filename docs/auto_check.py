# -*- coding: utf-8 -*-
"""
auto_check.py
Verifie automatiquement s'il y a de nouvelles sessions sur SpeedHive,
telecharge les CSV manquants, met a jour l'historique, regenere le dashboard
et publie sur GitHub. Sans intervention.

Lancement :
  python auto_check.py             (mode interactif, affiche tout)
  python auto_check.py --silent    (mode tache planifiee, log dans auto_check.log)
  python auto_check.py --no-push   (telecharge et genere mais ne publie pas)
"""

import sys
import os
import json
import csv
import argparse
import subprocess
import requests
from pathlib import Path
from datetime import datetime, date

# ----------------------------------------------------------------------
# CONFIG
# ----------------------------------------------------------------------
ROOT          = Path(__file__).parent
LOCATION_ID   = 4308
LOCATION_URL  = f"https://speedhive.mylaps.com/Practice/{LOCATION_ID}"
API_BASE      = "https://practice-api.speedhive.com/api/v1"
CSV_DIR       = ROOT / "speedhive_csv"
HISTORY_FILE  = ROOT / "speedhive_history.json"
PILOTS_FILE   = ROOT / "speedhive_pilots.json"
LOG_FILE      = ROOT / "auto_check.log"
LAP_MIN       = 31.0
LAP_MAX       = 50.0

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "application/json",
    "Referer": "https://speedhive.mylaps.com/",
    "Origin": "https://speedhive.mylaps.com",
}

# ----------------------------------------------------------------------
# LOGGING
# ----------------------------------------------------------------------
class Logger:
    def __init__(self, silent=False):
        self.silent = silent
        self.lines = []
    def log(self, msg=""):
        ts = datetime.now().strftime("%H:%M:%S")
        line = f"[{ts}] {msg}" if msg else ""
        self.lines.append(line)
        if not self.silent:
            print(line)
    def flush_to_file(self):
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write("\n" + "=" * 60 + "\n")
            f.write(f"  Run du {datetime.now().strftime('%d/%m/%Y %H:%M:%S')}\n")
            f.write("=" * 60 + "\n")
            f.write("\n".join(self.lines) + "\n")

# ----------------------------------------------------------------------
# UTILS
# ----------------------------------------------------------------------
def parse_iso_date(s):
    """'2026-05-01T15:30:00Z' -> date(2026,5,1)"""
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00")).date()
    except Exception:
        return None

def laptime_to_sec(s):
    s = (s or "").strip()
    if not s:
        return None
    if ":" in s:
        parts = s.split(":")
        try:
            h = float(parts[0]) if len(parts) == 3 else 0
            m = float(parts[-2]); sec = float(parts[-1])
            return h * 3600 + m * 60 + sec
        except ValueError:
            return None
    try:
        return float(s)
    except ValueError:
        return None

def date_to_dmy(d: date) -> str:
    return d.strftime("%d/%m/%Y")

def fmt_sec(t):
    m = int(t // 60); s = t - 60 * m
    return f"{m}:{s:06.3f}" if m else f"{s:.3f}"

# ----------------------------------------------------------------------
# API SPEEDHIVE
# ----------------------------------------------------------------------
def get_activities(limit=200):
    url = f"{API_BASE}/locations/{LOCATION_ID}/activities?count={limit}&offset=0"
    r = requests.get(url, headers=HEADERS, timeout=20)
    r.raise_for_status()
    return r.json().get("activities", [])

def download_csv(activity, output_dir):
    activity_id = activity["id"]
    chip_label = (activity.get("chipLabel") or "").strip() or str(activity_id)
    url = f"{API_BASE}/training/activities/{activity_id}/sessions?format=csv"
    r = requests.get(url, headers=HEADERS, timeout=30)
    r.raise_for_status()
    content = r.content
    if b"<html" in content[:100].lower() or len(content) < 80:
        return None
    filename = output_dir / f"sessions_{activity_id}.csv"
    filename.write_bytes(content)
    return filename

# ----------------------------------------------------------------------
# DETECTION DES NOUVELLES SESSIONS
# ----------------------------------------------------------------------
def get_known_dates():
    """Retourne le set des dates deja presentes dans l'historique (DD/MM/YYYY)."""
    known = set()
    if not HISTORY_FILE.exists():
        return known
    try:
        history = json.loads(HISTORY_FILE.read_text(encoding="utf-8"))
        for pid, pinfo in history.items():
            if not isinstance(pinfo, dict):
                continue
            for s in pinfo.get("sessions", []):
                d = (s.get("date") or "").strip()
                # Normaliser tous les formats vers DD/MM/YYYY
                for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y"):
                    try:
                        known.add(datetime.strptime(d, fmt).strftime("%d/%m/%Y"))
                        break
                    except ValueError:
                        continue
    except Exception:
        pass
    return known

def get_existing_csv_ids():
    """Retourne le set des activity_id deja telecharges."""
    if not CSV_DIR.exists():
        return set()
    return {f.stem.replace("sessions_", "") for f in CSV_DIR.glob("sessions_*.csv")}

def detect_new_activities(activities, known_dates, existing_ids):
    """Retourne la liste des activites nouvelles (date inconnue OU CSV manquant)."""
    new_acts = []
    for a in activities:
        d = parse_iso_date(a.get("startTime", ""))
        if not d:
            continue
        d_str = date_to_dmy(d)
        # Nouvelle = date jamais vue dans l'historique.
        # Si la date est deja connue (meme partiellement, par un seul pilote),
        # on considere qu'elle a deja ete traitee et on n'y touche plus.
        if d_str not in known_dates:
            new_acts.append(a)
    return new_acts

# ----------------------------------------------------------------------
# MISE A JOUR DE L'HISTORIQUE
# ----------------------------------------------------------------------
def load_pilots_map():
    """Charge le mapping transponder -> pilot_name. Reprend la logique de speedhive_app."""
    pilots = {}
    if PILOTS_FILE.exists():
        try:
            pilots = json.loads(PILOTS_FILE.read_text(encoding="utf-8"))
        except Exception:
            pass
    return pilots

def update_history_from_csv(new_csv_files, pilots_map):
    """Pour chaque CSV recent, calcule les stats par (pilote, date) et les ajoute a l'historique.
    Reproduit la logique save_history() de speedhive_app.py.
    """
    history = {}
    if HISTORY_FILE.exists():
        try:
            history = json.loads(HISTORY_FILE.read_text(encoding="utf-8"))
        except Exception:
            pass

    # Lire tous les laps groupes par (transponder, date)
    laps_by_key = {}  # (transp, date_dmy) -> [laps]
    for f in new_csv_files:
        try:
            with open(f, newline="", encoding="utf-8-sig") as fh:
                reader = csv.DictReader(fh)
                for row in reader:
                    t = (row.get("Transponder") or "").strip()
                    l = (row.get("Laptime") or "").strip()
                    d = (row.get("Date") or "").strip()
                    if not t or not l or not d:
                        continue
                    try:
                        transp = str(int(float(t)))
                    except ValueError:
                        continue
                    sec = laptime_to_sec(l)
                    if sec is None or not (LAP_MIN <= sec <= LAP_MAX):
                        continue
                    # Date au format DD-MM-YYYY dans les CSV speedhive -> on convertit en DD/MM/YYYY
                    try:
                        d_norm = datetime.strptime(d, "%d-%m-%Y").strftime("%d/%m/%Y")
                    except ValueError:
                        try:
                            d_norm = datetime.strptime(d, "%d/%m/%Y").strftime("%d/%m/%Y")
                        except ValueError:
                            continue
                    laps_by_key.setdefault((transp, d_norm), []).append(sec)
        except Exception as e:
            print(f"  ! Erreur lecture {f.name} : {e}")

    # Calculer les stats et fusionner dans l'historique
    n_added = 0
    for (transp, d_str), laps in laps_by_key.items():
        if not laps:
            continue
        mean = sum(laps) / len(laps)
        std = (sum((x - mean) ** 2 for x in laps) / len(laps)) ** 0.5 if len(laps) > 1 else 0
        entry = {
            "date": d_str,
            "best": round(min(laps), 3),
            "mean": round(mean, 3),
            "std": round(std, 3),
            "count": len(laps),
        }
        name = pilots_map.get(transp, f"Inconnu #{transp}")
        if transp not in history:
            history[transp] = {"name": name, "sessions": []}
        else:
            history[transp]["name"] = name  # rafraichir nom
        # Anti-doublon : meme date deja presente ?
        existing = [e for e in history[transp]["sessions"] if e.get("date") == d_str]
        if existing:
            # On remplace les valeurs (au cas ou les laps ont change)
            existing[0].update(entry)
        else:
            history[transp]["sessions"].append(entry)
            n_added += 1

    HISTORY_FILE.write_text(json.dumps(history, ensure_ascii=False, indent=2), encoding="utf-8")
    return n_added

# ----------------------------------------------------------------------
# ENCHAINEMENT DASHBOARD + PUSH
# ----------------------------------------------------------------------
def run_python_script(script_name, log):
    """Lance un script Python et capture son output."""
    script_path = ROOT / script_name
    if not script_path.exists():
        log.log(f"  ! {script_name} introuvable")
        return False
    try:
        result = subprocess.run(
            [sys.executable, str(script_path)],
            capture_output=True, text=True, encoding="utf-8",
            input="\n",  # repond aux input() eventuels
            timeout=300,
        )
        if result.returncode != 0:
            log.log(f"  ! Erreur {script_name} (code {result.returncode})")
            log.log(result.stdout[-500:] if result.stdout else "")
            log.log(result.stderr[-500:] if result.stderr else "")
            return False
        # Logger les dernieres lignes utiles
        for line in (result.stdout or "").splitlines()[-10:]:
            if line.strip():
                log.log(f"    {line}")
        return True
    except subprocess.TimeoutExpired:
        log.log(f"  ! Timeout {script_name}")
        return False
    except Exception as e:
        log.log(f"  ! Exception {script_name} : {e}")
        return False

# ----------------------------------------------------------------------
# MAIN
# ----------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(description="Verification automatique SpeedHive")
    parser.add_argument("--silent", action="store_true", help="Mode silencieux (log fichier)")
    parser.add_argument("--no-push", action="store_true", help="Ne pas publier sur GitHub")
    args = parser.parse_args()

    log = Logger(silent=args.silent)

    log.log("=" * 60)
    log.log("  AUTO-CHECK SPEEDHIVE")
    log.log("=" * 60)

    CSV_DIR.mkdir(exist_ok=True)

    # 1) Recuperer la liste des activites
    log.log("Verification de SpeedHive...")
    try:
        activities = get_activities()
        log.log(f"  {len(activities)} activites recuperees de l'API")
    except Exception as e:
        log.log(f"  ECHEC API : {e}")
        if args.silent:
            log.flush_to_file()
        sys.exit(1)

    # 2) Detecter les nouvelles activites
    known_dates = get_known_dates()
    existing_ids = get_existing_csv_ids()
    log.log(f"  Dates connues : {len(known_dates)}")
    log.log(f"  CSV deja telecharges : {len(existing_ids)}")

    new_acts = detect_new_activities(activities, known_dates, existing_ids)
    if not new_acts:
        log.log("  Aucune nouvelle session detectee. Rien a faire.")
        if args.silent:
            log.flush_to_file()
        return

    # Garde-fou : si l'historique est vide, refuser de tout aspirer
    if not known_dates:
        log.log("  ⚠ Historique vide : l'API retournerait toutes les sessions historiques.")
        log.log("  Lance d'abord speedhive_app.py manuellement pour selectionner les sessions")
        log.log("  que tu veux inclure dans ton historique. auto_check ne s'occupe que des")
        log.log("  nouvelles dates apparues APRES la derniere mise a jour.")
        if args.silent:
            log.flush_to_file()
        return

    log.log(f"  ⚡ {len(new_acts)} nouvelles activites a traiter")

    # 3) Telecharger les CSV manquants
    log.log("Telechargement des CSV...")
    new_csv_files = []
    for act in new_acts:
        chip = (act.get("chipLabel") or "").strip() or "?"
        try:
            f = download_csv(act, CSV_DIR)
            if f:
                new_csv_files.append(f)
                log.log(f"  + {f.name} ({chip})")
            else:
                log.log(f"  - skip {chip} (pas de donnees)")
        except Exception as e:
            log.log(f"  ! erreur {chip} : {e}")

    if not new_csv_files:
        log.log("  Aucun nouveau CSV utilisable.")
        if args.silent:
            log.flush_to_file()
        return

    # 4) Mettre a jour l'historique
    log.log("Mise a jour de l'historique...")
    pilots_map = load_pilots_map()
    n_added = update_history_from_csv(new_csv_files, pilots_map)
    log.log(f"  {n_added} entrees ajoutees a l'historique")

    # 5) Regenerer le dashboard
    log.log("Generation du dashboard...")
    if not run_python_script("generer_dashboard.py", log):
        log.log("  ECHEC generation. Arret.")
        if args.silent:
            log.flush_to_file()
        sys.exit(1)

    # 6) Push GitHub (sauf si --no-push)
    if args.no_push:
        log.log("Push GitHub : ignore (--no-push)")
    else:
        log.log("Publication GitHub...")
        # On utilise une variante du push qui ne fait QUE pousser (pas de regeneration)
        # On contourne en lancant le push existant : il regenerera (rapide) puis pushera
        if not run_python_script("speedhive_github_push.py", log):
            log.log("  ECHEC publication.")
            if args.silent:
                log.flush_to_file()
            sys.exit(1)

    log.log("=" * 60)
    log.log("  TERMINE.")
    log.log("=" * 60)

    if args.silent:
        log.flush_to_file()

if __name__ == "__main__":
    main()
