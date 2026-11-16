"""reel02 — 'Sale USD 2 en China, se vende a $25.000': escenas animadas + subtítulos + música propia (sin voz: el audio original se perdió).
Números: motor del bot (cotizar: 100 kits, USD 200, 25 kg en 2 cajas 40x30x30, DIE 35% 9506.91) y dólar oficial BNA $1.570."""
import subprocess, sys, math, os
from PIL import Image, ImageDraw, ImageFont

W, H, FPS = 1080, 1920, 30
F = '/usr/share/fonts/opentype/inter/'
def f(n, s): return ImageFont.truetype(F + n, s)
BLACK, XB, BOLD, SEMI, MED = 'Inter-Black.otf', 'Inter-ExtraBold.otf', 'Inter-Bold.otf', 'Inter-SemiBold.otf', 'Inter-Medium.otf'
BG1, BG2 = (14, 24, 48), (24, 40, 78)
WHITE, GREY, YEL, RED, GREEN = (240, 244, 250), (160, 172, 196), (255, 205, 40), (232, 52, 60), (37, 211, 102)

def fondo():
    im = Image.new('RGB', (W, H), BG1)
    d = ImageDraw.Draw(im)
    for y in range(0, H, 8):
        t = y / H
        c = tuple(int(BG1[i] + (BG2[i] - BG1[i]) * (1 - abs(t - 0.45) * 1.6 if abs(t - 0.45) < 0.62 else 0)) for i in range(3))
        d.rectangle([0, y, W, y + 8], fill=c)
    return im

BASE = fondo()
ease = lambda x: 1 - (1 - max(0, min(1, x))) ** 3
def pop(x):  # 0→1 con rebote
    x = max(0, min(1, x)); return 1 + 0.12 * math.sin(x * math.pi) if x < 1 else 1

def centro(d, y, txt, font, fill, x0=None):
    w = d.textlength(txt, font=font)
    d.text(((W - w) / 2 if x0 is None else x0, y), txt, font=font, fill=fill)

