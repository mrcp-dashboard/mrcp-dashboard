from pathlib import Path
from datetime import datetime
import shutil

root = Path("/opt/mrcp-dashboard/docs")

# -------------------------
# BACKUP JSON AUTO
# -------------------------

backup_dir = root / "backups"
backup_dir.mkdir(exist_ok=True)

data = root / "data_v2.json"
if data.exists():
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    shutil.copy2(data, backup_dir / f"data_v2_{stamp}.json")

# -------------------------
# CSS PREMIUM GLOBAL
# -------------------------

premium_css = root / "mrcp_v66_premium.css"

premium_css.write_text(r'''
:root{
  --mrcp-bg:#050814;
  --mrcp-panel:rgba(255,255,255,.085);
  --mrcp-border:rgba(255,255,255,.14);
  --mrcp-blue:#3557ff;
  --mrcp-gold:#ffe680;
  --mrcp-muted:#b8c7ff;
}

body{
  background:
    radial-gradient(circle at top left,rgba(53,87,255,.28),transparent 34%),
    radial-gradient(circle at top right,rgba(255,216,74,.14),transparent 28%),
    var(--mrcp-bg)!important;
}

header{
  box-shadow:0 18px 60px rgba(0,0,0,.28);
}

nav{
  flex-wrap:wrap;
}

nav button,
nav a{
  transition:.18s ease;
}

nav button:hover,
nav a:hover{
  transform:translateY(-2px);
  filter:brightness(1.15);
}

.item,
.pilot-card,
.rating-card,
.badge-card,
.hall-card,
.speaker-box{
  backdrop-filter:blur(12px);
  box-shadow:0 14px 40px rgba(0,0,0,.22);
}

.mrcp-home-link{
  position:fixed;
  left:18px;
  bottom:18px;
  z-index:99999;
  background:rgba(255,255,255,.12);
  color:white;
  text-decoration:none;
  padding:12px 16px;
  border-radius:999px;
  font-weight:bold;
  border:1px solid rgba(255,255,255,.18);
  box-shadow:0 10px 30px rgba(0,0,0,.28);
}

.mrcp-version-pill{
  position:fixed;
  right:18px;
  bottom:18px;
  z-index:99999;
  background:rgba(53,87,255,.24);
  color:#dce4ff;
  padding:10px 14px;
  border-radius:999px;
  font-size:13px;
  border:1px solid rgba(255,255,255,.14);
}

@media(max-width:900px){
  .live-app{
    padding:12px!important;
  }

  header{
    padding:18px!important;
    border-radius:18px!important;
  }

  h1{
    font-size:28px!important;
  }

  h2{
    font-size:24px!important;
  }

  nav{
    display:grid!important;
    grid-template-columns:repeat(2,1fr);
    gap:10px!important;
  }

  nav button,
  nav a{
    width:100%;
    text-align:center;
    padding:13px 10px!important;
    font-size:14px!important;
  }

  .stats,
  .big-stats,
  .cards-grid,
  .hall-grid{
    grid-template-columns:1fr!important;
  }

  .rating-card,
  .pilot-card{
    grid-template-columns:1fr!important;
  }

  .speaker-box{
    font-size:22px!important;
  }

  .mrcp-home-link,
  .mrcp-version-pill{
    position:static;
    display:block;
    margin:16px 0 0;
    text-align:center;
  }
}
''', encoding="utf-8")

# -------------------------
# INJECTION CSS DANS PAGES
# -------------------------

pages = [
    root / "live_center.html",
    root / "tv_paddock.html",
    root / "pilot_v65.html",
    root / "index_v2.html"
]

for page in pages:
    if not page.exists():
        continue

    s = page.read_text(encoding="utf-8", errors="ignore")

    if "mrcp_v66_premium.css" not in s:
        s = s.replace(
            "</head>",
            '  <link rel="stylesheet" href="mrcp_v66_premium.css?v=66">\n</head>'
        )

    if page.name != "index_v2.html" and "mrcp-home-link" not in s:
        s = s.replace(
            "</body>",
            '''
<a class="mrcp-home-link" href="index_v2.html">← Accueil MRCP</a>
<div class="mrcp-version-pill">MRCP V6.6 Premium</div>
</body>'''
        )

    page.write_text(s, encoding="utf-8")

# -------------------------
# SCRIPT UPDATE + BACKUP
# -------------------------

update = root / "update_dashboard_v66.sh"

update.write_text(r'''#!/bin/bash
set -e

cd /opt/mrcp-dashboard/docs

echo "=== MRCP UPDATE V6.6 ==="

mkdir -p backups

if [ -f data_v2.json ]; then
  cp data_v2.json backups/data_v2_$(date +%Y%m%d_%H%M%S).json
  echo "Backup data_v2.json OK"
fi

if [ -f ../build_data_v2.py ]; then
  cd /opt/mrcp-dashboard
  ./venv/bin/python build_data_v2.py
  cd /opt/mrcp-dashboard/docs
elif [ -f build_data_v2.py ]; then
  ./../venv/bin/python build_data_v2.py || python build_data_v2.py
else
  echo "build_data_v2.py introuvable, backup uniquement."
fi

git add data_v2.json speedhive_reports/data_v2.json backups/ || true
git commit -m "Update data MRCP auto V6.6" || echo "Rien à commit"
git push || echo "Push échoué ou non configuré"

echo "=== UPDATE TERMINE ==="
''', encoding="utf-8")

update.chmod(0o755)

print("OK V6.6 Clean & Premium installé")
print("CSS : mrcp_v66_premium.css")
print("Backup : backups/")
print("Script update : update_dashboard_v66.sh")
