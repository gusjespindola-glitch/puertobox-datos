"""Genera los datos del Nomenclador PuertoBox (web/nomenclador/data/*.json)
a partir de los archivos oficiales de ARCA ya procesados (ncm/sim.csv, ncm/sufijos.json)
y de las notas de sección y capítulo (ncm/fuentes_arca/capitulo_*.txt).

Uso: python3 ncm/build_nomenclador.py
"""
import csv
import glob
import json
import re
from pathlib import Path

here = Path(__file__).parent
out = here.parent / "web" / "nomenclador" / "data"
out.mkdir(parents=True, exist_ok=True)

# --- Posiciones SIM
textos, idx = [], {}
def tid(s):
    if s not in idx:
        idx[s] = len(textos)
        textos.append(s)
    return idx[s]

pos = []
with open(here / "sim.csv", encoding="utf-8") as f:
    for r in csv.DictReader(f):
        ids = [tid(x.strip()) for x in r["descripcion"].split(" > ")]
        num = lambda k: float(r[k]) if r[k] not in ("", None) else 0
        diem = r["die_especifico_minimo"].strip()
        pos.append([
            r["posicion_sim"], num("die"), num("dii"), num("de"), num("re"), num("ri"),
            diem, r["unidad_derecho_especifico"].strip(), r["unidad_estadistica"].strip(),
            round(num("impuestos_internos"), 4), ids,
        ])

# Reparar caracteres que llegan rotos ("n?mero" -> "número") usando el vocabulario correcto del propio arancel
vocab = {}
for t in textos:
    for w in re.findall(r"[^\W\d_]+", t):
        if "?" not in w:
            vocab.setdefault(w.lower(), w)
CAND = "áéíóúñüÁÉÍÓÚÑÜ"
def reparar_palabra(m):
    w = m.group(0)
    if w.count("?") > 2:
        return w
    opciones = [""]
    for ch in w:
        opciones = [o + c for o in opciones for c in (CAND if ch == "?" else ch)]
    for o in opciones:
        if o.lower() in vocab:
            return o if not w.isupper() else o.upper()
    if re.search(r"ci\?n", w, re.I):
        return re.sub(r"\?", "ó", w)
    return w
textos = [re.sub(r"\w*\?\w+", reparar_palabra, t) for t in textos]
meta = json.loads((here / "sim_meta.json").read_text(encoding="utf-8"))
(out / "sim.json").write_text(json.dumps({"meta": meta, "t": textos, "p": pos}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

# --- Notas de sección y capítulo
cap_file = sorted(glob.glob(str(here / "fuentes_arca" / "capitulo_*.txt")))[-1]
notas = {}
raw = Path(cap_file).read_bytes().decode("latin-1")
for line in raw.splitlines():
    parts = line.split("@", 2)
    if len(parts) < 3 or parts[0] != "1":
        continue
    cap, txt = parts[1].strip(), parts[2]
    txt = re.sub(r"ARANCEL INTEGRADO ADUANERO\s*=+", "", txt)
    txt = re.sub(r" {2,}", "\n", txt).strip()
    notas[cap] = txt
(out / "notas.json").write_text(json.dumps(notas, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

# --- Sufijos (ya procesados) y sinónimos
(out / "sufijos.json").write_text((here / "sufijos.json").read_text(encoding="utf-8"), encoding="utf-8")
(out / "sinonimos.json").write_text((here / "sinonimos.json").read_text(encoding="utf-8"), encoding="utf-8")
(out / "productos_frecuentes.json").write_text((here / "productos_frecuentes.json").read_text(encoding="utf-8"), encoding="utf-8")

# --- Intervenciones orientativas (curadas por PuertoBox) e impuestos internos
(out / "intervenciones.json").write_text((here / "intervenciones.json").read_text(encoding="utf-8"), encoding="utf-8")

print(f"{len(pos)} posiciones, {len(textos)} textos, {len(notas)} capítulos con notas -> {out}")

# --- Motor compartido (lo usa la página y el bot)
(out.parent / "nomenclador.js").write_text((here.parent / "src" / "nomenclador.js").read_text(encoding="utf-8"), encoding="utf-8")
