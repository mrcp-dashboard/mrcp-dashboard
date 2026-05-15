#!/bin/bash
set -euo pipefail

PROJECT_ROOT="${MRCP_PROJECT_ROOT:-/opt/mrcp-dashboard}"
PROJECT_DIR="${MRCP_DOCS_DIR:-$PROJECT_ROOT/docs}"
PYTHON="${MRCP_PYTHON:-$PROJECT_ROOT/venv/bin/python}"
GIT_BRANCH="${MRCP_GIT_BRANCH:-main}"

echo "============================================================"
echo "MRCP DASHBOARD AUTO UPDATE - $(date)"
echo "============================================================"

if [ -f "$PROJECT_ROOT/venv/bin/activate" ]; then
  source "$PROJECT_ROOT/venv/bin/activate"
fi

cd "$PROJECT_ROOT"
echo "[0/5] Synchronisation Git"
git pull --rebase origin "$GIT_BRANCH"

cd "$PROJECT_DIR"
echo "[1/5] Synchronisation SpeedHive"
"$PYTHON" speedhive_sync_linux.py --limit 200

echo "[2/5] Generation data_v2.json"
"$PYTHON" build_data_v2.py

echo "[3/5] Validation data_v2.json"
"$PYTHON" validate_dashboard_data.py

cd "$PROJECT_ROOT"
echo "[4/5] Git add"
git add docs

echo "[5/5] Git commit / push"
if git diff --cached --quiet; then
  echo "Aucun changement a publier"
else
  git commit -m "Auto update dashboard $(date '+%Y-%m-%d %H:%M')"
  git pull --rebase origin "$GIT_BRANCH"
  git push origin "$GIT_BRANCH"
fi

echo "Termine"
