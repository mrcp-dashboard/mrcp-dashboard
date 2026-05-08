"""
SpeedHive MRCP — Application complète
======================================
Interface graphique + téléchargement + rapports HTML/PDF + évolution temporelle

Installation (une seule fois) :
    pip install requests reportlab

Usage :
    python speedhive_app.py
"""

import os, re, json, time, csv, math, shutil, threading, webbrowser
import tkinter as tk
from tkinter import ttk, messagebox, scrolledtext
from pathlib import Path
from datetime import datetime, date
import requests

# ══════════════════════════════════════════════════════════════════════════════
#  CONFIGURATION
# ══════════════════════════════════════════════════════════════════════════════

LOCATION_URL = "https://speedhive.mylaps.com/Practice/4308"
LOCATION_ID  = "4308"
LAP_MIN      = 31
LAP_MAX      = 50
OUTPUT_DIR   = Path("speedhive_csv")
REPORTS_DIR  = Path("speedhive_reports")
PILOTS_FILE  = Path("pilotes.json")   # annuaire persistant

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "application/json, text/plain, */*",
    "Referer": "https://speedhive.mylaps.com/",
    "Origin": "https://speedhive.mylaps.com",
}
API_BASE = "https://practice-api.speedhive.com/api/v1"

PILOTS_DEFAULT = {
    '3518007':'Benjamin Teich','8610318':'Benjamin Teich',
    '1884570':'Christophe Chastanet','3851227':'Damien Ibargaray',
    '8959698':'Damien Labeyrie','9591883':'David Texereau',
    '3754335':'Fabrice Darmoise','5457405':'Fabrice Dekandelaere',
    '9570335':'Frédéric Rouanne','9570334':'Frédéric Rouanne',
    '5926001':'Frédéric Smakal','8046737':'Grégoire Barroso',
    '7518662':'Jean-Marie Rivière','8214637':'Jean-Marie Rivière',
    '5344333':'Jérémy Eude','4771686':'Laurent Cernuta','7925760':'Laurent Cernuta',
    '6108107':'Lodois de Marolles','3754809':'Louis Fourniols',
    '2931812':'Ludovic Buisson','6760915':'Ludovic Buisson',
    '7612218':'Meyline Machoukow','8079667':'Mickael Desgranges',
    '7264035':'Olivier Saux','7568622':'Robin Orenga',
    '5891325':'Sébastien Zamora','7196952':'Stephne Audifax',
    '4345215':'Terry Targosz-Roques','8252302':'Victor Ditte',
    '5682350':'Vincent Guichard','6231645':'Xavier Castets',
    '6510573':'Alexis Dufau Cazenave','6686431':'Alexis Dufau Cazenave',
    '4723959':'Aurélien Meulet','2886955':'Christophe Lorgue',
    '5362908':'Cyrille Majeste Labourdenne','5552458':'Cyrille Majeste Labourdenne',
    '6375754':'Gilles Virlogeux','7066205':'Laurent Huste',
    '4497814':'Louis Blanco','3517113':'Nicolas Chaput',
    '4079599':'Nicolas Machoukow','6240338':'Nicolas Machoukow',
    '4118436':'Thierry Bujon','5340142':'Thierry Canezin',
    '8097636':'Benoit Esclarmonde','7409591':'Fabien Duverger',
    '4765114':'Gérard Glapinski','6054614':'Jordan Giraudaud',
    '7841457':'Maxime Brugerolle de Vazeilles','6028027':'Monplaisi Mathieu',
    '6412153':'Pedro Pina Lopes','5137203':'Pedro Pina Lopes',
    '6868468':'Philippe Duchen','7874799':'Sébastien Dabbadie',
    '3397942':'Stéphane Chabrier','9240743':'Anthony Gomes',
    '9415016':'Dorian Giannetta','3185669':'Michel Fatoux',
    '9855985':'Philippe Begards','4219765':'Philippe Thomas','4609463':'Philippe Thomas',
    '4588652':'Stan Orante','4703065':'Amaury Mox','9626492':'Pierre Boyer',
    '4254924':'Gwenaël Marques','7064819':'Mathieu Grégoire',
}

PALETTE = [
    '#e63946','#4cc9f0','#f4a261','#2ecc71','#a855f7','#ffd166',
    '#ff6b6b','#06d6a0','#118ab2','#ef476f','#ffd700','#8ecae6',
    '#e9c46a','#f77f00','#d62828','#023e8a','#80b918','#ff99c8',
    '#c77dff','#48cae4','#74c69d','#52b788','#ffb703','#fb8500',
    '#219ebc','#e76f51','#264653','#2a9d8f','#9b2226','#005f73',
]

# ══════════════════════════════════════════════════════════════════════════════
#  ANNUAIRE PERSISTANT
# ══════════════════════════════════════════════════════════════════════════════

def load_pilots():
    pilots = dict(PILOTS_DEFAULT)
    if PILOTS_FILE.exists():
        try:
            extra = json.loads(PILOTS_FILE.read_text(encoding='utf-8'))
            pilots.update(extra)
        except Exception:
            pass
    return pilots

def save_pilot(transponder, name):
    extra = {}
    if PILOTS_FILE.exists():
        try:
            extra = json.loads(PILOTS_FILE.read_text(encoding='utf-8'))
        except Exception:
            pass
    extra[transponder] = name
    PILOTS_FILE.write_text(json.dumps(extra, ensure_ascii=False, indent=2), encoding='utf-8')

# ══════════════════════════════════════════════════════════════════════════════
#  HELPERS
# ══════════════════════════════════════════════════════════════════════════════

def parse_date(dt_str):
    try:
        return datetime.fromisoformat(dt_str).date()
    except Exception:
        return None

def fmt_sec(s):
    m = int(s) // 60; sec = s - m * 60
    return f"{m}:{sec:06.3f}"

def laptime_to_seconds(t):
    try:
        parts = str(t).strip().split(':')
        if len(parts) == 3:
            h, m, s = parts
            return int(h)*3600 + int(m)*60 + float(s)
        elif len(parts) == 2:
            m, s = parts
            return int(m)*60 + float(s)
    except Exception:
        return None

def date_fr(d):
    mois = ['','Janvier','Février','Mars','Avril','Mai','Juin',
            'Juillet','Août','Septembre','Octobre','Novembre','Décembre']
    return f"{d.day:02d} {mois[d.month]} {d.year}"

# ══════════════════════════════════════════════════════════════════════════════
#  API SPEEDHIVE
# ══════════════════════════════════════════════════════════════════════════════

def get_activities(limit=100):
    url = f"{API_BASE}/locations/{LOCATION_ID}/activities?count={limit}&offset=0"
    r = requests.get(url, headers=HEADERS, timeout=15)
    r.raise_for_status()
    return r.json().get("activities", [])

def filter_activities(activities, dates_selected):
    result = []
    for d in dates_selected:
        batch = [a for a in activities if parse_date(a.get("startTime","")) == d]
        def duration(act):
            try:
                s = datetime.fromisoformat(act["startTime"])
                e = datetime.fromisoformat(act["endTime"])
                return (e - s).total_seconds()
            except:
                return 0
        best = {}
        for a in batch:
            code = a.get("chipCode")
            if not code: continue
            if code not in best or duration(a) > duration(best[code]):
                best[code] = a
        result.extend(best.values())
    return result

def download_csv(activity, output_dir):
    activity_id = activity["id"]
    chip_label = activity.get("chipLabel","").strip() or str(activity_id)
    url = f"{API_BASE}/training/activities/{activity_id}/sessions?format=csv"
    r = requests.get(url, headers=HEADERS, timeout=30)
    r.raise_for_status()
    content = r.content
    if b"<html" in content[:100].lower():
        return None, f"SKIP {chip_label} — pas de données"
    filename = output_dir / f"sessions_{activity_id}.csv"
    filename.write_bytes(content)
    return filename, f"OK   {chip_label}"

# ══════════════════════════════════════════════════════════════════════════════
#  CALCUL STATISTIQUES
# ══════════════════════════════════════════════════════════════════════════════

CORRECTIONS_FILE = Path("corrections.json")

def load_corrections():
    """Charge corrections.json. Retourne dict avec listes vides par defaut."""
    default = {"deleted_laps": [], "edited_laps": [],
               "merged_transponders": [], "renamed_transponders": []}
    if not CORRECTIONS_FILE.exists():
        return default
    try:
        c = json.loads(CORRECTIONS_FILE.read_text(encoding='utf-8'))
        for k, v in default.items():
            c.setdefault(k, v)
        return c
    except Exception:
        return default

