import pathlib
from playwright.sync_api import sync_playwright
F='/home/claude/render/node_modules/@fontsource/montserrat/files'
faces=''.join(f"@font-face{{font-family:'M';font-weight:{w};src:url('file://{F}/montserrat-latin-{w}-normal.woff2')}}" for w in (500,600,700,800,900))
deco='''<svg style="position:absolute;left:0;bottom:{by}px;opacity:.18" width="1080" height="420" viewBox="0 0 1080 420" fill="none" stroke="#c9d1e4" stroke-width="3" aria-hidden="true">
<path d="M40 250 L420 210 L470 150 L500 152 L480 215 L640 200 C670 198 680 220 650 228 L480 262 L520 330 L495 334 L430 272 L250 300 L215 340 L195 340 L210 290 L60 280 Z"/>
<rect x="760" y="150" width="190" height="150" rx="6"/><path d="M760 190 H950 M855 150 V190"/>
<rect x="830" y="280" width="210" height="120" rx="6"/><path d="M830 318 H1040 M935 280 V318"/>
</svg>'''
def page(w,h,top,gap,big,by):
    return f'''<!doctype html><html lang="es"><head><meta charset="utf-8"><style>{faces}
body{{margin:0}} .r{{width:{w}px;height:{h}px;box-sizing:border-box;position:relative;overflow:hidden;
background:radial-gradient(ellipse at 50% 35%,#283044 0%,#1c212e 60%,#151925 100%);color:#eef1f7;font-family:'M',sans-serif;
display:flex;flex-direction:column;align-items:center;text-align:center;padding-top:{top}px;gap:{gap}px}}
.c{{position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;gap:{gap}px}}
</style></head><body><div class="r">{deco.format(by=by)}<div class="c">
<img src="file:///home/claude/render/logo.png" style="width:330px">
<div style="font-weight:800;font-size:76px;letter-spacing:1px">IMPORTÁ DE CHINA</div>
<div style="line-height:.92;font-weight:900;text-shadow:0 6px 24px rgba(0,0,0,.45)"><div style="font-size:{big[0]}px">USD</div><div style="font-size:{big[1]}px">19/KG</div></div>
<div style="font-weight:700;font-size:44px;line-height:1.3">FLETE + GESTIÓN<br><span style="font-weight:600;font-size:38px;color:#c9d1e4">desde 20 kg · envíos chicos desde USD 65</span></div>
<div style="background:rgba(255,255,255,.08);border:2px solid rgba(255,255,255,.18);border-radius:18px;padding:18px 30px;font-weight:700;font-size:38px;line-height:1.25;max-width:880px">Impuestos: te los decimos<br>ANTES de que compres</div>
<div style="background:linear-gradient(180deg,#e0262f,#b3101b);border-radius:999px;padding:30px 90px;font-weight:800;font-size:60px;box-shadow:0 10px 30px rgba(200,20,30,.45);margin-top:10px">COTIZÁ GRATIS</div>
<div style="font-weight:600;font-size:30px;color:#aab3c7;letter-spacing:.5px">DESPACHANTE DE ADUANA MATRICULADO · ARCA</div>
</div></div></body></html>'''
out=pathlib.Path('/home/claude/render/out')
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome')
    for name,w,h,top,gap,big,by in [('pauta-precio-historia',1080,1920,230,40,(190,260),330),('pauta-precio-feed',1080,1350,60,26,(150,210),0)]:
        f=out/f'{name}.html'; f.write_text(page(w,h,top,gap,big,by),encoding='utf8')
        pg=b.new_page(viewport={'width':w,'height':h}); pg.goto(f'file://{f}'); pg.wait_for_timeout(500)
        pg.screenshot(path=str(out/f'{name}.png')); pg.close()
    b.close()
print('ok')
