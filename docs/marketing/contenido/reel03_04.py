"""reel03 'La caja grande te cobra aire' y reel04 'Qué pedirle al proveedor': texto en pantalla + música propia (sin voz).
Números de reel03: motor del bot (cotizar) 17/11/2026 — 40 pares de zapatillas, USD 800, 18 kg en 2 cajas, DIE 35%:
60x40x40 → 39 kg cobrables, flete USD 702; 50x40x40 → 32 kg, flete USD 576 (+ gestión USD 40 en los dos). Diferencia USD 126.
Uso: python3 reel03_04.py reel03|reel04 [frames]"""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import reel02_bandas as R
from reel02_bandas import W, H, f, BLACK, XB, BOLD, SEMI, MED, WHITE, GREY, YEL, RED, GREEN, ease, pop, centro, texto_escalado, marca, tarjeta, BASE
from PIL import ImageDraw

def subs_de(lista):
    def sub(im, t):
        for a, b, txt in lista:
            if a <= t <= b:
                d = ImageDraw.Draw(im, 'RGBA'); font = f(BOLD, 44)
                lineas, cur = [], ''
                for p in txt.split():
                    if d.textlength((cur + ' ' + p).strip(), font=font) > 860: lineas.append(cur); cur = p
                    else: cur = (cur + ' ' + p).strip()
                lineas.append(cur); y = 1390
                for ln in lineas:
                    w = d.textlength(ln, font=font)
                    d.rounded_rectangle([(W - w) / 2 - 22, y - 10, (W + w) / 2 + 22, y + 62], 14, fill=(0, 0, 0, 165))
                    d.text(((W - w) / 2, y), ln, font=font, fill=WHITE); y += 78
    return sub