def compute_stats(csv_files, pilots_map):
    rows = []
    for f in csv_files:
        with open(f, newline='', encoding='utf-8-sig') as fh:
            reader = csv.DictReader(fh)
            for row in reader:
                t = row.get('Transponder','').strip()
                l = row.get('Laptime','').strip()
                d = row.get('Date','').strip()
                if not t or not l: continue
                try:
                    transp = str(int(float(t)))
                except:
                    continue
                sec = laptime_to_seconds(l)
                if sec and LAP_MIN <= sec <= LAP_MAX:
                    rows.append({'transponder': transp, 'laptime_sec': sec, 'date': d})

    # Conserver l'ordre du CSV (par transp + date) pour appliquer les corrections par index
    groups_by_date = {}  # (transp, date_norm) -> [laps in order]
    for row in rows:
        # Normaliser la date du CSV (DD-MM-YYYY ou DD/MM/YYYY) -> DD/MM/YYYY
        d_raw = row['date']
        d_norm = d_raw
        for fmt in ('%d-%m-%Y', '%d/%m/%Y', '%Y-%m-%d'):
            try:
                d_norm = datetime.strptime(d_raw, fmt).strftime('%d/%m/%Y')
                break
            except ValueError:
                continue
        key = (row['transponder'], d_norm)
        groups_by_date.setdefault(key, []).append(row['laptime_sec'])

    # Charger et appliquer les corrections
    corrections = load_corrections()

    # 1) Editions (avant suppressions)
    for e in corrections.get("edited_laps", []):
        key = (e["transponder"], e["date"])
        if key in groups_by_date:
            i = int(e["lap_index"])
            laps = list(groups_by_date[key])
            if 0 <= i < len(laps):
                laps[i] = float(e["new_time"])
            groups_by_date[key] = laps

    # 2) Suppressions
    for d in corrections.get("deleted_laps", []):
        key = (d["transponder"], d["date"])
        if key in groups_by_date:
            i = int(d["lap_index"])
            laps = groups_by_date[key]
            groups_by_date[key] = [l for idx, l in enumerate(laps) if idx != i]

    # 3) Fusion des transpondeurs
    merge_map = {}
    for m in corrections.get("merged_transponders", []):
        primary = m["primary"]
        for sec_t in m.get("merged", []):
            if sec_t == primary: continue
            merge_map[sec_t] = primary

    # 4) Renommages
    rename_map = {r["transponder"]: r["name"] for r in corrections.get("renamed_transponders", [])}
    for m in corrections.get("merged_transponders", []):
        if m.get("name"):
            rename_map[m["primary"]] = m["name"]

    # Aplatir : groups[transp] = liste fusionnee
    groups = {}
    for (transp, _date), laps in groups_by_date.items():
        if not laps: continue
        target = merge_map.get(transp, transp)
        groups.setdefault(target, []).extend(laps)

    stats, lap_data, unknown = [], {}, []
    for p, laps in groups.items():
        if p in rename_map:
            name = rename_map[p]
        else:
            name = pilots_map.get(p, f'Inconnu #{p}')
        if name.startswith('Inconnu'): unknown.append(p)
        laps_s = sorted(laps)
        mean = sum(laps)/len(laps)
        median = laps_s[len(laps_s)//2]
        std = (sum((x-mean)**2 for x in laps)/len(laps))**0.5 if len(laps)>1 else 0
        stats.append({'id':p,'name':name,'best':round(min(laps),3),'mean':round(mean,3),
            'median':round(median,3),'worst':round(max(laps),3),'std':round(std,3),
            'count':len(laps),'best_fmt':fmt_sec(min(laps)),'mean_fmt':fmt_sec(mean)})
        lap_data[p] = laps_s

    stats.sort(key=lambda x: x['best'])
    return stats, lap_data, unknown

# ══════════════════════════════════════════════════════════════════════════════
#  HISTORIQUE (pour l'évolution dans le temps)
# ══════════════════════════════════════════════════════════════════════════════

HISTORY_FILE = Path("speedhive_history.json")

def load_history():
    if HISTORY_FILE.exists():
        try:
            return json.loads(HISTORY_FILE.read_text(encoding='utf-8'))
        except:
            pass
    return {}

def save_history(stats, session_dates):
    history = load_history()
    date_key = "_".join(sorted(str(d) for d in session_dates))
    date_label = " & ".join(sorted(str(d) for d in session_dates))
    for s in stats:
        pid = s['id']
        if pid not in history:
            history[pid] = {'name': s['name'], 'sessions': []}
        entry = {'date': date_label, 'best': s['best'], 'mean': s['mean'],
                 'std': s['std'], 'count': s['count']}
        # Eviter les doublons
        existing = [e for e in history[pid]['sessions'] if e['date'] == date_label]
        if not existing:
            history[pid]['sessions'].append(entry)
            history[pid]['sessions'].sort(key=lambda x: x['date'])
        history[pid]['name'] = s['name']  # màj nom
    HISTORY_FILE.write_text(json.dumps(history, ensure_ascii=False, indent=2), encoding='utf-8')
    return history

# ══════════════════════════════════════════════════════════════════════════════
#  GÉNÉRATION HTML
# ══════════════════════════════════════════════════════════════════════════════

def generate_html(stats, lap_data, session_dates, history, output_path):
    if len(session_dates) == 1:
        d = list(session_dates)[0]
        title_date = d.strftime('%d/%m/%Y')
        date_long  = date_fr(d)
    else:
        dates_sorted = sorted(session_dates)
        title_date = " + ".join(d.strftime('%d/%m/%Y') for d in dates_sorted)
        date_long  = " & ".join(date_fr(d) for d in dates_sorted)

    n = len(stats)
    stats_cols = min(n, 4) if n > 3 else n
    top_n_line  = min(n, 10)
    top_n_radar = min(n, 6)
    top_n_bar   = min(n, 20)

    # Données évolution temporelle
    evo_pilots = {}
    for pid, pdata in history.items():
        if len(pdata['sessions']) >= 2:
            evo_pilots[pid] = pdata

    stats_js   = json.dumps(stats,      ensure_ascii=False)
    laps_js    = json.dumps(lap_data,   ensure_ascii=False)
    history_js = json.dumps(evo_pilots, ensure_ascii=False)
    palette_js = json.dumps(PALETTE)

    has_ranking = 'true' if n > 3 else 'false'
    has_evo     = 'true' if evo_pilots else 'false'

    html = f"""<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>MRCP — {title_date}</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<style>
:root{{--bg:#0f1117;--surface:#1a1d27;--surface2:#222535;--border:#2e3250;--accent:#e63946;--gold:#FFD700;--silver:#C0C0C0;--bronze:#CD7F32;--text:#e8eaf0;--muted:#7b82a8;--green:#2ecc71;}}
*{{box-sizing:border-box;margin:0;padding:0;}}
body{{background:var(--bg);color:var(--text);font-family:'Segoe UI',system-ui,sans-serif;}}
header{{background:linear-gradient(135deg,#1a1d27,#16192a);border-bottom:1px solid var(--border);padding:20px 40px;display:flex;align-items:center;gap:20px;flex-wrap:wrap;}}
.logo{{font-size:24px;font-weight:900;letter-spacing:-1px;}}.logo span{{color:var(--accent);}}
.subtitle{{color:var(--muted);font-size:13px;margin-top:3px;}}
.date-badge{{margin-left:auto;background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:7px 14px;font-size:12px;color:var(--muted);}}
nav{{background:var(--surface);border-bottom:1px solid var(--border);padding:0 40px;display:flex;gap:4px;overflow-x:auto;}}
.nav-btn{{padding:12px 18px;border:none;background:transparent;color:var(--muted);font-size:12px;font-weight:600;cursor:pointer;border-bottom:2px solid transparent;transition:all .2s;white-space:nowrap;}}
.nav-btn.active{{color:var(--text);border-bottom-color:var(--accent);}}
.tab-content{{display:none;}}.tab-content.active{{display:block;}}
main{{max-width:1400px;margin:0 auto;padding:28px 24px;}}
.section-title{{font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--muted);margin-bottom:12px;margin-top:28px;}}
.section-title:first-child{{margin-top:0;}}
.podium{{display:flex;gap:10px;justify-content:center;align-items:flex-end;flex-wrap:wrap;}}
.podium-card{{background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:18px 24px;text-align:center;flex:1;min-width:140px;max-width:240px;transition:transform .2s;}}
.podium-card:hover{{transform:translateY(-3px);}}
.podium-card.p1{{border-color:var(--gold);background:linear-gradient(160deg,#1e1a08,#1a1d27);}}
.podium-card.p2{{border-color:var(--silver);background:linear-gradient(160deg,#141416,#1a1d27);}}
.podium-card.p3{{border-color:var(--bronze);background:linear-gradient(160deg,#1a1208,#1a1d27);}}
.podium-rank{{font-size:28px;margin-bottom:4px;}}.podium-name{{font-size:13px;font-weight:700;margin:5px 0 2px;}}
.podium-time{{font-size:22px;font-weight:800;font-variant-numeric:tabular-nums;margin:5px 0;}}
.podium-card.p1 .podium-time{{color:var(--gold);}}.podium-card.p2 .podium-time{{color:var(--silver);}}.podium-card.p3 .podium-time{{color:var(--bronze);}}
.podium-label{{font-size:10px;color:var(--muted);}}
.stats-grid{{display:grid;grid-template-columns:repeat({stats_cols},1fr);gap:12px;}}
@media(max-width:900px){{.stats-grid{{grid-template-columns:repeat(2,1fr);}}}}
@media(max-width:500px){{.stats-grid{{grid-template-columns:1fr;}}}}
.pilot-card{{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px;transition:border-color .2s;}}
.pilot-card:hover{{border-color:#3d4270;}}
.pilot-header{{display:flex;align-items:center;gap:8px;margin-bottom:10px;}}
.pilot-dot{{width:10px;height:10px;border-radius:50%;flex-shrink:0;}}
.pilot-name{{font-weight:700;font-size:13px;}}.pilot-laps{{margin-left:auto;background:var(--surface2);border-radius:5px;padding:2px 8px;font-size:10px;color:var(--muted);}}
.stat-row{{display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid #1e2136;}}
.stat-row:last-child{{border:none;}}.stat-label{{font-size:10px;color:var(--muted);}}.stat-value{{font-size:11px;font-weight:600;font-variant-numeric:tabular-nums;}}.stat-value.best{{color:var(--green);}}
.bar-track{{margin-top:10px;}}.bar-label{{display:flex;justify-content:space-between;font-size:9px;color:var(--muted);margin-bottom:4px;}}.bar-bg{{height:4px;background:var(--surface2);border-radius:3px;overflow:hidden;}}.bar-fill{{height:100%;border-radius:3px;}}
.table-wrapper{{background:var(--surface);border:1px solid var(--border);border-radius:12px;overflow:hidden;overflow-x:auto;}}
.data-table{{width:100%;border-collapse:collapse;font-size:12px;}}
.data-table th{{background:var(--surface2);padding:8px 12px;text-align:left;font-size:10px;color:var(--muted);font-weight:600;letter-spacing:.5px;text-transform:uppercase;}}
.data-table td{{padding:7px 12px;border-bottom:1px solid #1e2136;}}
.data-table tr:hover td{{background:var(--surface2);}}.data-table tr.top3 td{{font-weight:600;}}
.rank-badge{{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:5px;font-size:10px;font-weight:700;background:var(--surface2);color:var(--muted);}}
.rank-badge.r1{{background:#3d3200;color:var(--gold);}}.rank-badge.r2{{background:#252525;color:var(--silver);}}.rank-badge.r3{{background:#2a1a08;color:var(--bronze);}}
.dot{{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;vertical-align:middle;}}.best-time{{color:var(--green);font-weight:700;font-variant-numeric:tabular-nums;}}
.bar-mini{{height:4px;background:var(--surface2);border-radius:3px;overflow:hidden;display:inline-block;width:60px;vertical-align:middle;margin-right:4px;}}.bar-mini-fill{{height:100%;border-radius:3px;}}
.charts-grid{{display:grid;grid-template-columns:1fr 1fr;gap:16px;}}
@media(max-width:800px){{.charts-grid{{grid-template-columns:1fr;}}}}
.chart-card{{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:20px;}}
.chart-card.full-width{{grid-column:1/-1;}}
.chart-title{{font-size:12px;font-weight:700;margin-bottom:3px;}}.chart-sub{{font-size:10px;color:var(--muted);margin-bottom:14px;}}
.pilot-tabs{{display:flex;gap:5px;flex-wrap:wrap;margin-bottom:10px;}}
.tab-btn{{padding:5px 12px;border-radius:7px;border:1px solid var(--border);background:var(--surface);color:var(--muted);font-size:10px;font-weight:600;cursor:pointer;transition:all .15s;}}
.tab-btn.active{{color:#fff;border-color:transparent;}}
.evo-grid{{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:14px;}}
.evo-card{{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:18px;}}
.evo-name{{font-size:13px;font-weight:700;margin-bottom:12px;}}
.badge-inconnu{{background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:20px;text-align:center;color:var(--muted);font-size:12px;}}
footer{{text-align:center;padding:20px;color:var(--muted);font-size:11px;border-top:1px solid var(--border);margin-top:32px;}}
</style>
</head>
<body>
<header>
  <div><div class="logo">MRCP <span>Dashboard</span></div>
  <div class="subtitle">{title_date} · Tours {LAP_MIN}s–{LAP_MAX}s · {n} pilote{'s' if n>1 else ''}</div></div>
  <div class="date-badge">🏁 {date_long}</div>
</header>

<nav>
  <button class="nav-btn active" onclick="showTab('session',this)">🏁 Session</button>
  <button class="nav-btn" onclick="showTab('classement',this)">📋 Classement</button>
  <button class="nav-btn" onclick="showTab('graphiques',this)">📈 Graphiques</button>
  <button class="nav-btn" onclick="showTab('tours',this)">🔍 Détail tours</button>
  <button class="nav-btn" onclick="showTab('evolution',this)">📅 Évolution</button>
</nav>

<main>

<!-- TAB SESSION -->
<div id="tab-session" class="tab-content active">
  <div class="section-title">🏆 Podium — Meilleur tour</div>
  <div class="podium" id="podium"></div>
  <div class="section-title">📊 Statistiques par pilote</div>
  <div class="stats-grid" id="statsGrid"></div>
</div>

<!-- TAB CLASSEMENT -->
<div id="tab-classement" class="tab-content">
  <div class="section-title">📋 Classement complet</div>
  <div class="table-wrapper">
    <table class="data-table">
      <thead><tr><th>Rang</th><th>Pilote</th><th>Meilleur</th><th>Moyenne</th><th>Médiane</th><th>Éc.-type</th><th>Tours</th><th>Régularité</th></tr></thead>
      <tbody id="rankingBody"></tbody>
    </table>
  </div>
</div>

<!-- TAB GRAPHIQUES -->
<div id="tab-graphiques" class="tab-content">
  <div class="charts-grid">
    <div class="chart-card full-width">
      <div class="chart-title">Meilleur tour par pilote</div>
      <div class="chart-sub">Classé du plus rapide au plus lent</div>
      <canvas id="chartBest" height="140"></canvas>
    </div>
    <div class="chart-card">
      <div class="chart-title">Meilleur tour vs Moyenne (top {top_n_bar})</div>
      <div class="chart-sub">Comparaison par pilote</div>
      <canvas id="chartBestMean" height="280"></canvas>
    </div>
    <div class="chart-card">
      <div class="chart-title">Consistance — Écart-type (top {top_n_bar})</div>
      <div class="chart-sub">Plus bas = plus régulier</div>
      <canvas id="chartStd" height="280"></canvas>
    </div>
    <div class="chart-card full-width">
      <div class="chart-title">Courbe de progression — Top {top_n_line}</div>
      <div class="chart-sub">Tours triés du plus rapide au plus lent</div>
      <canvas id="chartLine" height="200"></canvas>
    </div>
    <div class="chart-card">
      <div class="chart-title">Radar performance — Top {top_n_radar}</div>
      <div class="chart-sub">Multi-critères normalisés</div>
      <canvas id="chartRadar" height="320"></canvas>
    </div>
    <div class="chart-card">
      <div class="chart-title">Volume de tours valides</div>
      <div class="chart-sub">Tours entre {LAP_MIN}s et {LAP_MAX}s</div>
      <canvas id="chartCount" height="320"></canvas>
    </div>
  </div>
</div>

<!-- TAB DETAIL TOURS -->
<div id="tab-tours" class="tab-content">
  <div class="section-title">🔍 Détail des tours par pilote</div>
  <div class="pilot-tabs" id="pilotTabs"></div>
  <div class="table-wrapper">
    <table class="data-table">
      <thead><tr><th>Rang</th><th>Temps</th><th>Secondes</th><th>Écart meilleur</th><th>Percentile</th></tr></thead>
      <tbody id="lapTableBody"></tbody>
    </table>
  </div>
</div>

<!-- TAB EVOLUTION -->
<div id="tab-evolution" class="tab-content">
  <div class="section-title">📅 Évolution dans le temps — Meilleur tour par session</div>
  <div id="evoContent"></div>
</div>

</main>
<footer>MRCP Dashboard · Tours {LAP_MIN}s–{LAP_MAX}s · Généré le {datetime.now().strftime('%d/%m/%Y à %H:%M')}</footer>

<script>
const STATS={stats_js};
const LAPS={laps_js};
const HISTORY={history_js};
const PALETTE={palette_js};
const HAS_EVO={has_evo};

function showTab(name,btn){{
  document.querySelectorAll('.tab-content').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
  document.getElementById('tab-'+name).classList.add('active');
  btn.classList.add('active');
  if(name==='evolution') buildEvo();
}}

function fmt(s){{const m=Math.floor(s/60),sec=s-m*60;return `${{m}}:${{sec.toFixed(3).padStart(6,'0')}}`;}}
function color(i,a=1){{const c=PALETTE[i%PALETTE.length];if(a===1)return c;const r=parseInt(c.slice(1,3),16),g=parseInt(c.slice(3,5),16),b=parseInt(c.slice(5,7),16);return `rgba(${{r}},${{g}},${{b}},${{a}})`;}}
function normalize(vals,inv=false){{const mn=Math.min(...vals),mx=Math.max(...vals);if(mx===mn)return vals.map(()=>50);return vals.map(v=>inv?(1-(v-mn)/(mx-mn))*100:((v-mn)/(mx-mn))*100);}}

const sorted=[...STATS].sort((a,b)=>a.best-b.best);
const maxStd=Math.max(...sorted.map(s=>s.std||0));
const medals=['🥇','🥈','🥉'];

// PODIUM
sorted.slice(0,3).forEach((s,i)=>{{
  const c=document.createElement('div');c.className=`podium-card p${{i+1}}`;
  c.innerHTML=`<div class="podium-rank">${{medals[i]}}</div><div class="podium-name">${{s.name}}</div><div class="podium-time">${{s.best_fmt.split(':').slice(1).join(':')}}</div><div class="podium-label">Moy. ${{s.mean_fmt.split(':').slice(1).join(':')}}</div>`;
  document.getElementById('podium').appendChild(c);
}});

// STATS CARDS
sorted.forEach((s,i)=>{{
  const cons=s.std?Math.round((1-s.std/maxStd)*100):100;
  const c=document.createElement('div');c.className='pilot-card';
  c.innerHTML=`<div class="pilot-header"><div class="pilot-dot" style="background:${{PALETTE[i]}}"></div><div class="pilot-name">${{s.name}}</div><div class="pilot-laps">${{s.count}} tours</div></div>
    <div class="stat-row"><span class="stat-label">🏁 Meilleur</span><span class="stat-value best">${{s.best_fmt.split(':').slice(1).join(':')}}</span></div>
    <div class="stat-row"><span class="stat-label">📊 Moyenne</span><span class="stat-value">${{s.mean_fmt.split(':').slice(1).join(':')}}</span></div>
    <div class="stat-row"><span class="stat-label">📐 Médiane</span><span class="stat-value">${{fmt(s.median)}}</span></div>
    <div class="stat-row"><span class="stat-label">📉 Pire</span><span class="stat-value">${{fmt(s.worst)}}</span></div>
    <div class="stat-row"><span class="stat-label">📏 Éc.-type</span><span class="stat-value">${{s.std.toFixed(3)}}s</span></div>
    <div class="bar-track"><div class="bar-label"><span>Régularité</span><span>${{cons}}%</span></div><div class="bar-bg"><div class="bar-fill" style="width:${{cons}}%;background:${{PALETTE[i]}}"></div></div></div>`;
  document.getElementById('statsGrid').appendChild(c);
}});

// RANKING
sorted.forEach((s,i)=>{{
  const cons=s.std?Math.round((1-s.std/maxStd)*100):100;
  const tr=document.createElement('tr');if(i<3)tr.classList.add('top3');
  tr.innerHTML=`<td><span class="rank-badge ${{i<3?'r'+(i+1):''}}">  ${{i+1}}</span></td>
    <td><span class="dot" style="background:${{PALETTE[i]}}"></span>${{s.name}}</td>
    <td class="best-time">${{s.best_fmt.split(':').slice(1).join(':')}}</td>
    <td style="font-variant-numeric:tabular-nums">${{s.mean_fmt.split(':').slice(1).join(':')}}</td>
    <td style="font-variant-numeric:tabular-nums">${{fmt(s.median)}}</td>
    <td>${{s.std.toFixed(3)}}s</td><td>${{s.count}}</td>
    <td><div class="bar-mini"><div class="bar-mini-fill" style="width:${{cons}}%;background:${{PALETTE[i]}}"></div></div>${{cons}}%</td>`;
  document.getElementById('rankingBody').appendChild(tr);
}});

// CHARTS (lazy — built once when tab shown)
let chartsBuilt=false;
const origShowTab=window.showTab;
window.showTab=function(name,btn){{
  origShowTab(name,btn);
  if(name==='graphiques'&&!chartsBuilt){{buildCharts();chartsBuilt=true;}}
}};

function buildCharts(){{
  const cOpts={{responsive:true,plugins:{{legend:{{labels:{{color:'#7b82a8',font:{{size:10}}}}}}}},
    scales:{{x:{{ticks:{{color:'#7b82a8',font:{{size:9}}}},grid:{{color:'#1e2136'}}}},y:{{ticks:{{color:'#7b82a8',font:{{size:9}}}},grid:{{color:'#1e2136'}}}}}}}};
  const top20=sorted.slice(0,{top_n_bar});
  const shortName=s=>s.name.split(' ')[0];

  new Chart(document.getElementById('chartBest'),{{type:'bar',
    data:{{labels:sorted.map(s=>s.name),datasets:[{{label:'Meilleur (s)',data:sorted.map(s=>s.best),backgroundColor:sorted.map((_,i)=>color(i,.85)),borderRadius:4}}]}},
    options:{{...cOpts,plugins:{{legend:{{display:false}}}},scales:{{x:{{ticks:{{color:'#7b82a8',font:{{size:8}},maxRotation:40}},grid:{{color:'#1e2136'}}}},y:{{min:{LAP_MIN},max:{LAP_MAX},ticks:{{color:'#7b82a8',callback:v=>fmt(v)}},grid:{{color:'#1e2136'}}}}}}}}
  }});

  new Chart(document.getElementById('chartBestMean'),{{type:'bar',
    data:{{labels:top20.map(shortName),datasets:[
      {{label:'Meilleur',data:top20.map(s=>s.best),backgroundColor:top20.map((_,i)=>color(i,.9)),borderRadius:4}},
      {{label:'Moyenne',data:top20.map(s=>s.mean),backgroundColor:top20.map((_,i)=>color(i,.35)),borderRadius:4}},
    ]}},
    options:{{...cOpts,scales:{{x:{{ticks:{{color:'#7b82a8',font:{{size:9}},maxRotation:35}},grid:{{color:'#1e2136'}}}},y:{{min:{LAP_MIN},max:{LAP_MAX},ticks:{{color:'#7b82a8',callback:v=>fmt(v)}},grid:{{color:'#1e2136'}}}}}}}}
  }});

  new Chart(document.getElementById('chartStd'),{{type:'bar',
    data:{{labels:top20.map(shortName),datasets:[{{label:'Éc.-type',data:top20.map(s=>s.std),backgroundColor:top20.map((_,i)=>color(i,.85)),borderRadius:4}}]}},
    options:{{...cOpts,plugins:{{legend:{{display:false}}}},scales:{{x:{{ticks:{{color:'#7b82a8',font:{{size:9}},maxRotation:35}},grid:{{color:'#1e2136'}}}},y:{{ticks:{{color:'#7b82a8'}},grid:{{color:'#1e2136'}},beginAtZero:true}}}}}}
  }});

  new Chart(document.getElementById('chartLine'),{{type:'line',
    data:{{labels:Array.from({{length:150}},(_,i)=>i+1),
      datasets:sorted.slice(0,{top_n_line}).map((s,i)=>{{
        return {{label:shortName(s),data:[...LAPS[s.id]].sort((a,b)=>a-b),
          borderColor:PALETTE[i],backgroundColor:'transparent',pointRadius:0,borderWidth:2,tension:.3}};}})}},
    options:{{...cOpts,scales:{{x:{{ticks:{{color:'#7b82a8',maxTicksLimit:15}},grid:{{color:'#1e2136'}},title:{{display:true,text:'Tour classé',color:'#7b82a8'}}}},y:{{min:{LAP_MIN},max:{LAP_MAX},ticks:{{color:'#7b82a8',callback:v=>fmt(v)}},grid:{{color:'#1e2136'}}}}}}}}
  }});

  const topR=sorted.slice(0,{top_n_radar});
  new Chart(document.getElementById('chartRadar'),{{type:'radar',
    data:{{labels:['Meilleur','Moyenne','Régularité','Volume','Top 10%'],
      datasets:topR.map((s,i)=>{{
        return {{label:shortName(s),
          data:[normalize(topR.map(x=>x.best),true)[i],normalize(topR.map(x=>x.mean),true)[i],
            normalize(topR.map(x=>x.std||0),true)[i],normalize(topR.map(x=>x.count))[i],
            normalize(topR.map(x=>{{const l=[...LAPS[x.id]].sort((a,b)=>a-b);const n=Math.max(1,Math.floor(l.length*.1));return l.slice(0,n).reduce((a,b)=>a+b,0)/n;}}),true)[i]],
          borderColor:PALETTE[i],backgroundColor:color(i,.1),pointBackgroundColor:PALETTE[i],borderWidth:2}};}})}},
    options:{{responsive:true,plugins:{{legend:{{labels:{{color:'#7b82a8',font:{{size:10}}}}}}}},
      scales:{{r:{{ticks:{{display:false}},grid:{{color:'#2e3250'}},pointLabels:{{color:'#7b82a8',font:{{size:10}}}},angleLines:{{color:'#2e3250'}},min:0,max:100}}}}}}
  }});

  new Chart(document.getElementById('chartCount'),{{type:'doughnut',
    data:{{labels:sorted.map(s=>s.name),datasets:[{{data:sorted.map(s=>s.count),backgroundColor:PALETTE,borderWidth:2,borderColor:'#1a1d27'}}]}},
    options:{{responsive:true,plugins:{{legend:{{labels:{{color:'#7b82a8',font:{{size:10}}}},position:'bottom'}}}}}}
  }});
}}

// LAP TABLE
const tabsEl=document.getElementById('pilotTabs');
const lapBody=document.getElementById('lapTableBody');
let activeId=sorted[0].id;
function renderLapTable(pid){{
  const laps=[...LAPS[pid]].sort((a,b)=>a-b),best=laps[0];
  lapBody.innerHTML=laps.map((t,i)=>{{
    const delta=t-best,pct=Math.round((1-i/laps.length)*100);
    const rc=i===0?'r1':i===1?'r2':i===2?'r3':'';
    const ds=i===0?'<span style="color:#2ecc71">★ Meilleur</span>':`<span style="color:#e63946">+${{delta.toFixed(3)}}s</span>`;
    return `<tr class="${{i===0?'best-lap':''}}"><td><span class="rank-badge ${{rc}}">${{i+1}}</span></td><td>${{fmt(t)}}</td><td>${{t.toFixed(3)}}s</td><td>${{ds}}</td>
      <td><div style="display:flex;align-items:center;gap:6px"><div style="width:${{pct}}px;max-width:90px;height:4px;background:${{PALETTE[sorted.findIndex(s=>s.id===pid)]}};border-radius:3px;opacity:.7"></div>${{pct}}%</div></td></tr>`;
  }}).join('');
}}
sorted.forEach((s,i)=>{{
  const btn=document.createElement('button');btn.className='tab-btn'+(s.id===activeId?' active':'');
  btn.textContent=s.name.split(' ')[0];
  if(s.id===activeId){{btn.style.background=PALETTE[i];btn.style.color='#fff';}}
  btn.onclick=()=>{{
    activeId=s.id;
    document.querySelectorAll('.tab-btn').forEach(b=>{{b.classList.remove('active');b.style.background='';b.style.color='';}});
    btn.classList.add('active');btn.style.background=PALETTE[i];btn.style.color='#fff';
    renderLapTable(s.id);
  }};
  tabsEl.appendChild(btn);
}});
renderLapTable(activeId);

// EVOLUTION
const evoCharts={{}};
function buildEvo(){{
  const container=document.getElementById('evoContent');
  if(container.dataset.built) return;
  container.dataset.built='1';

  const pids=Object.keys(HISTORY);
  if(!pids.length){{
    container.innerHTML='<div class="badge-inconnu">Pas encore assez de sessions pour afficher l\\'évolution.<br>Il faut au moins 2 sessions enregistrées par pilote.</div>';
    return;
  }}

  const grid=document.createElement('div');grid.className='evo-grid';

  // Graphique global — tous les pilotes
  const globalCard=document.createElement('div');globalCard.className='evo-card full-width';globalCard.style.gridColumn='1/-1';
  globalCard.innerHTML='<div class="evo-name">📈 Évolution du meilleur tour — Tous les pilotes</div><canvas id="evoGlobal" height="160"></canvas>';
  grid.appendChild(globalCard);

  // Une carte par pilote
  pids.forEach((pid,idx)=>{{
    const p=HISTORY[pid];
    const card=document.createElement('div');card.className='evo-card';
    const cid=`evo_${{pid}}`;
    card.innerHTML=`<div class="evo-name" style="color:${{PALETTE[idx%PALETTE.length]}}">${{p.name}}</div><canvas id="${{cid}}" height="160"></canvas>`;
    grid.appendChild(card);
  }});

  container.appendChild(grid);

  // Build global chart
  const allDates=[...new Set(pids.flatMap(pid=>HISTORY[pid].sessions.map(s=>s.date)))].sort();
  new Chart(document.getElementById('evoGlobal'),{{type:'line',
    data:{{labels:allDates,
      datasets:pids.map((pid,i)=>{{
        const p=HISTORY[pid];
        return {{label:p.name.split(' ')[0],
          data:allDates.map(d=>{{const s=p.sessions.find(s=>s.date===d);return s?s.best:null;}}),
          borderColor:PALETTE[i%PALETTE.length],backgroundColor:'transparent',
          pointRadius:5,pointHoverRadius:7,borderWidth:2,tension:.3,spanGaps:false}};
      }})}},
    options:{{responsive:true,plugins:{{legend:{{labels:{{color:'#7b82a8',font:{{size:10}}}}}}}},
      scales:{{x:{{ticks:{{color:'#7b82a8',font:{{size:9}}}},grid:{{color:'#1e2136'}}}},
        y:{{ticks:{{color:'#7b82a8',callback:v=>fmt(v)}},grid:{{color:'#1e2136'}},reverse:false}}}}}}
  }});

  // Build individual charts
  pids.forEach((pid,idx)=>{{
    const p=HISTORY[pid];
    const col=PALETTE[idx%PALETTE.length];
    new Chart(document.getElementById(`evo_${{pid}}`),{{type:'line',
      data:{{labels:p.sessions.map(s=>s.date),
        datasets:[
          {{label:'Meilleur tour',data:p.sessions.map(s=>s.best),borderColor:col,backgroundColor:'transparent',pointRadius:5,borderWidth:2,tension:.3}},
          {{label:'Moyenne',data:p.sessions.map(s=>s.mean),borderColor:col,backgroundColor:`${{col}}22`,pointRadius:3,borderWidth:1.5,tension:.3,borderDash:[4,3]}},
        ]}},
      options:{{responsive:true,plugins:{{legend:{{labels:{{color:'#7b82a8',font:{{size:9}}}}}}}},
        scales:{{x:{{ticks:{{color:'#7b82a8',font:{{size:8}}}},grid:{{color:'#1e2136'}}}},
          y:{{ticks:{{color:'#7b82a8',callback:v=>fmt(v)}},grid:{{color:'#1e2136'}}}}}}}}
    }});
  }});
}}
</script>
</body>
</html>"""

    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(html)

# ══════════════════════════════════════════════════════════════════════════════
#  GÉNÉRATION PDF (identique à avant)
# ══════════════════════════════════════════════════════════════════════════════

def generate_pdf(stats, session_dates, output_path):
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.lib import colors
        from reportlab.lib.units import mm
        from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.enums import TA_CENTER
    except ImportError:
        return "PDF ignoré — pip install reportlab"

    if len(session_dates) == 1:
        d = list(session_dates)[0]; date_label = d.strftime('%d/%m/%Y')
    else:
        date_label = " + ".join(sorted(d.strftime('%d/%m/%Y') for d in session_dates))

    BG=colors.HexColor('#0f1117'); SUR=colors.HexColor('#1a1d27'); SUR2=colors.HexColor('#222535')
    BOR=colors.HexColor('#2e3250'); GOLD=colors.HexColor('#FFD700'); SIL=colors.HexColor('#C0C0C0')
    BRZ=colors.HexColor('#CD7F32'); TEXT=colors.HexColor('#e8eaf0'); MUT=colors.HexColor('#7b82a8')
    W,H=A4

    doc=SimpleDocTemplate(str(output_path),pagesize=A4,leftMargin=15*mm,rightMargin=15*mm,topMargin=15*mm,bottomMargin=15*mm)
    def sty(name,**kw): return ParagraphStyle(name,parent=getSampleStyleSheet()['Normal'],**kw)

    story=[]
    hdr=Table([[Paragraph(f'Session <font color="#e63946">MRCP</font>',sty('h',fontSize=20,textColor=TEXT,fontName='Helvetica-Bold',alignment=1)),
                Paragraph(date_label,sty('d',fontSize=10,textColor=MUT,fontName='Helvetica',alignment=1))]],
              colWidths=[(W-30*mm)*.7,(W-30*mm)*.3])
    hdr.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,-1),SUR),('BOX',(0,0),(-1,-1),1,BOR),
        ('VALIGN',(0,0),(-1,-1),'MIDDLE'),('TOPPADDING',(0,0),(-1,-1),10),('BOTTOMPADDING',(0,0),(-1,-1),10)]))
    story.append(hdr); story.append(Spacer(1,5*mm))

    story.append(Paragraph('PODIUM',sty('s',fontSize=8,textColor=MUT,fontName='Helvetica-Bold',spaceAfter=5)))
    def pod(s,medal,tc,bg,bc):
        inner=[[Paragraph(medal,sty('m',fontSize=24,textColor=TEXT,fontName='Helvetica-Bold',alignment=1))],
               [Paragraph(s['name'],sty('n',fontSize=10,textColor=TEXT,fontName='Helvetica-Bold',alignment=1))],
               [Paragraph(fmt_sec(s['best']),sty('t',fontSize=16,textColor=tc,fontName='Helvetica-Bold',alignment=1))],
               [Paragraph(f"Moy. {fmt_sec(s['mean'])}",sty('y',fontSize=7,textColor=MUT,fontName='Helvetica',alignment=1))]]
        t=Table(inner,colWidths=[(W-30*mm)/3-4*mm])
        t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,-1),bg),('BOX',(0,0),(-1,-1),1.5,bc),
            ('TOPPADDING',(0,0),(-1,-1),6),('BOTTOMPADDING',(0,0),(-1,-1),6),('ALIGN',(0,0),(-1,-1),'CENTER')]))
        return t

    p1=stats[0]; p2=stats[1] if len(stats)>1 else stats[0]; p3=stats[2] if len(stats)>2 else None
    pod_row=[pod(p2,'🥈',SIL,colors.HexColor('#141416'),SIL),pod(p1,'🥇',GOLD,colors.HexColor('#1e1a08'),GOLD)]
    if p3: pod_row.append(pod(p3,'🥉',BRZ,colors.HexColor('#1a1208'),BRZ))
    else: pod_row.append(Paragraph('',sty('empty',fontSize=8,textColor=MUT)))
    pt=Table([pod_row],colWidths=[(W-30*mm)/3]*3)
    pt.setStyle(TableStyle([('LEFTPADDING',(0,0),(-1,-1),2),('RIGHTPADDING',(0,0),(-1,-1),2),('VALIGN',(0,0),(-1,-1),'BOTTOM')]))
    story.append(pt); story.append(Spacer(1,5*mm))

    story.append(Paragraph('CLASSEMENT COMPLET',sty('s2',fontSize=8,textColor=MUT,fontName='Helvetica-Bold',spaceAfter=5)))
    cw=[(W-30*mm)*p for p in [0.05,0.28,0.15,0.14,0.13,0.10,0.08,0.07]]
    hdrs=[Paragraph(f'<b>{t}</b>',sty(f'h{i}',fontSize=7,textColor=MUT,fontName='Helvetica-Bold',alignment=1))
          for i,t in enumerate(['Rang','Pilote','Meilleur','Moyenne','Médiane','Éc.-type','Tours','Régul.'])]
    hdrs[1]=Paragraph('<b>Pilote</b>',sty('hp',fontSize=7,textColor=MUT,fontName='Helvetica-Bold'))
    max_std=max((s['std'] for s in stats if s['std']),default=1)
    rows=[hdrs]
    cmds=[('BACKGROUND',(0,0),(-1,0),SUR2),('ROWBACKGROUNDS',(0,1),(-1,-1),[SUR,colors.HexColor('#1e2030')]),
        ('FONTNAME',(0,0),(-1,-1),'Helvetica'),('FONTSIZE',(0,0),(-1,-1),8),('TEXTCOLOR',(0,0),(-1,-1),TEXT),
        ('ALIGN',(0,0),(-1,-1),'CENTER'),('ALIGN',(1,0),(1,-1),'LEFT'),('VALIGN',(0,0),(-1,-1),'MIDDLE'),
        ('TOPPADDING',(0,0),(-1,-1),4),('BOTTOMPADDING',(0,0),(-1,-1),4),('LEFTPADDING',(0,0),(-1,-1),4),('RIGHTPADDING',(0,0),(-1,-1),4),
        ('BOX',(0,0),(-1,-1),0.5,BOR),('LINEBELOW',(0,0),(-1,0),1,BOR)]
    for i,s in enumerate(stats):
        rank=i+1; cons=int((1-s['std']/max_std)*100) if s['std'] else 100
        rows.append([
            Paragraph({1:'🥇',2:'🥈',3:'🥉'}.get(rank,str(rank)),sty(f'r{i}',fontSize=8,textColor=TEXT,fontName='Helvetica-Bold',alignment=1)),
            Paragraph(f'<font color="{PALETTE[i%len(PALETTE)]}">■</font>  {s["name"]}',sty(f'n{i}',fontSize=8,textColor=TEXT,fontName='Helvetica-Bold' if rank<=3 else 'Helvetica')),
            Paragraph(fmt_sec(s['best']),sty(f'b{i}',fontSize=8,textColor='#2ecc71',fontName='Helvetica-Bold',alignment=1)),
            Paragraph(fmt_sec(s['mean']),sty(f'm{i}',fontSize=8,textColor=TEXT,fontName='Helvetica',alignment=1)),
            Paragraph(fmt_sec(s['median']),sty(f'med{i}',fontSize=8,textColor=TEXT,fontName='Helvetica',alignment=1)),
            Paragraph(f"{s['std']:.3f}s",sty(f'st{i}',fontSize=8,textColor=TEXT,fontName='Helvetica',alignment=1)),
            Paragraph(str(s['count']),sty(f'c{i}',fontSize=8,textColor=TEXT,fontName='Helvetica',alignment=1)),
            Paragraph(f'{cons}%',sty(f'co{i}',fontSize=8,textColor=TEXT,fontName='Helvetica',alignment=1)),
        ])
        if rank<=3:
            cmds.append(('BACKGROUND',(0,rank),(-1,rank),{1:colors.HexColor('#1e1a08'),2:colors.HexColor('#141416'),3:colors.HexColor('#1a1208')}[rank]))

    tbl=Table(rows,colWidths=cw,repeatRows=1); tbl.setStyle(TableStyle(cmds)); story.append(tbl)
    story.append(Spacer(1,6*mm))
    story.append(Paragraph(f'MRCP · {date_label} · Tours {LAP_MIN}s–{LAP_MAX}s · {len(stats)} pilote(s)',
        sty('ft',fontSize=7,textColor=MUT,fontName='Helvetica',alignment=1)))

    def dark(c,d): c.saveState(); c.setFillColor(BG); c.rect(0,0,W,H,fill=1,stroke=0); c.restoreState()
    doc.build(story,onFirstPage=dark,onLaterPages=dark)
    return None

