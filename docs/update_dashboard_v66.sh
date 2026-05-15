#!/bin/bash
set -e

PROJECT_ROOT="${MRCP_PROJECT_ROOT:-/opt/mrcp-dashboard}"
PROJECT_DIR="${MRCP_DOCS_DIR:-$PROJECT_ROOT/docs}"

cd "$PROJECT_DIR"

echo "=== MRCP UPDATE V6.6 ==="

mkdir -p backups

if [ -f data_v2.json ]; then
  cp data_v2.json backups/data_v2_$(date +%Y%m%d_%H%M%S).json
  echo "Backup data_v2.json OK"
fi

if [ -f ../build_data_v2.py ]; then
  cd "$PROJECT_ROOT"
  ./venv/bin/python build_data_v2.py
  cd "$PROJECT_DIR"
elif [ -f build_data_v2.py ]; then
  ./../venv/bin/python build_data_v2.py || python build_data_v2.py
else
  echo "build_data_v2.py introuvable, backup uniquement."
fi

git add data_v2.json speedhive_reports/data_v2.json backups/ || true
git commit -m "Update data MRCP auto V6.6" || echo "Rien à commit"
git push || echo "Push échoué ou non configuré"

echo "=== UPDATE TERMINE ==="
