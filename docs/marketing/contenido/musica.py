"""Música propia para reels (sin derechos de terceros): base pop suave sintetizada.
Uso: python3 musica.py <segundos> <salida.wav>"""
import sys, wave
import numpy as np

SR, BPM = 48000, 112
dur = float(sys.argv[1]); out = sys.argv[2]
n = int(SR * dur); t = np.arange(n) / SR
beat = 60 / BPM
mix = np.zeros(n)

def nota(f): return 440 * 2 ** ((f - 69) / 12)
def env(L, a=0.005, r=0.25):
    e = np.ones(L); A = int(a * SR); R = min(L, int(r * SR))
    e[:A] = np.linspace(0, 1, A); e[-R:] *= np.linspace(1, 0, R) ** 2
    return e
def poner(sig, t0):
    i = int(t0 * SR)
    if i >= n: return
    sig = sig[:n - i]; mix[i:i + len(sig)] += sig

# Acordes (C - G - Am - F), 2 compases de 4 tiempos cada uno ... se repite
acordes = [[60, 64, 67], [55, 59, 62], [57, 60, 64], [53, 57, 60]]
bajos = [36, 31, 33, 29]
compas = 4 * beat
k = 0
while k * compas < dur:
    ac, ba = acordes[k % 4], bajos[k % 4]
    L = int(compas * SR); tt = np.arange(L) / SR
    pad = sum(np.sin(2 * np.pi * nota(m) * tt) + 0.3 * np.sin(4 * np.pi * nota(m) * tt) for m in ac)
    poner(0.05 * pad * env(L, 0.3, 0.6), k * compas)
    for b in range(4):  # bajo en cada tiempo
        Lb = int(beat * 0.9 * SR); tb = np.arange(Lb) / SR
        poner(0.22 * np.sin(2 * np.pi * nota(ba) * tb) * np.exp(-tb * 5), k * compas + b * beat)
    for c in range(8):  # arpegio en corcheas
        m = ac[[0, 1, 2, 1, 0, 2, 1, 2][c]] + 12
        Lc = int(beat / 2 * SR); tc = np.arange(Lc) / SR
        poner(0.07 * np.sin(2 * np.pi * nota(m) * tc) * np.exp(-tc * 9), k * compas + c * beat / 2)
    k += 1

# Bombo, palmas y hi-hat
rng = np.random.default_rng(7)
for b in range(int(dur / beat) + 1):
    t0 = b * beat
    Lk = int(0.25 * SR); tk = np.arange(Lk) / SR
    poner(0.55 * np.sin(2 * np.pi * (50 + 90 * np.exp(-tk * 30)) * tk) * np.exp(-tk * 14), t0)
    if b % 2 == 1:
        Ls = int(0.18 * SR); ts = np.arange(Ls) / SR
        poner(0.16 * rng.standard_normal(Ls) * np.exp(-ts * 22), t0)
    Lh = int(0.04 * SR); th = np.arange(Lh) / SR
    hh = np.diff(rng.standard_normal(Lh + 1))
    poner(0.05 * hh * np.exp(-th * 90), t0 + beat / 2)

# Entrada y salida suaves, normalizado
fi, fo = int(0.3 * SR), int(1.0 * SR)
mix[:fi] *= np.linspace(0, 1, fi); mix[-fo:] *= np.linspace(1, 0, fo)
mix = mix / np.max(np.abs(mix)) * 0.85
pcm = (np.stack([mix, mix], 1) * 32767).astype('<i2')
with wave.open(out, 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print('ok', out)
