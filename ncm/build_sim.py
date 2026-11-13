"""Construye la base SIM argentina desde los archivos oficiales de ARCA
("Arancel Integrado y Sufijos de Valor": capitulo_*.txt, nomenclador_*.txt, sufijos_*.txt).

Uso: python3 ncm/build_sim.py <carpeta_con_txt>
Genera ncm/sim.json, ncm/sim.csv, ncm/sufijos.json
"""
import csv, json, re, sys
from pathlib import Path

src = Path(sys.argv[1])
here = Path(__file__).parent

def read(pattern):
    f = sorted(src.glob(pattern))[-1]
    raw = f.read_bytes()
    try:
        txt = raw.decode("utf-8")
    except UnicodeDecodeError:
        txt = raw.decode("latin-1")
    return f.name, txt

def clean(s):
    s = s.replace("dem?s", "demás").replace("Dem?s", "Demás").replace("DEM?S", "DEMÁS").replace("todav?a", "todavía")
    return re.sub(r"\s+", " ", s.replace("«", '"').replace("»", '"')).strip()

# --- Nomenclador ---
nom_name, nom = read("nomenclador_*.txt")
fecha = re.search(r"(\d{8})", nom_name).group(1)
fecha = f"{fecha[4:]}-{fecha[2:4]}-{fecha[:2]}"

lineas = []
for line in nom.splitlines():
    p = line.split("@")
    if len(p) < 11 or p[0] != "2":
        continue
    code = p[1].strip()
    vals = [x.strip() for x in p[2:8]]
    lineas.append({
        "code": code,
        "digits": re.sub(r"[^0-9]", "", code),
        "control": code[-1] if code and code[-1].isalpha() else "",
        "de": vals[0], "re": vals[1], "die": vals[2], "ri": vals[3], "dii": vals[4],
        "unidad": p[8].strip(),
        "desc": clean(p[10]),
    })

por_digitos = {}
for l in lineas:
    if not l["control"]:
        por_digitos.setdefault(l["digits"], l)

mods = json.load(open(here / "modificaciones.json", encoding="utf-8"))

def num(v):
    try:
        return float(v)
    except ValueError:
        return None

sim = []
for l in lineas:
    if not l["control"]:
        continue  # solo posiciones SIM completas (11 dígitos + control)
    d = l["digits"]
    padres = []
    for n in range(2, len(d)):
        a = por_digitos.get(d[:n])
        if a and a["desc"] and a["desc"] not in padres:
            padres.append(a["desc"])
    internos = 0.0
    for ii in mods.get("impuestos_internos", []):
        if any(d.startswith(pfx.replace(".", "")) for pfx in ii["prefijos"]):
            internos = ii["alicuota"]
    sim.append({
        "c": l["code"],
        "ncm": l["code"][:10],
        "d": " > ".join(padres + [l["desc"]]),
        "die": num(l["die"]), "dii": num(l["dii"]), "de": num(l["de"]),
        "re": num(l["re"]), "ri": num(l["ri"]), "ii": internos, "u": l["unidad"],
    })

# --- Sufijos de valor ---
_, suf = read("sufijos_*.txt")
sufijos = {}
for line in suf.splitlines():
    p = line.split("@")
    if len(p) < 5 or p[0] != "3":
        continue
    clave = re.sub(r"[^0-9]", "", p[1])
    sufijos.setdefault(clave, []).append({"s": p[2].strip(), "norma": p[3].strip(), "t": clean(p[4])})

json.dump(sim, open(here / "sim.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
json.dump(sufijos, open(here / "sufijos.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
with open(here / "sim.csv", "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(["posicion_sim", "ncm", "die", "dii", "de", "re", "ri", "impuestos_internos", "unidad", "descripcion"])
    for s in sim:
        w.writerow([s["c"], s["ncm"], s["die"], s["dii"], s["de"], s["re"], s["ri"], s["ii"], s["u"], s["d"]])
json.dump({"fuente": "ARCA - Arancel Integrado y Sufijos de Valor", "fecha_archivos": fecha,
           "posiciones_sim": len(sim), "claves_con_sufijos": len(sufijos)},
          open(here / "sim_meta.json", "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print(f"Archivos del {fecha}: {len(sim)} posiciones SIM, {len(sufijos)} claves con sufijos")
