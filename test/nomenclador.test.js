'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { crear, liquidar } = require('../src/nomenclador');
const d = (f) => require(path.join(__dirname, '..', 'web', 'nomenclador', 'data', f));
const N = crear({ sim: d('sim.json'), sufijos: d('sufijos.json'), intervenciones: d('intervenciones.json'), sinonimos: d('sinonimos.json'), notas: d('notas.json'), frecuentes: d('productos_frecuentes.json') });

test('liquidación pequeños envíos = ejemplo del curso (Courier 2025)', () => {
  const r = liquidar({ regimen: 'pequenos', fob: 1168.75, flete: 46.46, die: 2 });
  assert.ok(Math.abs(r.cif - 1227.36) < 0.05);
  assert.ok(Math.abs(r.di - 16.55) < 0.05);
  assert.ok(Math.abs(r.te - 24.82) < 0.05);
  assert.ok(Math.abs(r.iva - 266.43) < 0.05);
  assert.ok(Math.abs(r.tributos - 307.80) < 0.1);
});

test('liquidación courier general = ejemplo del curso', () => {
  const r = liquidar({ regimen: 'courier', fob: 1168.75, flete: 46.46, die: 2 });
  assert.ok(Math.abs(r.tributos - 332.00) < 0.1);
  assert.strictEqual(r.percepciones, 0);
});

test('régimen general suma percepciones', () => {
  const r = liquidar({ regimen: 'general', fob: 1000, flete: 100, die: 20 });
  assert.ok(r.percepcion_iva > 0 && r.percepcion_ganancias > 0);
});

test('ficha de 6404.19 trae DIE 20%, jerarquía e intervenciones', () => {
  const f = N.ficha('6404.19');
  assert.ok(f.posicion.startsWith('6404.19'));
  assert.strictEqual(f.die, 20);
  assert.ok(f.jerarquia.length >= 2);
  assert.ok(f.intervenciones.some((i) => i.organismo === 'Etiquetado textil y calzado'));
  assert.ok(!f.intervenciones.some((i) => i.organismo === 'SIDIP'), 'SIDIP hoy solo alcanza celulares');
  assert.ok(f.notas.includes('CAPITULO 64'));
});

test('búsqueda por posición y por texto', () => {
  assert.ok(N.buscar('8518.30')[0].c.startsWith('8518.30'));
  assert.ok(N.buscar('auriculares').length > 0);
});

test('productos frecuentes: zapatillas no caen en "desmontados" (DIE 0%) y se encuentran con otras palabras', () => {
  for (const q of ['zapatillas', 'zapatillas deportivas', 'calzado deportivo', 'Zapatillas de running']) {
    const r = N.buscar(q, 10);
    assert.ok(r.length, q);
    assert.ok(r.every((f) => !/desmontad|sin montar/.test(f.txt)), q);
    assert.ok(r[0].c.startsWith('6404.11') && r[0].die > 0, q);
    assert.ok(r[0].frecuente, q);
  }
});

test('productos frecuentes: memorias, pendrives, pesas, silla gamer y bandejas encuentran su posición', () => {
  const esp = { 'memorias usb': '8523.51', pendrive: '8523.51', 'pesas de 1 kg': '9506.91', 'mats de yoga': '9506.91', 'silla gamer': '9401.3', 'bandejas de repostería': '3924.10', 'collar de perro': '4201.00', 'reloj inteligente': '8517.62' };
  for (const [q, p] of Object.entries(esp)) assert.ok(N.buscar(q, 5)[0].c.startsWith(p), `${q} → ${N.buscar(q, 5)[0]?.c}`);
});

test('búsqueda general: "desmontados" va al final salvo que se pida', () => {
  const r = N.buscar('calzado deporte suela caucho', 5);
  assert.ok(r.length && !/desmontad|sin montar/.test(r[0].txt));
});

test('todas las subpartidas de productos frecuentes existen en el arancel', () => {
  const fr = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '..', 'ncm', 'productos_frecuentes.json'), 'utf8'));
  for (const p of fr.productos) for (const pre of p.prefijos) assert.ok(N.buscar(pre, 1).length, `${pre} no existe`);
});
