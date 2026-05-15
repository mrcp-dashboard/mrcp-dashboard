#!/bin/bash
set -euo pipefail

PROJECT_ROOT="${MRCP_PROJECT_ROOT:-/opt/mrcp-dashboard}"
PROJECT_DIR="${MRCP_DOCS_DIR:-$PROJECT_ROOT/docs}"
PYTHON="${MRCP_PYTHON:-$PROJECT_ROOT/venv/bin/python}"
GIT_BRANCH="${MRCP_GIT_BRANCH:-main}"

cd "$PROJECT_DIR"

echo "=== MRCP UPDATE V6.6 ==="

mkdir -p backups

if [ -f data_v2.json ]; then
  cp data_v2.json "backups/data_v2_$(date +%Y%m%d_%H%M%S).json"
  echo "Backup data_v2.json OK"
fi

if [ -f build_data_v2.py ]; then
  "$PYTHON" build_data_v2.py
else
  echo "build_data_v2.py introuvable."
  exit 1
fi

"$PYTHON" validate_dashboard_data.py

cd "$PROJECT_ROOT"
git pull --rebase origin "$GIT_BRANCH"
git add docs/data_v2.json docs/speedhive_reports/data_v2.json

if git diff --cached --quiet; then
  echo "Rien a commit"
else
  git commit -m "Update data MRCP auto V6.6"
  git push origin "$GIT_BRANCH"
fi

echo "=== UPDATE TERMINE ==="
