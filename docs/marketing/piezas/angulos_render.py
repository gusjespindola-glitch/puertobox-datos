"""Piezas de la tanda de pruebas de Meta (plan 16/11/2026): 3 imágenes 4:5.
Números del motor (bot/tools.js cotizar) y de data/: nunca a mano.
Requiere: pip playwright, google-chrome y npm i @fontsource/montserrat en /home/claude/render.
Uso: python3 docs/marketing/piezas/angulos_render.py  -> PNG en /home/claude/render/out
"""
import pathlib, json, subprocess, html
REPO = pathlib.Path(__file__).resolve().parents[3]
JS = """
const {ejecutar}=require('./bot/tools.js');const {crearStore}=require('./bot/store.js');const n=require('./src/negocio').datos();
const r=ejecutar('cotizar',{kg:20,valor_factura_usd:300,die:35,regimen:'comercial',unidades:100,cantidad_cajas:1,largo_cm:60,ancho_cm:40,alto_cm:40,producto_corto:'remeras',producto_singular:'remera',precio_publicado:3},{telefono:'pieza',store:crearStore(null),derivaciones:[],manual:true});
console.log(JSON.stringify({t:r.texto_presupuesto,kg:n.usd_kg_total_desde,desde:n.kg_desde_total,min:n.envio_minimo_usd,tope:n.tope_por_envio_usd}));
"""
D = json.loads(subprocess.check_output(['node', '-e', JS], cwd=REPO))
F = '/home/claude/render/node_modules/@fontsource/montserrat/files'
FACES = ''.join(f"@font-face{{font-family:'M';font-weight:{w};src:url('file://{F}/montserrat-latin-{w}-normal.woff2')}}" for w in (500, 600, 700, 800, 900))
BASE = f"""<!doctype html><html lang="es"><head><meta charset="utf-8"><style>{FACES}
body{{margin:0}}*{{box-sizing:border-box}}
.r{{width:1080px;height:1350px;position:relative;overflow:hidden;font-family:'M',sans-serif;color:#eef1f7;
background:radial-gradient(ellipse at 50% 30%,#283044 0%,#1c212e 60%,#151925 100%);padding:70px 70px 60px;display:flex;flex-direction:column}}
.btn{{align-self:center;background:linear-gradient(180deg,#e0262f,#b3101b);border-radius:999px;padding:26px 80px;font-weight:800;font-size:52px;box-shadow:0 10px 30px rgba(200,20,30,.45)}}
.pie{{text-align:center;font-weight:600;font-size:28px;color:#aab3c7;margin-top:22px}}
</style></head><body><div class="r">{{c}}</div></body></html>"""
PIE = '<div class="pie">DESPACHANTE DE ADUANA MATRICULADO · PUERTOBOX</div>'


def chat():
    lineas = [l for l in D['t'].split('\n') if not l.startswith(('Posición', 'Se paga', '¿Te sirve'))]
    txt = '<br>'.join(html.escape(l) for l in lineas)
    import re
    txt = re.sub(r'\*(.+?)\*', r'<b>\1</b>', txt)
    return f"""
<div style="font-weight:900;font-size:66px;line-height:1.05;text-align:center">PEGÁ EL LINK DE ALIBABA</div>
<div style="font-weight:700;font-size:40px;text-align:center;color:#c9d1e4;margin:14px 0 30px">En 2 minutos sabés flete, gestión e impuestos</div>
<div style="flex:1;background:#0b141a;border-radius:28px;padding:26px 28px;display:flex;flex-direction:column;gap:18px;border:2px solid rgba(255,255,255,.12)">
 <div style="align-self:flex-end;background:#005c4b;border-radius:18px 18px 4px 18px;padding:16px 22px;font-size:30px;max-width:85%;line-height:1.3">Hola, quiero traer de China: 100 remeras<br><span style="color:#8fd0ff">alibaba.com/product-detail/…</span></div>
 <div style="align-self:flex-start;background:#202c33;border-radius:18px 18px 18px 4px;padding:20px 24px;font-size:29px;line-height:1.35;max-width:92%">{txt}</div>
</div>
<div style="height:34px"></div><div class="btn">COTIZÁ GRATIS</div>{PIE}"""


def kilo():
    preg = ['¿Me cobran por volumen o por peso?', '¿Cuánto pago de impuestos al recibir?', '¿El precio es cerrado o puede cambiar?']
    items = ''.join(f'<div style="background:rgba(255,255,255,.07);border:2px solid rgba(255,255,255,.16);border-radius:20px;padding:26px 30px;font-weight:700;font-size:42px">{i+1}. {p}</div>' for i, p in enumerate(preg))
    return f"""
<div style="font-weight:900;font-size:92px;line-height:1;text-align:center;margin-top:20px">EL KILO BARATO<br><span style="color:#ff4d55">TE SALE CARO</span></div>
<div style="font-weight:700;font-size:40px;text-align:center;color:#c9d1e4;margin:34px 0">Antes de elegir courier, preguntá esto:</div>
<div style="display:flex;flex-direction:column;gap:22px">{items}</div>
<div style="font-weight:700;font-size:38px;text-align:center;margin:40px 0 0;line-height:1.3">Nosotros te lo decimos <span style="color:#ff4d55">antes de que compres</span>.</div>
<div style="flex:1"></div><div class="btn">COTIZÁ GRATIS</div>{PIE}"""


def mono():
    ok = ['No necesitás ser Responsable Inscripto', 'No te inscribís como importador', f'Hasta USD {D["tope"]:,}'.replace(',', '.') + ' por envío, sin límite de envíos', 'Te llega nacionalizado a tu nombre']
    items = ''.join(f'<div style="font-weight:700;font-size:42px;display:flex;gap:20px;align-items:center"><span style="color:#3ddc84;font-size:52px">✓</span>{p}</div>' for p in ok)
    return f"""
<div style="font-weight:900;font-size:82px;line-height:1.05;text-align:center;margin-top:20px">LOS MONOTRIBUTISTAS<br>TAMBIÉN PUEDEN<br><span style="color:#ff4d55">IMPORTAR DE CHINA</span></div>
<div style="font-weight:700;font-size:44px;text-align:center;color:#c9d1e4;margin:24px 0 46px">para vender</div>
<div style="display:flex;flex-direction:column;gap:30px;padding-left:20px">{items}</div>
<div style="flex:1"></div>
<div style="text-align:center;font-weight:600;font-size:34px;color:#c9d1e4;margin-bottom:28px">Aéreo desde USD {D["kg"]} el kilo con gestión (desde {D["desde"]} kg)</div>
<div class="btn">CONSULTÁ GRATIS</div>{PIE}"""


out = pathlib.Path('/home/claude/render/out'); out.mkdir(parents=True, exist_ok=True)
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome')
    for name, fn in [('prueba-link-alibaba', chat), ('prueba-kilo-barato', kilo), ('prueba-monotributistas', mono)]:
        f = out / f'{name}.html'; f.write_text(BASE.replace('{c}', fn()), encoding='utf8')
        pg = b.new_page(viewport={'width': 1080, 'height': 1350}); pg.goto(f'file://{f}'); pg.wait_for_timeout(500)
        pg.screenshot(path=str(out / f'{name}.png')); pg.close()
    b.close()
print('ok')
