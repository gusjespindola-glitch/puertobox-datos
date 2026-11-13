"""Genera web/ncm.html: buscador NCM autocontenido (datos embebidos)."""
import json
from pathlib import Path
here = Path(__file__).parent
data = json.load(open(here / "ncm.json", encoding="utf-8"))
sin = json.load(open(here / "sinonimos.json", encoding="utf-8")); sin.pop("_meta", None)
html = """<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Buscador NCM — PuertoBox</title>
<style>
:root{--bg:#0f1720;--card:#16212d;--line:#243344;--txt:#e8eef4;--mut:#93a4b5;--acc:#f5a623}
*{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:var(--bg);color:var(--txt)}
main{max-width:720px;margin:0 auto;padding:18px 14px 40px}h1{font-size:1.25rem;margin:0 0 4px}.sub{color:var(--mut);font-size:.85rem;margin:0 0 12px}
input{width:100%;padding:13px;border-radius:12px;border:1px solid var(--line);background:#0c131b;color:var(--txt);font-size:1.05rem}
.r{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px;margin-top:10px}
.c{font-weight:700;font-size:1.05rem;color:var(--acc)}.t{display:inline-block;font-size:.75rem;border:1px solid var(--line);border-radius:999px;padding:2px 8px;margin:4px 4px 0 0;color:var(--txt)}
.d{font-size:.85rem;color:var(--mut);margin-top:6px}.d b{color:var(--txt);font-weight:600}.n{font-size:.75rem;color:#ffd38a;margin-top:6px}
.cnt{font-size:.8rem;color:var(--mut);margin-top:8px}.w{font-size:.75rem;color:var(--mut);margin-top:14px;line-height:1.4}
a{color:var(--acc)}
</style></head><body><main>
<h1>Buscador NCM</h1><p class="sub">Nomenclatura Común del Mercosur 2022 · Anexo I Dec. 557/2023 + ajustes 2025-2026</p>
<input id="q" placeholder="Producto o posición (ej: zapatillas, auriculares, 8518.30)" autofocus>
<div class="cnt" id="cnt"></div><div id="res"></div>
<p class="w">Orientativo. DIE = AEC con ajustes conocidos (Dec. 236/2025, 333/2025). El derecho vigente, sufijos e intervenciones se confirman en VUCE: <a href="https://www.vuce.gob.ar/">vuce.gob.ar</a> (Central de Información).</p>
</main><script>
const DATA=__DATA__;const SIN=__SIN__;
const norm=s=>s.toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g,'');
const STOP=new Set(['de','la','el','los','las','y','o','para','con','sin','en','del','a','un','una','por']);
const IDX=DATA.map(x=>({x,d:norm(x.d),u:norm(x.d.split(' > ').pop())}));
function buscar(q,n=25){const qn=norm(q).trim();if(!qn)return[];
 if(/^[\\d.]+$/.test(qn)){const p=qn.replace(/\\./g,'');return DATA.filter(x=>x.c.replace(/\\./g,'').startsWith(p)).slice(0,n)}
 let q2=qn;for(const[k,v]of Object.entries(SIN)){if(new RegExp('(^|\\\\s)'+norm(k)+'(\\\\s|$)').test(q2))q2=q2.replace(norm(k),norm(v))}
 const toks=q2.split(/\\s+/).filter(t=>t.length>1&&!STOP.has(t)).map(t=>t.length>4?t.replace(/(es|s)$/,''):t);if(!toks.length)return[];
 const rx=toks.map(t=>new RegExp('\\\\b'+t.replace(/[^a-z0-9-]/g,'').replace(/-/g,'.?')+'(es|s|as|os|a|o)?\\\\b'));const out=[];
 for(const it of IDX){let s=0,h=0;for(const w of rx){if(w.test(it.d)){h++;s+=2;if(w.test(it.u))s+=6}}if(h===rx.length)out.push([s,it.x])}
 return out.sort((a,b)=>b[0]-a[0]).slice(0,n).map(r=>r[1])}
const esc=s=>s.replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
function render(){const r=buscar(document.getElementById('q').value);document.getElementById('cnt').textContent=r.length?r.length+' resultados':'';
 document.getElementById('res').innerHTML=r.map(x=>{const parts=x.d.split(' > ');const last=parts.pop();
 return `<div class="r"><div class="c">${x.c}</div><span class="t">DIE ${x.die??'?'}%</span>${x.ii?`<span class="t">Internos ${(x.ii*100).toFixed(1)}%</span>`:''}<span class="t">TE 3%</span><span class="t">IVA 21%</span>${x.m?`<span class="t">${x.m}</span>`:''}${x.aec!==x.die?`<span class="t">AEC ${x.aec}%</span>`:''}
 <div class="d">${esc(parts.join(' › ')).slice(0,260)} › <b>${esc(last)}</b></div>${x.n?`<div class="n">${esc(x.n)}</div>`:''}</div>`}).join('')}
let t;document.getElementById('q').addEventListener('input',()=>{clearTimeout(t);t=setTimeout(render,150)});
</script></body></html>"""
html = html.replace("__DATA__", json.dumps(data, ensure_ascii=False, separators=(",", ":"))).replace("__SIN__", json.dumps(sin, ensure_ascii=False))
(here.parent / "web").mkdir(exist_ok=True)
(here.parent / "web" / "ncm.html").write_text(html, encoding="utf-8")
print("ok", len(html) // 1024, "KB")
