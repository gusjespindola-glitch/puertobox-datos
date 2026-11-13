"""Genera ncm.json (para buscador/calculadora) aplicando modificaciones.json sobre el CSV del Anexo I Dec. 557/2023."""
import csv, json, unicodedata
from pathlib import Path
here = Path(__file__).parent
mods = json.load(open(here / "modificaciones.json", encoding="utf-8"))
out = []
for r in csv.DictReader(open(here / "ncm_2022_aec.csv", encoding="utf-8")):
    aec = float(r["aec"]) if r["aec"] else None
    die, nota = aec, ""
    for m in mods["reglas"]:
        if "codigos" in m and r["codigo"] in m["codigos"]:
            die, nota = m["die"], f'{m["norma"]}: {m["nota"]}'
        elif "capitulos" in m and r["capitulo"] in m["capitulos"] and aec == m["si_aec"]:
            die, nota = m["die"], f'{m["norma"]}: {m["nota"]}'
    internos = 0.0
    for ii in mods["impuestos_internos"]:
        if any(r["codigo"].replace(".", "").startswith(p.replace(".", "")) for p in ii["prefijos"]):
            internos = ii["alicuota"]
    out.append({"c": r["codigo"], "d": r["descripcion_completa"], "aec": aec, "die": die, "ii": internos,
                "re": float(r["re"]) if r["re"] else None, "m": r["marca"], "n": nota})
json.dump(out, open(here / "ncm.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print(len(out), "posiciones;", sum(1 for o in out if o["n"]), "con ajuste;", sum(1 for o in out if o["ii"]), "con internos")
