#!/usr/bin/env bash
# Descarga los catálogos crudos a data/raw/. Solo hace falta si vas a
# regenerar los binarios de data/ con scripts/build-data.py (el repositorio
# ya incluye los binarios listos).
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p data/raw
curl -L --fail --progress-bar -o data/raw/hygdata_v41.csv \
  https://raw.githubusercontent.com/astronexus/HYG-Database/main/hyg/CURRENT/hygdata_v41.csv
curl -L --fail --progress-bar -o data/raw/constellations.lines.json \
  https://raw.githubusercontent.com/ofrohn/d3-celestial/master/data/constellations.lines.json
echo "Listo. Ahora regenera los binarios: python scripts/build-data.py"