def texto_escalado(im, y, txt, font, fill, esc, alfa=1):
    """Dibuja un texto centrado con escala (para el 'pop')."""
    if esc <= 0.01 or alfa <= 0: return
    tmp = Image.new('RGBA', (W, font.size * 2), (0, 0, 0, 0))
    td = ImageDraw.Draw(tmp)
    centro(td, font.size * 0.3, txt, font, fill + (int(255 * alfa),))
    nw, nh = int(W * esc), int(tmp.height * esc)
    tmp = tmp.resize((nw, nh), Image.LANCZOS)
    im.paste(tmp, ((W - nw) // 2, int(y - (nh - tmp.height / esc) / 2)), tmp)

def marca(d):
    centro(d, 150, 'PUERTOBOX', f(BLACK, 54), WHITE)
    centro(d, 216, 'DESPACHANTE DE ADUANA MATRICULADO', f(SEMI, 26), GREY)

# Subtítulos con la voz (tiempos sobre el audio recortado 1,25 s).
SUBS = [(0.10, 1.95, 'Este producto sale 2 dólares en China.'),
        (2.20, 4.95, 'En Mercado Libre se vende a 25.000 pesos, más o menos.'),
        (5.40, 7.75, 'Te muestro cuánto te queda puesto en tu casa,'),
        (7.80, 9.10, 'con impuestos y todo.'),
        (9.20, 12.20, 'Así que antes de que compres, escribime y te lo calculo.')]
def subtitulo(im, t):
    for a, b, txt in SUBS:
        if a <= t <= b:
            d = ImageDraw.Draw(im, 'RGBA')
            font = f(BOLD, 44)
            palabras, lineas, cur = txt.split(), [], ''
            for p in palabras:
                if d.textlength((cur + ' ' + p).strip(), font=font) > 860: lineas.append(cur); cur = p
                else: cur = (cur + ' ' + p).strip()
            lineas.append(cur)
            y = 1390
            for ln in lineas:
                w = d.textlength(ln, font=font)
                d.rounded_rectangle([(W - w) / 2 - 22, y - 10, (W + w) / 2 + 22, y + 62], 14, fill=(0, 0, 0, 165))
                d.text(((W - w) / 2, y), ln, font=font, fill=WHITE)
                y += 78

def tarjeta(d, box, fill=(255, 255, 255, 18), borde=(255, 255, 255, 60)):
    d.rounded_rectangle(box, 34, fill=fill, outline=borde, width=3)

# ---------- escenas ----------
def s1(t):  # 0–2.1  producto + USD 2
    im = BASE.copy(); d = ImageDraw.Draw(im, 'RGBA'); marca(d)
    a = ease(t / 0.35)
    tarjeta(d, [130, 420, 950, 1180])
    centro(d, 470, 'EN CHINA', f(XB, 52), RED)
    # dibujo simple del producto: 3 bandas (aros de colores)
    cx, cy = W // 2, 690
    for i, col in enumerate([(232, 52, 60), (255, 205, 40), (60, 160, 255)]):
        r = 120 - i * 8; off = (i - 1) * 70
        d.ellipse([cx + off - r, cy - r * 0.55, cx + off + r, cy + r * 0.55], outline=col + (255,), width=18)
    centro(d, 820, 'Kit de 3 bandas elásticas', f(SEMI, 40), WHITE)
    texto_escalado(im, 900, 'USD 2', f(BLACK, 190), YEL, pop(t / 0.45) * a)
    subtitulo(im, t); return im

def s2(t):  # 2.1–5.3  Mercado Libre $25.000
    T = t - 2.1; im = BASE.copy(); d = ImageDraw.Draw(im, 'RGBA'); marca(d)
    tarjeta(d, [130, 420, 950, 1180], fill=(255, 230, 0, 30), borde=(255, 230, 0, 120))
    centro(d, 470, 'EN MERCADO LIBRE', f(XB, 52), YEL)
    centro(d, 560, 'el mismo kit se vende a', f(SEMI, 42), WHITE)
    n = int(25000 * ease(T / 0.9))
    texto_escalado(im, 650, f'${n:,}'.replace(',', '.'), f(BLACK, 170), WHITE, 1)
    centro(d, 900, 'aprox., precio de referencia', f(MED, 34), GREY)
    # flecha: USD 2 → $25.000
    centro(d, 990, 'Pagaste USD 2.  ¿Cuánto te queda', f(SEMI, 40), GREY)
    centro(d, 1046, 'de verdad puesto en tu casa?', f(SEMI, 40), GREY)
    subtitulo(im, T + 2.1); return im

FILAS = [('Producto', 'USD 2,00'), ('Envío a tu casa + gestión', 'USD 4,90'), ('Impuestos (estimado)', 'USD 2,46')]
def s3(t):  # 5.3–9.2  la cuenta
    T = t - 5.3; im = BASE.copy(); d = ImageDraw.Draw(im, 'RGBA'); marca(d)
    centro(d, 380, 'LA CUENTA REAL, POR KIT', f(XB, 50), RED)
    tarjeta(d, [100, 470, 980, 1230])
    y = 530
    for i, (a, b) in enumerate(FILAS):
        al = ease((T - 0.25 - i * 0.45) / 0.35)
        if al <= 0: continue
        x = 150 - int(40 * (1 - al))
        d.text((x, y), a, font=f(SEMI, 40), fill=WHITE + (int(255 * al),))
        w = d.textlength(b, font=f(XB, 44)); d.text((930 - w, y - 2), b, font=f(XB, 44), fill=WHITE + (int(255 * al),))
        y += 110
    al = ease((T - 1.7) / 0.4)
    if al > 0:
        d.line([150, y + 4, 930, y + 4], fill=GREY + (int(200 * al),), width=3)
        d.text((150, y + 34), 'PUESTO EN TU CASA', font=f(BLACK, 44), fill=YEL + (int(255 * al),))
        b = 'USD 9,36'; w = d.textlength(b, font=f(BLACK, 54)); d.text((930 - w, y + 26), b, font=f(BLACK, 54), fill=YEL + (int(255 * al),))
        texto_escalado(im, y + 120, '≈ $14.700', f(BLACK, 120), YEL, pop((T - 2.0) / 0.45) if T > 2.0 else 0)
    subtitulo(im, T + 5.3); return im

def s4(t):  # 9.2–13.7  comparación + llamado
    T = t - 9.2; im = BASE.copy(); d = ImageDraw.Draw(im, 'RGBA'); marca(d)
    tarjeta(d, [100, 340, 980, 760])
    d.text((150, 390), 'Te queda en', font=f(SEMI, 44), fill=GREY)
    w = d.textlength('$14.700', font=f(BLACK, 74)); d.text((930 - w, 376), '$14.700', font=f(BLACK, 74), fill=YEL)
    d.text((150, 500), 'Lo vendés a', font=f(SEMI, 44), fill=GREY)
    w = d.textlength('$25.000', font=f(BLACK, 74)); d.text((930 - w, 486), '$25.000', font=f(BLACK, 74), fill=WHITE)
    d.line([150, 610, 930, 610], fill=GREY, width=3)
    d.text((150, 640), 'Diferencia por kit', font=f(BOLD, 44), fill=WHITE)
    w = d.textlength('$10.300', font=f(BLACK, 74)); d.text((930 - w, 626), '$10.300', font=f(BLACK, 74), fill=GREEN)
    centro(d, 790, 'antes de comisiones y envío de Mercado Libre', f(MED, 30), GREY)
    a = ease((T - 0.6) / 0.4)
    if a > 0:
        sc = 1 + 0.04 * math.sin(T * 4) if T > 1.2 else a
        bw, bh = int(820 * sc), int(130 * sc); x0, y0 = (W - bw) // 2, 900 - (bh - 130) // 2
        d.rounded_rectangle([x0, y0, x0 + bw, y0 + bh], bh // 2, fill=GREEN + (int(255 * a),))
        centro(d, y0 + bh / 2 - 34, 'Cotizá gratis por WhatsApp', f(XB, 52), (10, 30, 20))
        centro(d, 1070, 'Link en la bio · te lo calculamos antes de que compres', f(SEMI, 34), WHITE)
    centro(d, 1200, 'Ejemplo: 100 kits, 25 kg en 2 cajas. Impuestos estimados, los confirma', f(MED, 26), GREY)
    centro(d, 1236, 'nuestro despachante. Dólar oficial BNA $1.570 (15/11/2026).', f(MED, 26), GREY)
    subtitulo(im, T + 9.2); return im

ESCENAS = [('s1', s1, 0.0, 2.1), ('s2', s2, 2.1, 5.3), ('s3', s3, 5.3, 9.2), ('s4', s4, 9.2, 13.7)]

def render(nombre, fn, a, b):
    n = int(round((b - a) * FPS)); tmp = f'out/{nombre}.tmp.mp4'
    p = subprocess.Popen(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
                          '-c:v', 'libx264', '-crf', '18', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', tmp], stdin=subprocess.PIPE)
    for i in range(n): p.stdin.write(fn(a + i / FPS).convert('RGB').tobytes())
    p.stdin.close(); assert p.wait() == 0
    os.replace(tmp, f'out/{nombre}.mp4')

if __name__ == '__main__':
    os.makedirs('out', exist_ok=True)
    if sys.argv[1:] == ['frames']:
        for t in [1.2, 4.6, 8.6, 12.0]:
            fn = [e for e in ESCENAS if e[2] <= t < e[3]][0][1]
            fn(t).save(f'out/frame_{t}.png')
    else:
        for e in ESCENAS: render(*e)
        print('ok')
