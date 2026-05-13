#!/bin/bash
set -e

cd /opt/mrcp-dashboard/docs
source ../venv/bin/activate

python fix_lap_overrides.py
python build_data_v2.py
