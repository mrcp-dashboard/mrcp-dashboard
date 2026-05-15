#!/bin/bash
set -euo pipefail

PROJECT_ROOT="${MRCP_PROJECT_ROOT:-/opt/mrcp-dashboard}"
PROJECT_DIR="${MRCP_DOCS_DIR:-$PROJECT_ROOT/docs}"
PYTHON="${MRCP_PYTHON:-$PROJECT_ROOT/venv/bin/python}"

cd "$PROJECT_DIR"

if [ -f "$PROJECT_ROOT/venv/bin/activate" ]; then
  source "$PROJECT_ROOT/venv/bin/activate"
fi

"$PYTHON" fix_lap_overrides.py
"$PYTHON" build_data_v2.py
"$PYTHON" validate_dashboard_data.py
"$PYTHON" check_text_encoding.py
