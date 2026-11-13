#!/usr/bin/env bash
# Actualiza la base SIM con archivos nuevos de ARCA.
# 1) Bajá capitulo, nomenclador y sufijos de https://www.afip.gob.ar/aduana/arancelIntegrado/
# 2) Copialos a ncm/fuentes_arca/ (borrá los viejos)
# 3) Corré: bash ncm/actualizar.sh
set -e
cd "$(dirname "$0")"
python3 build_sim.py fuentes_arca
python3 compactar.py
python3 build_web.py
echo "Listo. Revisá y hacé commit."