# ══════════════════════════════════════════════════════════════════════════════
#  INTERFACE GRAPHIQUE
# ══════════════════════════════════════════════════════════════════════════════

class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("SpeedHive MRCP — Dashboard")
        self.geometry("820x700")
        self.configure(bg='#0f1117')
        self.resizable(True, True)

        self.activities   = []
        self.dates        = []
        self.date_vars    = {}
        self.pilots_map   = load_pilots()
        self.last_html    = None

        self._build_ui()

    # ── UI ────────────────────────────────────────────────────────────────────

    def _build_ui(self):
        # Couleurs
        BG, SUR, TEXT, MUTED, ACC = '#0f1117', '#1a1d27', '#e8eaf0', '#7b82a8', '#e63946'

        # Header
        hdr = tk.Frame(self, bg='#1a1d27', pady=12)
        hdr.pack(fill='x')
        tk.Label(hdr, text="SpeedHive  MRCP", font=('Segoe UI', 18, 'bold'),
                 bg='#1a1d27', fg=ACC).pack(side='left', padx=20)
        tk.Label(hdr, text="Dashboard automatique", font=('Segoe UI', 10),
                 bg='#1a1d27', fg=MUTED).pack(side='left')

        # Notebook (onglets)
        style = ttk.Style(self)
        style.theme_use('clam')
        style.configure('TNotebook', background=BG, borderwidth=0)
        style.configure('TNotebook.Tab', background='#1a1d27', foreground=MUTED,
                         padding=[14,6], font=('Segoe UI',10))
        style.map('TNotebook.Tab', background=[('selected','#222535')], foreground=[('selected',TEXT)])

        nb = ttk.Notebook(self)
        nb.pack(fill='both', expand=True, padx=0, pady=0)

        # ── Onglet 1 : Téléchargement ──────────────────────────────────────
        self.tab_dl = tk.Frame(nb, bg=BG)
        nb.add(self.tab_dl, text='📥  Téléchargement')
        self._build_tab_download(self.tab_dl, BG, SUR, TEXT, MUTED, ACC)

        # ── Onglet 2 : Pilotes inconnus ────────────────────────────────────
        self.tab_pilots = tk.Frame(nb, bg=BG)
        nb.add(self.tab_pilots, text='👥  Pilotes')
        self._build_tab_pilots(self.tab_pilots, BG, SUR, TEXT, MUTED, ACC)

        # ── Onglet 3 : Log ─────────────────────────────────────────────────
        self.tab_log = tk.Frame(nb, bg=BG)
        nb.add(self.tab_log, text='📋  Journal')
        self._build_tab_log(self.tab_log, BG, SUR, TEXT, MUTED)

    def _build_tab_download(self, parent, BG, SUR, TEXT, MUTED, ACC):
        # Bouton charger dates
        top = tk.Frame(parent, bg=BG, pady=14)
        top.pack(fill='x', padx=20)

        tk.Label(top, text=f"Piste : {LOCATION_URL}", font=('Segoe UI',9),
                 bg=BG, fg=MUTED).pack(anchor='w')

        btn_frame = tk.Frame(top, bg=BG)
        btn_frame.pack(anchor='w', pady=8)

        self._btn(btn_frame, "🔄  Charger les dates", ACC, self._load_dates).pack(side='left', padx=(0,10))
        self._btn(btn_frame, "✅  Tout sélectionner", '#2ecc71', self._select_all).pack(side='left', padx=(0,10))
        self._btn(btn_frame, "☐  Tout déselectionner", MUTED, self._deselect_all).pack(side='left')

        # Zone dates
        dates_outer = tk.Frame(parent, bg=BG, padx=20)
        dates_outer.pack(fill='x')
        tk.Label(dates_outer, text="Sélectionne une ou plusieurs dates :", font=('Segoe UI',10,'bold'),
                 bg=BG, fg=TEXT).pack(anchor='w', pady=(0,6))

        dates_frame_outer = tk.Frame(dates_outer, bg=SUR, bd=0, highlightbackground='#2e3250', highlightthickness=1)
        dates_frame_outer.pack(fill='x')

        canvas = tk.Canvas(dates_frame_outer, bg=SUR, highlightthickness=0, height=180)
        sb = ttk.Scrollbar(dates_frame_outer, orient='vertical', command=canvas.yview)
        canvas.configure(yscrollcommand=sb.set)
        sb.pack(side='right', fill='y')
        canvas.pack(side='left', fill='both', expand=True)

        self.dates_frame = tk.Frame(canvas, bg=SUR)
        self.dates_canvas_window = canvas.create_window((0,0), window=self.dates_frame, anchor='nw')
        self.dates_frame.bind('<Configure>', lambda e: canvas.configure(scrollregion=canvas.bbox('all')))
        canvas.bind('<Configure>', lambda e: canvas.itemconfig(self.dates_canvas_window, width=e.width))

        self.dates_canvas = canvas

        # Séparateur
        tk.Frame(parent, bg='#2e3250', height=1).pack(fill='x', pady=14, padx=20)

        # Bouton générer
        gen_frame = tk.Frame(parent, bg=BG, padx=20)
        gen_frame.pack(fill='x')
        tk.Label(gen_frame, text="Génère :", font=('Segoe UI',10,'bold'), bg=BG, fg=TEXT).pack(anchor='w', pady=(0,6))

        self.var_html = tk.BooleanVar(value=True)
        self.var_pdf  = tk.BooleanVar(value=True)

        checks = tk.Frame(gen_frame, bg=BG)
        checks.pack(anchor='w', pady=(0,10))
        self._check(checks, "Dashboard HTML interactif", self.var_html, ACC).pack(side='left', padx=(0,20))
        self._check(checks, "PDF classement", self.var_pdf, ACC).pack(side='left')

        self.btn_gen = self._btn(gen_frame, "🚀  Télécharger & Générer", '#2ecc71', self._run)
        self.btn_gen.pack(anchor='w')

        # Barre de progression
        prog_frame = tk.Frame(parent, bg=BG, padx=20, pady=10)
        prog_frame.pack(fill='x')
        self.progress = ttk.Progressbar(prog_frame, mode='determinate', length=400)
        self.progress.pack(anchor='w')
        self.lbl_status = tk.Label(prog_frame, text="", font=('Segoe UI',9), bg=BG, fg=MUTED)
        self.lbl_status.pack(anchor='w', pady=(4,0))

        # Bouton ouvrir rapport
        self.btn_open = self._btn(parent, "🌐  Ouvrir le rapport HTML", '#4cc9f0', self._open_report)
        self.btn_open.pack(anchor='w', padx=20, pady=8)
        self.btn_open.config(state='disabled')

    def _build_tab_pilots(self, parent, BG, SUR, TEXT, MUTED, ACC):
        tk.Label(parent, text="Annuaire des pilotes", font=('Segoe UI',12,'bold'),
                 bg=BG, fg=TEXT).pack(anchor='w', padx=20, pady=(14,4))
        tk.Label(parent, text="Ajoute ici les transpondeurs inconnus. Les données sont sauvegardées dans pilotes.json",
                 font=('Segoe UI',9), bg=BG, fg=MUTED, wraplength=600, justify='left').pack(anchor='w', padx=20, pady=(0,10))

        # Formulaire ajout
        form = tk.Frame(parent, bg=SUR, padx=14, pady=10)
        form.pack(fill='x', padx=20, pady=(0,10))
        tk.Label(form, text="Transpondeur :", font=('Segoe UI',9), bg=SUR, fg=MUTED).grid(row=0,column=0,sticky='w',padx=(0,8))
        self.entry_transp = tk.Entry(form, font=('Segoe UI',10), bg='#222535', fg=TEXT, insertbackground=TEXT, relief='flat', width=14)
        self.entry_transp.grid(row=0,column=1,padx=(0,16))
        tk.Label(form, text="Nom du pilote :", font=('Segoe UI',9), bg=SUR, fg=MUTED).grid(row=0,column=2,sticky='w',padx=(0,8))
        self.entry_name = tk.Entry(form, font=('Segoe UI',10), bg='#222535', fg=TEXT, insertbackground=TEXT, relief='flat', width=22)
        self.entry_name.grid(row=0,column=3,padx=(0,12))
        self._btn(form, "Ajouter", ACC, self._add_pilot).grid(row=0,column=4)

        # Liste
        list_frame = tk.Frame(parent, bg=SUR, bd=0, highlightbackground='#2e3250', highlightthickness=1)
        list_frame.pack(fill='both', expand=True, padx=20, pady=(0,14))

        cols = ('Transpondeur','Nom')
        self.pilot_tree = ttk.Treeview(list_frame, columns=cols, show='headings', height=18)
        style = ttk.Style()
        style.configure('Treeview', background=SUR, foreground=TEXT, fieldbackground=SUR, rowheight=24)
        style.configure('Treeview.Heading', background='#222535', foreground=MUTED, font=('Segoe UI',9,'bold'))
        for col in cols:
            self.pilot_tree.heading(col, text=col)
            self.pilot_tree.column(col, width=200)
        sb = ttk.Scrollbar(list_frame, orient='vertical', command=self.pilot_tree.yview)
        self.pilot_tree.configure(yscrollcommand=sb.set)
        sb.pack(side='right', fill='y')
        self.pilot_tree.pack(fill='both', expand=True)
        self._refresh_pilot_list()

    def _build_tab_log(self, parent, BG, SUR, TEXT, MUTED):
        tk.Label(parent, text="Journal des opérations", font=('Segoe UI',11,'bold'),
                 bg=BG, fg=TEXT).pack(anchor='w', padx=20, pady=(14,6))
        self.log_text = scrolledtext.ScrolledText(parent, font=('Consolas',9), bg=SUR, fg=TEXT,
                                                   insertbackground=TEXT, relief='flat', bd=0,
                                                   highlightthickness=0, padx=10, pady=8)
        self.log_text.pack(fill='both', expand=True, padx=20, pady=(0,14))
        self.log_text.config(state='disabled')

    # ── Widgets helpers ───────────────────────────────────────────────────────

    def _btn(self, parent, text, color, cmd):
        b = tk.Button(parent, text=text, font=('Segoe UI',10,'bold'),
                      bg=color, fg='#ffffff', activebackground=color,
                      relief='flat', padx=14, pady=6, cursor='hand2', command=cmd)
        return b

    def _check(self, parent, text, var, color):
        return tk.Checkbutton(parent, text=text, variable=var,
                              font=('Segoe UI',9), bg='#0f1117', fg='#e8eaf0',
                              selectcolor='#222535', activebackground='#0f1117',
                              activeforeground='#e8eaf0')

    # ── Logique ───────────────────────────────────────────────────────────────

    def log(self, msg):
        self.log_text.config(state='normal')
        self.log_text.insert('end', msg+'\n')
        self.log_text.see('end')
        self.log_text.config(state='disabled')
        self.update_idletasks()

    def status(self, msg, pct=None):
        self.lbl_status.config(text=msg)
        if pct is not None:
            self.progress['value'] = pct
        self.update_idletasks()

    def _load_dates(self):
        self.status("Chargement des activités...", 10)
        self.log("→ Récupération des activités SpeedHive...")
        def task():
            try:
                self.activities = get_activities(limit=100)
                dates = sorted(set(
                    parse_date(a["startTime"])
                    for a in self.activities
                    if a.get("startTime") and parse_date(a["startTime"])
                ), reverse=True)
                self.dates = dates
                self.after(0, self._populate_dates)
                self.log(f"  {len(self.activities)} activités récupérées, {len(dates)} date(s) disponibles")
                self.status("Dates chargées ✓", 0)
            except Exception as e:
                self.after(0, lambda: messagebox.showerror("Erreur", str(e)))
                self.log(f"  ERREUR : {e}")
                self.status("Erreur de connexion", 0)
        threading.Thread(target=task, daemon=True).start()

    def _populate_dates(self):
        for w in self.dates_frame.winfo_children():
            w.destroy()
        self.date_vars = {}
        for d in self.dates:
            count = sum(1 for a in self.activities if parse_date(a.get("startTime","")) == d)
            var = tk.BooleanVar(value=False)
            self.date_vars[d] = var
            row = tk.Frame(self.dates_frame, bg='#1a1d27')
            row.pack(fill='x', pady=1)
            tk.Checkbutton(row, text=f"  {d.strftime('%d/%m/%Y')}  —  {count} session(s)",
                           variable=var, font=('Segoe UI',10), bg='#1a1d27', fg='#e8eaf0',
                           selectcolor='#222535', activebackground='#1a1d27').pack(anchor='w', padx=8)

    def _select_all(self):
        for var in self.date_vars.values(): var.set(True)

    def _deselect_all(self):
        for var in self.date_vars.values(): var.set(False)

    def _run(self):
        selected_dates = [d for d, var in self.date_vars.items() if var.get()]
        if not selected_dates:
            messagebox.showwarning("Sélection vide", "Sélectionne au moins une date.")
            return
        self.btn_gen.config(state='disabled')
        self.btn_open.config(state='disabled')
        threading.Thread(target=self._run_pipeline, args=(selected_dates,), daemon=True).start()

    def _run_pipeline(self, selected_dates):
        OUTPUT_DIR.mkdir(exist_ok=True)
        REPORTS_DIR.mkdir(exist_ok=True)

        date_slug = "_".join(d.strftime('%d%m%Y') for d in sorted(selected_dates))

        self.log(f"\n{'='*50}")
        self.log(f"Session(s) : {', '.join(d.strftime('%d/%m/%Y') for d in sorted(selected_dates))}")
        self.log(f"{'='*50}")

        # 1. Filtrer
        self.status("Filtrage des activités...", 10)
        pilots = filter_activities(self.activities, selected_dates)
        self.log(f"\n→ {len(pilots)} pilote(s) trouvé(s)")

        # 2. Télécharger
        self.status("Téléchargement des CSV...", 20)
        self.log("\n→ Téléchargement des CSV...")
        csv_files = []
        for i, pilot in enumerate(pilots):
            pct = 20 + int((i/len(pilots))*40)
            self.status(f"Téléchargement {i+1}/{len(pilots)}...", pct)
            try:
                f, msg = download_csv(pilot, OUTPUT_DIR)
                self.log(f"  {msg}")
                if f: csv_files.append(f)
            except Exception as e:
                self.log(f"  ERR {e}")
            time.sleep(0.3)

        if not csv_files:
            self.log("  Aucun CSV téléchargé.")
            self.status("Erreur — aucun CSV", 0)
            self.after(0, lambda: self.btn_gen.config(state='normal'))
            return

        # 3. Stats
        self.status("Calcul des statistiques...", 65)
        self.log(f"\n→ Calcul des statistiques (tours {LAP_MIN}s–{LAP_MAX}s)...")
        self.pilots_map = load_pilots()
        stats, lap_data, unknown = compute_stats(csv_files, self.pilots_map)
        self.log(f"  {len(stats)} pilote(s) avec des tours valides")
        if unknown:
            self.log(f"  ⚠ Transpondeurs inconnus : {', '.join(unknown)}")
            self.log(f"    → Ajoute-les dans l'onglet Pilotes !")

        # 4. Historique
        self.status("Mise à jour de l'historique...", 75)
        history = save_history(stats, selected_dates)
        self.log(f"\n→ Historique mis à jour ({len(history)} pilote(s))")

        # 5. HTML
        html_path = None
        if self.var_html.get():
            self.status("Génération HTML...", 82)
            html_path = REPORTS_DIR / f"session_mrcp_{date_slug}.html"
            generate_html(stats, lap_data, set(selected_dates), history, html_path)
            self.log(f"  HTML : {html_path}")
            self.last_html = html_path

        # 6. PDF
        if self.var_pdf.get():
            self.status("Génération PDF...", 92)
            pdf_path = REPORTS_DIR / f"session_mrcp_{date_slug}.pdf"
            err = generate_pdf(stats, set(selected_dates), pdf_path)
            if err: self.log(f"  {err}")
            else:   self.log(f"  PDF  : {pdf_path}")

        self.status(f"✓ Terminé — {len(stats)} pilotes analysés", 100)
        self.log(f"\n{'='*50}")
        self.log(f"✓ Rapports dans : {REPORTS_DIR.resolve()}")
        self.log(f"{'='*50}\n")

        self.after(0, lambda: self.btn_gen.config(state='normal'))
        if html_path:
            self.after(0, lambda: self.btn_open.config(state='normal'))

    def _open_report(self):
        if self.last_html and self.last_html.exists():
            webbrowser.open(self.last_html.resolve().as_uri())

    def _add_pilot(self):
        transp = self.entry_transp.get().strip()
        name   = self.entry_name.get().strip()
        if not transp or not name:
            messagebox.showwarning("Champs vides", "Remplis les deux champs.")
            return
        save_pilot(transp, name)
        self.pilots_map = load_pilots()
        self.entry_transp.delete(0,'end')
        self.entry_name.delete(0,'end')
        self._refresh_pilot_list()
        self.log(f"  Pilote ajouté : {transp} → {name}")

    def _refresh_pilot_list(self):
        for item in self.pilot_tree.get_children():
            self.pilot_tree.delete(item)
        for transp, name in sorted(self.pilots_map.items(), key=lambda x: x[1]):
            self.pilot_tree.insert('', 'end', values=(transp, name))

# ══════════════════════════════════════════════════════════════════════════════
#  POINT D'ENTRÉE
# ══════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    app = App()
    app.mainloop()
