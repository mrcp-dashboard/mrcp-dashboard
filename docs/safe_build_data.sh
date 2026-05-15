#!/bin/bash
set -e

PROJECT_ROOT="${MRCP_PROJECT_ROOT:-/opt/mrcp-dashboard}"
PROJECT_DIR="${MRCP_DOCS_DIR:-$PROJECT_ROOT/docs}"

cd "$PROJECT_DIR"
source ../venv/bin/activate

python fix_lap_overrides.py
python build_data_v2.py
