"""sim.json → sim_compacto.json (textos deduplicados) para buscador web y CLI."""
import json
from pathlib import Path
here = Path(__file__).parent
sim = json.load(open(here / "sim.json", encoding="utf-8"))
tabla, idx, filas = [], {}, []
for s in sim:
    ids = []
    for parte in s["d"].split(" > "):
        if parte not in idx:
            idx[parte] = len(tabla); tabla.append(parte)
        ids.append(idx[parte])
    filas.append([s["c"], s["die"], s["ii"], s["re"], ids])
meta = json.load(open(here / "sim_meta.json", encoding="utf-8"))
json.dump({"meta": meta, "t": tabla, "p": filas}, open(here / "sim_compacto.json", "w", encoding="utf-8"),
          ensure_ascii=False, separators=(",", ":"))
print(len(tabla), "textos únicos;", (here / "sim_compacto.json").stat().st_size // 1024, "KB")
