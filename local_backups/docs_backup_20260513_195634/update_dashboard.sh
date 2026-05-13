#!/bin/bash
set -e

PROJECT_DIR="/opt/mrcp-dashboard/docs"

cd "$PROJECT_DIR"

echo "============================================================"
echo "MRCP DASHBOARD AUTO UPDATE - $(date)"
echo "============================================================"

source ../venv/bin/activate

echo "[1/4] Synchronisation SpeedHive"
python speedhive_sync_linux.py --limit 200

echo "[2/4] Génération data_v2.json"
python build_data_v2.py

echo "[3/4] Git add"
cd /opt/mrcp-dashboard
git add docs

echo "[4/4] Git commit / push"
if git diff --cached --quiet; then
  echo "Aucun changement à publier"
else
  git commit -m "Auto update dashboard $(date '+%Y-%m-%d %H:%M')"
  git push
fi

echo "Terminé"
