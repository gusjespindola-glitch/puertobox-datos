"""Parsea el Anexo I del Decreto 557/2023 (NCM 2022 + AEC + RE) a CSV/JSON.

Uso: python3 parse_ncm.py NCM.pdf salida_dir
"""
import csv, json, re, subprocess, sys
from pathlib import Path

pdf, out = sys.argv[1], Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)
txt = subprocess.run(["pdftotext", "-layout", pdf, "-"], capture_output=True, text=True, check=True).stdout

CODE = re.compile(r"^\s{0,14}(\d{2}\.\d{2}|\d{4}(?:\.\d{1,2}){1,2})\s+(.*)$")
RATE = re.compile(r"\s{2,}(\d{1,2}(?:,\d+)?|BK|BIT|-)?\s*(?:BK|BIT)?\s+(\d{1,2},\d{2})\s*$")
SKIP = re.compile(r"(Arancel Externo Común|Página \d+ de|IF-20\d\d-|^\s*NCM\s+DESCRIPCI)")

rows, cur = [], None
chapter_title = {}

def flush():
    global cur
    if cur:
        cur["descripcion"] = re.sub(r"\s+", " ", cur["descripcion"]).strip()
        rows.append(cur)
    cur = None

for raw in txt.splitlines():
    if not raw.strip() or SKIP.search(raw):
        continue
    m = CODE.match(raw)
    if m:
        flush()
        code, rest = m.group(1), m.group(2)
        cur = {"codigo": code, "descripcion": rest, "aec": None, "re": None, "marca": ""}
    elif cur is not None and raw.startswith(" " * 10) and not raw.strip().startswith(("Notas", "Nota")):
        cur["descripcion"] += " " + raw.strip()
    else:
        continue
    # tasas al final de la línea (AEC y RE)
    rm = re.search(r"\s(\d{1,2}(?:,\d+)?)\s+(?:(BK|BIT)\s+)?(\d{1,2},\d{2})\s*$", cur["descripcion"])
    if rm and cur["aec"] is None:
        cur["aec"] = float(rm.group(1).replace(",", "."))
        cur["marca"] = rm.group(2) or ""
        cur["re"] = float(rm.group(3).replace(",", "."))
        cur["descripcion"] = cur["descripcion"][: rm.start()]
flush()

# Respaldo: AEC al final sin RE en la misma línea
for r in rows:
    if r["aec"] is None:
        m2 = re.search(r"\s(\d{1,2}(?:,\d+)?)(?:\s+(BK|BIT))?\s*$", r["descripcion"])
        if m2:
            r["aec"] = float(m2.group(1).replace(",", ".")); r["marca"] = m2.group(2) or ""
            r["descripcion"] = r["descripcion"][: m2.start()].strip()

# Normalización y jerarquía
items = []
for r in rows:
    digits = r["codigo"].replace(".", "")
    nivel = {4: "partida", 6: "subpartida", 7: "item", 8: "ncm"}.get(len(digits), "otro")
    if len(digits) == 4 and "." in r["codigo"] and len(r["codigo"]) == 5:
        nivel = "partida"
    items.append({**r, "digitos": digits, "nivel": nivel, "capitulo": digits[:2]})

ncm8 = [i for i in items if len(i["digitos"]) == 8]

# Descripción completa (con padres) para buscar mejor
by = {i["digitos"]: i for i in items}
for i in ncm8:
    d = i["digitos"]
    padres = [by[p]["descripcion"] for p in (d[:4], d[:6], d[:7]) if p in by and p != d]
    i["descripcion_completa"] = " > ".join([*padres, i["descripcion"]])

with open(out / "ncm_2022_aec.csv", "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=["codigo", "capitulo", "descripcion", "aec", "marca", "re", "descripcion_completa"])
    w.writeheader()
    for i in ncm8:
        w.writerow({k: i.get(k) for k in w.fieldnames})
with open(out / "ncm_arbol.json", "w", encoding="utf-8") as f:
    json.dump(items, f, ensure_ascii=False)

sin_tasa = [i["codigo"] for i in ncm8 if i["aec"] is None]
print(f"items totales: {len(items)} | NCM 8 dígitos: {len(ncm8)} | sin AEC: {len(sin_tasa)}")
print("ejemplos sin AEC:", sin_tasa[:10])