def boton(im, d, T, y=900, txt='Cotizá gratis por WhatsApp'):
    a = ease((T - 0.4) / 0.4)
    if a <= 0: return
    sc = 1 + 0.04 * math.sin(T * 4) if T > 1.0 else a
    bw, bh = int(820 * sc), int(130 * sc); x0, y0 = (W - bw) // 2, y - (bh - 130) // 2
    d.rounded_rectangle([x0, y0, x0 + bw, y0 + bh], bh // 2, fill=GREEN + (int(255 * a),))
    centro(d, y0 + bh / 2 - 34, txt, f(XB, 52), (10, 30, 20))
    centro(d, y + 170, 'Link en la bio · te lo calculamos antes de que compres', f(SEMI, 34), WHITE)

def caja(d, x, y, w, h, col):
    d.rectangle([x, y, x + w, y + h], fill=col + (60,), outline=col + (255,), width=6)
    d.line([x, y + h * 0.3, x + w, y + h * 0.3], fill=col + (255,), width=4)

# ---------- reel03 ----------
S3 = subs_de([(0.1, 3.0, 'Mismo pedido, mismos 18 kilos.'),
              (3.1, 7.4, 'Pero si viene en cajas grandes, el envío te sale 126 dólares más caro.'),
              (7.5, 11.0, 'Porque el avión cobra por el espacio que ocupa la caja, no solo por lo que pesa.'),
              (11.1, 15.0, 'Antes de comprar, pedile al proveedor las medidas de la caja y mandámelas.')])

def a1(t):
    im = BASE.copy(); d = ImageDraw.Draw(im, 'RGBA'); marca(d)
    tarjeta(d, [130, 420, 950, 1180])
    centro(d, 470, 'MISMO PEDIDO', f(XB, 56), RED)
    centro(d, 560, '40 pares de zapatillas', f(SEMI, 44), WHITE)
    texto_escalado(im, 680, '18 kg', f(BLACK, 200), YEL, pop(t / 0.45) * ease(t / 0.35))
    centro(d, 1010, 'de peso real, en 2 cajas', f(SEMI, 40), GREY)
    S3(im, t); return im

def a2(t):
    T = t - 3.1; im = BASE.copy(); d = ImageDraw.Draw(im, 'RGBA'); marca(d)
    centro(d, 360, 'DOS FORMAS DE EMBALARLO', f(XB, 48), RED)
    for i, (x, cw, ch, med, kg, usd, col) in enumerate([(110, 380, 300, '60×40×40 cm', '39 kg', 'USD 702', RED),
                                                       (590, 320, 250, '50×40×40 cm', '32 kg', 'USD 576', GREEN)]):
        al = ease((T - i * 0.6) / 0.4)
        if al <= 0: continue
        caja(d, x + (380 - cw) // 2, 520 + (300 - ch), cw, ch, col)
        cx = x + 190
        for y, txt, fo, fi in [(860, med, f(SEMI, 38), WHITE), (920, 'se cobran', f(MED, 32), GREY), (965, kg, f(BLACK, 64), WHITE), (1060, usd, f(BLACK, 64), YEL)]:
            w = d.textlength(txt, font=fo); d.text((cx - w / 2, y), txt, font=fo, fill=fi + (int(255 * al),))
    centro(d, 1170, 'Flete China → tu casa, 2 cajas', f(MED, 30), GREY)
    S3(im, t); return im

def a3(t):
    T = t - 7.5; im = BASE.copy(); d = ImageDraw.Draw(im, 'RGBA'); marca(d)
    tarjeta(d, [100, 420, 980, 1200], fill=(255, 230, 0, 30), borde=(255, 230, 0, 120))
    centro(d, 470, 'TE COBRAN AIRE', f(XB, 56), YEL)
    texto_escalado(im, 580, 'USD 126', f(BLACK, 190), WHITE, pop(T / 0.45) * ease(T / 0.35))
    centro(d, 840, 'más, por la caja grande', f(SEMI, 44), WHITE)
    centro(d, 960, 'El avión cobra el espacio que ocupa', f(SEMI, 40), GREY)
    centro(d, 1016, 'la caja, no solo lo que pesa.', f(SEMI, 40), GREY)
    S3(im, t); return im

def a4(t):
    T = t - 11.1; im = BASE.copy(); d = ImageDraw.Draw(im, 'RGBA'); marca(d)
    tarjeta(d, [100, 380, 980, 760])
    centro(d, 430, 'ANTES DE COMPRAR', f(XB, 52), RED)
    centro(d, 530, 'pedile al proveedor', f(SEMI, 46), WHITE)
    centro(d, 600, 'las medidas de la caja', f(BLACK, 62), YEL)
    boton(im, d, T)
    centro(d, 1200, 'Cálculo de PuertoBox del 17/11/2026: 40 pares, USD 800, 18 kg en 2 cajas.', f(MED, 26), GREY)
    centro(d, 1236, 'Se suma la gestión (USD 40). Impuestos estimados, aparte.', f(MED, 26), GREY)
    S3(im, t); return im

# ---------- reel04 ----------
S4 = subs_de([(0.1, 3.0, 'Antes de pagarle al proveedor chino, pedile tres cosas.'),
              (3.1, 8.4, 'El precio, el peso y las medidas de la caja.'),
              (8.5, 11.4, 'Con eso te digo cuánto te sale todo puesto en tu casa, antes de comprar.'),
              (11.5, 14.5, 'Escribime y te lo calculo.')])

def b1(t):
    im = BASE.copy(); d = ImageDraw.Draw(im, 'RGBA'); marca(d)
    tarjeta(d, [130, 420, 950, 1180])
    centro(d, 480, 'ANTES DE PAGARLE', f(XB, 58), RED)
    centro(d, 560, 'AL PROVEEDOR CHINO', f(XB, 58), RED)
    centro(d, 700, 'pedile', f(SEMI, 48), WHITE)
    texto_escalado(im, 780, '3 cosas', f(BLACK, 180), YEL, pop(t / 0.45) * ease(t / 0.35))
    S4(im, t); return im

ITEMS = [('1', 'El precio', 'lo que dice la factura'), ('2', 'El peso', 'de cada caja, en kilos'), ('3', 'Las medidas', 'largo × ancho × alto de la caja')]
def b2(t):
    T = t - 3.1; im = BASE.copy(); d = ImageDraw.Draw(im, 'RGBA'); marca(d)
    tarjeta(d, [100, 400, 980, 1220])
    y = 450
    for i, (n, a, b) in enumerate(ITEMS):
        al = ease((T - 0.2 - i * 0.9) / 0.4)
        if al > 0:
            d.ellipse([150, y + 10, 250, y + 110], fill=YEL + (int(255 * al),))
            w = d.textlength(n, font=f(BLACK, 64)); d.text((200 - w / 2, y + 18), n, font=f(BLACK, 64), fill=(14, 24, 48, int(255 * al)))
            d.text((290, y + 8), a, font=f(BLACK, 60), fill=WHITE + (int(255 * al),))
            d.text((290, y + 84), b, font=f(SEMI, 36), fill=GREY + (int(255 * al),))
        y += 250
    S4(im, t); return im

def b3(t):
    T = t - 8.5; im = BASE.copy(); d = ImageDraw.Draw(im, 'RGBA'); marca(d)
    tarjeta(d, [100, 420, 980, 1200], fill=(255, 230, 0, 30), borde=(255, 230, 0, 120))
    centro(d, 480, 'CON ESO', f(XB, 56), YEL)
    centro(d, 580, 'te decimos cuánto', f(SEMI, 48), WHITE)
    centro(d, 650, 'te sale todo', f(SEMI, 48), WHITE)
    texto_escalado(im, 760, 'en tu casa', f(BLACK, 130), YEL, pop(T / 0.45) * ease(T / 0.35))
    centro(d, 960, 'flete, gestión e impuestos estimados,', f(SEMI, 38), GREY)
    centro(d, 1012, 'antes de que compres', f(SEMI, 38), GREY)
    S4(im, t); return im

def b4(t):
    T = t - 11.5; im = BASE.copy(); d = ImageDraw.Draw(im, 'RGBA'); marca(d)
    tarjeta(d, [100, 380, 980, 760])
    centro(d, 440, 'PRECIO · PESO · MEDIDAS', f(XB, 50), RED)
    centro(d, 560, 'Mandanos esos 3 datos', f(BLACK, 58), YEL)
    centro(d, 650, 'y te lo calculamos gratis', f(SEMI, 44), WHITE)
    boton(im, d, T)
    S4(im, t); return im

REELS = {'reel03': [('a1', a1, 0.0, 3.1), ('a2', a2, 3.1, 7.5), ('a3', a3, 7.5, 11.1), ('a4', a4, 11.1, 15.0)],
         'reel04': [('b1', b1, 0.0, 3.1), ('b2', b2, 3.1, 8.5), ('b3', b3, 8.5, 11.5), ('b4', b4, 11.5, 14.6)]}

if __name__ == '__main__':
    nombre = sys.argv[1]; esc = REELS[nombre]; os.makedirs('out', exist_ok=True)
    if sys.argv[2:] == ['frames']:
        for _, fn, a, b in esc: fn((a + b) / 2 + 0.6).save(f'out/{nombre}_{_}.png')
    else:
        for n, fn, a, b in esc: R.render(f'{nombre}_{n}', fn, a, b)
        print('ok')
