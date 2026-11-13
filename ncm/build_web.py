"""Genera web/ncm.html: buscador SIM autocontenido (datos ARCA + sufijos + sinónimos)."""
import json
from pathlib import Path
here = Path(__file__).parent
db = (here / "sim_compacto.json").read_text(encoding="utf-8")
suf = (here / "sufijos.json").read_text(encoding="utf-8")
sin = (here / "sinonimos.json").read_text(encoding="utf-8")
motor = (here / "motor_busqueda.js").read_text(encoding="utf-8")
meta = json.loads(db)["meta"]
html = """<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Buscador SIM — PuertoBox</title>
<style>
:root{--bg:#0f1720;--card:#16212d;--line:#243344;--txt:#e8eef4;--mut:#93a4b5;--acc:#f5a623}
*{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:var(--bg);color:var(--txt)}
main{max-width:760px;margin:0 auto;padding:18px 14px 40px}h1{font-size:1.25rem;margin:0 0 4px}.sub{color:var(--mut);font-size:.82rem;margin:0 0 12px}
input{width:100%;padding:13px;border-radius:12px;border:1px solid var(--line);background:#0c131b;color:var(--txt);font-size:1.05rem}
.r{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px;margin-top:10px;cursor:pointer}
.c{font-weight:700;font-size:1.05rem;color:var(--acc);font-variant-numeric:tabular-nums}.t{display:inline-block;font-size:.75rem;border:1px solid var(--line);border-radius:999px;padding:2px 8px;margin:4px 4px 0 0}
.d{font-size:.84rem;color:var(--mut);margin-top:6px;line-height:1.35}.d b{color:var(--txt);font-weight:600}
.s{display:none;margin-top:8px;font-size:.78rem;color:var(--mut);border-top:1px solid var(--line);padding-top:8px}.r.open .s{display:block}
.s div{padding:2px 0}.s code{color:var(--txt)}.cnt{font-size:.8rem;color:var(--mut);margin-top:8px}.w{font-size:.75rem;color:var(--mut);margin-top:14px;line-height:1.4}a{color:var(--acc)}
</style></head><body><main>
<h1>Buscador de posiciones SIM</h1><p class="sub">Arancel Integrado ARCA · archivos del __FECHA__ · __N__ posiciones</p>
<input id="q" placeholder="Producto o posición (ej: auriculares, remeras, 8518.30)" autofocus>
<div class="cnt" id="cnt"></div><div id="res"></div>
<p class="w">Tocá un resultado para ver sus sufijos de valor. Derechos según archivos oficiales de ARCA; impuestos internos agregados por PuertoBox. Intervenciones y licencias: consultar en <a href="https://www.vuce.gob.ar/">VUCE</a>.</p>
</main><script>__MOTOR__</script><script>
const DB=__DB__;const SIN=__SIN__;const SUF=__SUF__;
const M=MotorSIM.crear(DB,SIN);
const esc=s=>String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
const sufDe=c=>{const d=c.replace(/[^0-9]/g,'');return Object.keys(SUF).filter(k=>d.startsWith(k)).flatMap(k=>SUF[k])};
function render(){const r=M.buscar(document.getElementById('q').value);document.getElementById('cnt').textContent=r.length?r.length+' resultados':'';
 document.getElementById('res').innerHTML=r.map(f=>{const t=M.texto(f);const last=t.pop();const s=sufDe(f.c);
 return `<div class="r" onclick="this.classList.toggle('open')"><div class="c">${f.c}</div><span class="t">DIE ${f.die}%</span>${f.ii?`<span class="t">Internos ${(f.ii*100).toFixed(1)}%</span>`:''}<span class="t">TE 3%</span><span class="t">IVA 21%</span><span class="t">RE ${f.re}%</span><span class="t">${s.length} sufijos</span>
 <div class="d">${esc(t.slice(-3).join(' › ')).slice(-280)} › <b>${esc(last)}</b></div>
 <div class="s">${s.map(x=>`<div><code>${esc(x.s)}</code> ${esc(x.t)} <span style="opacity:.6">${esc(x.norma)}</span></div>`).join('')||'Sin sufijos'}</div></div>`}).join('')}
let tm;document.getElementById('q').addEventListener('input',()=>{clearTimeout(tm);tm=setTimeout(render,150)});
</script></body></html>"""
html = (html.replace("__FECHA__", meta["fecha_archivos"]).replace("__N__", f'{meta["posiciones_sim"]:,}'.replace(",", "."))
        .replace("__MOTOR__", motor).replace("__DB__", db).replace("__SIN__", sin).replace("__SUF__", suf))
(here.parent / "web").mkdir(exist_ok=True)
(here.parent / "web" / "ncm.html").write_text(html, encoding="utf-8")
print("ok", len(html.encode()) // 1024, "KB")
