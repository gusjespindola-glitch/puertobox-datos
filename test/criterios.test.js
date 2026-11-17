'use strict';
// Criterios de clasificación de ARCA en el nomenclador y en el bot (16/11, Gustavo: "copiá Tarifar y PCRAM").
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

test('cada criterio cargado apunta a una posición que existe y a una norma con link', () => {
  const c = require('../ncm/criterios.json');
  const sim = require('../web/nomenclador/data/sim.json');
  const ncm = new Set(sim.p.map((f) => f[0].slice(0, 10)));
  const normas = new Set(c.normas.map((n) => n.id));
  for (const x of c.criterios) {
    assert.ok(ncm.has(x.pos), `${x.pos} existe en el arancel`);
    assert.ok(normas.has(x.norma), `${x.norma} tiene link`);
    assert.match(x.criterio, /^\d{1,3}\/\d{2}$/);
  }
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'web', 'nomenclador', 'data', 'criterios.json'), 'utf8')), c, 'la copia de la página es igual');
});

test('las cintas (3005.10.90) muestran el criterio de esparadrapo, y se encuentra buscando por palabras', () => {
  const cr = require('../src/criterios');
  const d = cr.dePosicion('3005.10.90.000W');
  assert.strictEqual(d.length, 1);
  assert.match(d[0].desc, /esparadrapo/);
  assert.match(d[0].url, /norma-59645/);
  assert.strictEqual(cr.buscar('cinta adhesiva medica')[0].pos, '3005.10.90');
  assert.deepStrictEqual(cr.buscar('zz'), []);
});

test('el bot ve los criterios al buscar la posición', async () => {
  const { ejecutar } = require('../bot/tools');
  const ctx = { telefono: '1', store: { lead: () => null, guardarLead() {} } };
  const r = JSON.stringify(await ejecutar('buscar_posicion', { producto: '3005.10.90' }, ctx));
  assert.match(r, /Criterio 201\/99/);
  const r2 = JSON.stringify(await ejecutar('buscar_posicion', { producto: 'tejido fibra de vidrio' }, ctx));
  assert.match(r2, /criterios_arca_parecidos[\s\S]*7019\.69\.00/);
});

test('la ficha del nomenclador muestra la sección de criterios con el link a la norma', async () => {
  const W = path.join(__dirname, '..', 'web', 'nomenclador');
  const html = fs.readFileSync(path.join(W, 'index.html'), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/g).pop().replace(/<\/?script>/g, '');
  const els = {};
  const el = () => ({ innerHTML: '', textContent: '', value: '', style: {}, dataset: {}, classList: { toggle() {}, add() {}, remove() {} }, addEventListener() {}, querySelectorAll: () => [] });
  const ctx = {
    console, setTimeout, clearTimeout, URLSearchParams,
    localStorage: { getItem: () => null, setItem() {} }, location: { hash: '#p-30051090' }, history: { replaceState() {} },
    document: { getElementById: (id) => (els[id] = els[id] || el()), querySelectorAll: () => [], addEventListener() {} },
    fetch: async (u) => {
      if (String(u).startsWith('data/')) return { ok: true, json: async () => JSON.parse(fs.readFileSync(path.join(W, u), 'utf8')) };
      return { ok: true, json: async () => ({}) };
    },
    addEventListener() {}, window: {},
  };
  ctx.window = ctx; ctx.self = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(W, 'nomenclador.js'), 'utf8'), ctx);
  try { vm.runInContext(script, ctx); } catch (e) { /* lo que no es de la ficha puede faltar en este DOM de prueba */ }
  await new Promise((r) => setTimeout(r, 300));
  // 17/11: el nomenclador ya no abre solo la posición de la dirección (#p-…): se elige a mano.
  vm.runInContext("abrir(N.buscar('30051090', 1)[0].c)", ctx);
  assert.match(els.ficha.innerHTML, /Criterios de clasificación de ARCA \(1\)/);
  assert.match(els.ficha.innerHTML, /Criterio 201\/99/);
  assert.match(els.ficha.innerHTML, /norma-59645/);
});
