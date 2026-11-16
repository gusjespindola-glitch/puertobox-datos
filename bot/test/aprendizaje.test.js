'use strict';
const test = require('node:test');
const assert = require('node:assert');
process.env.OWNER_NUMBER = '5491100000000';
const ap = require('../aprendizaje');
const { crearStore } = require('../store');
const { paginaCharlas } = require('../recordatorios');

const CLIENTE = '5491155554444';
function storeConCharla() {
  const store = crearStore(null);
  store.agregar(CLIENTE, 'user', 'Hola, me llamo Ramiro Pérez, mi cel es +54 9 11 5555-4444 y mi mail ramiro@gmail.com. Quiero traer 100 remeras, link https://detail.1688.com/offer/123.html [archivo:/media/0123456789abcdef0123456789abcdef.jpg]');
  store.agregar(CLIENTE, 'assistant', 'Por el dato. ¿Cuánto pesa?');
  store.guardarLead(CLIENTE, { nombre: 'Ramiro Pérez', estado: 'nuevo' });
  store.agregar('5491100000000', 'user', 'prueba de Gustavo');
  return store;
}

test('anonimizar saca teléfonos, mails, links, archivos, CUIT y nombres', () => {
  const s = ap.anonimizar('Soy Ramiro, CUIT 20-12345678-9, tel 221 682 6773, a@b.com, https://x.com/y [archivo:/media/a.jpg]. Pérez paga 500 USD por 20 kg.', ['Ramiro Pérez']);
  for (const prohibido of ['Ramiro', 'Pérez', '12345678', '6826773', 'a@b.com', 'x.com', '/media/']) assert.ok(!s.includes(prohibido), `quedó ${prohibido}: ${s}`);
  assert.match(s, /500 USD por 20 kg/); // los datos del pedido quedan
});

test('charlas del día: anonimizadas y sin los números de Gustavo', () => {
  const ch = ap.charlasDelDia(crearStoreYDevolver(), '5491100000000');
  assert.strictEqual(ch.length, 1);
  const t = ch[0].texto;
  for (const prohibido of ['Ramiro', 'Pérez', '5555', 'gmail', '1688', '/media/']) assert.ok(!t.includes(prohibido), `quedó ${prohibido}`);
  assert.match(t, /Bot: Por el dato/);
});
function crearStoreYDevolver() { return storeConCharla(); }

test('corrección de Gustavo: se guarda anonimizada y entra en las instrucciones del bot', async () => {
  const store = storeConCharla();
  const c = ap.agregarCorreccion(store, CLIENTE, 'No digas "Por el dato." Preguntá directo: ¿Sabés cuánto pesa la caja? Ramiro no tiene que leer frases mochas.');
  assert.ok(c && !c.indicacion.includes('Ramiro') && c.bot_dijo.startsWith('Por el dato'));
  assert.strictEqual(ap.agregarCorreccion(store, CLIENTE, '   '), null);
  const extra = ap.textoCorrecciones(store);
  assert.match(extra, /Tenía que ser: No digas/);
  // El bot la recibe en sus instrucciones en el próximo mensaje
  const { procesar } = require('../server');
  let sistema;
  const fetchImpl = async (url, opt) => {
    if (url.includes('anthropic')) { sistema = JSON.parse(opt.body).system; return { ok: true, json: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: '¿Sabés cuánto pesa la caja?' }] }) }; }
    return { ok: true, text: async () => '' };
  };
  await procesar({ entry: [{ changes: [{ value: { messages: [{ id: 'x1', from: CLIENTE, type: 'text', text: { body: 'no sé' } }] } }] }] }, { fetchImpl, store, debounceMs: 0 });
  assert.ok(Array.isArray(sistema) && sistema.length === 2, 'segundo bloque de instrucciones');
  assert.match(sistema[1].text, /Correcciones de nuestro despachante/);
});

test('/charlas muestra "Corregir al bot" solo si se pasa el link', () => {
  const store = storeConCharla();
  const con = paginaCharlas(store, '5491100000000', Date.now(), 3, null, null, '', null, (tel) => `/corregir?tel=${tel}&t=x`);
  assert.match(con, /Corregir al bot/);
  assert.match(con, /action="\/corregir\?tel=5491155554444&amp;t=x"/);
  assert.doesNotMatch(paginaCharlas(store, '5491100000000'), /Corregir al bot/);
});

function mockGitHub({ ramaExiste = false } = {}) {
  const llamadas = [];
  const fetchImpl = async (url, opt = {}) => {
    const body = opt.body ? JSON.parse(opt.body) : null;
    llamadas.push({ url, metodo: opt.method, body });
    if (url.includes('anthropic')) {
      return { ok: true, json: async () => ({ content: [{ type: 'text', text: '# Revisión del bot\n\n## Errores\n### Charla 1 — frase mocha\nEl cliente +54 9 11 5555-4444 recibió "Por el dato."' }] }) };
    }
    const r = (status, json) => ({ status, ok: status < 300, text: async () => (json ? JSON.stringify(json) : '') });
    if (url.endsWith('/git/ref/heads/aprendizaje-bot')) return ramaExiste ? r(200, { object: { sha: 'b' } }) : r(404, { message: 'Not Found' });
    if (url.endsWith('/git/ref/heads/main')) return r(200, { object: { sha: 'abc' } });
    if (url.endsWith('/git/refs')) return r(201, { ref: 'refs/heads/aprendizaje-bot' });
    if (opt.method === 'GET' && url.includes('/contents/')) return r(404, { message: 'Not Found' });
    if (opt.method === 'PUT') return r(201, { content: { path: 'x' } });
    return r(500, {});
  };
  return { fetchImpl, llamadas };
}

test('revisión nocturna: a las 23 h, una sola vez, sin datos personales, a la rama aprendizaje-bot', async () => {
  const store = storeConCharla();
  const { fetchImpl, llamadas } = mockGitHub();
  const a23 = Date.parse('2026-11-16T02:10:00Z'); // 23:10 en Argentina del 15/11
  process.env.GITHUB_TOKEN = 'token-de-prueba';
  try {
    assert.strictEqual(await ap.tick({ store, owner: '5491100000000', reglas: 'REGLAS', fetchImpl, ahora: Date.parse('2026-11-16T01:50:00Z') }), null, 'antes de las 23 no corre');
    const r = await ap.tick({ store, owner: '5491100000000', reglas: 'REGLAS', fetchImpl, ahora: a23 });
    assert.ok(r.ok, JSON.stringify(r));
    assert.strictEqual(r.ruta, 'docs/aprendizaje/2026-11-15.md');
    const ia = llamadas.find((l) => l.url.includes('anthropic')).body;
    assert.ok(!JSON.stringify(ia).includes('Ramiro') && !JSON.stringify(ia).includes('5555'), 'a la IA no le llegan datos personales');
    assert.ok(llamadas.some((l) => l.url.endsWith('/git/refs') && l.body.sha === 'abc'), 'crea la rama desde main');
    const put = llamadas.find((l) => l.metodo === 'PUT');
    assert.strictEqual(put.body.branch, 'aprendizaje-bot');
    const subido = Buffer.from(put.body.content, 'base64').toString('utf8');
    assert.ok(!subido.includes('5555'), 'si la IA escribe un teléfono, se borra antes de subir');
    assert.match(subido, /frase mocha/);
    assert.strictEqual(await ap.tick({ store, owner: '5491100000000', reglas: 'REGLAS', fetchImpl, ahora: a23 + 15 * 60e3 }), null, 'no corre dos veces el mismo día');
  } finally { delete process.env.GITHUB_TOKEN; }
});

test('sin GITHUB_TOKEN arma el informe igual y avisa el motivo; sin charlas no gasta IA', async () => {
  const store = storeConCharla();
  const { fetchImpl } = mockGitHub();
  const r = await ap.tick({ store, owner: '5491100000000', reglas: 'R', fetchImpl, ahora: Date.parse('2026-11-16T02:10:00Z') });
  assert.strictEqual(r.error, 'falta GITHUB_TOKEN', 'sin token cuenta como intento fallido (se reintenta)');
  const vacio = crearStore(null);
  const m = mockGitHub();
  const r2 = await ap.revisarDia({ store: vacio, owner: '5491100000000', fetchImpl: m.fetchImpl, reglas: 'R' });
  assert.strictEqual(r2.charlas, 0);
  assert.ok(!m.llamadas.some((l) => l.url.includes('anthropic')));
});

test('revisión nocturna: si falla reintenta, a la madrugada recupera el día anterior y al final avisa (16/11)', async () => {
  const store = storeConCharla();
  const base = mockGitHub();
  let fallar = 4; // la IA falla los dos primeros intentos (2 modelos por intento)
  const fetchImpl = async (url, opt) => (url.includes('anthropic') && fallar-- > 0 ? { ok: false, status: 529, text: async () => 'overloaded' } : base.fetchImpl(url, opt));
  process.env.GITHUB_TOKEN = 'token-de-prueba';
  try {
    const a23 = Date.parse('2026-11-16T02:10:00Z'); // 23:10 del 15/11
    assert.ok((await ap.tick({ store, owner: '5491100000000', reglas: 'R', fetchImpl, ahora: a23 })).error, 'primer intento falla');
    assert.strictEqual(store.meta('aprendizajeEstado').ok, false, 'no queda marcado como hecho');
    assert.ok((await ap.tick({ store, owner: '5491100000000', reglas: 'R', fetchImpl, ahora: a23 + 15 * 60e3 })).error, 'segundo intento falla');
    const r = await ap.tick({ store, owner: '5491100000000', reglas: 'R', fetchImpl, ahora: Date.parse('2026-11-16T03:10:00Z') }); // 00:10 del 16/11
    assert.ok(r.ok, JSON.stringify(r));
    assert.strictEqual(r.ruta, 'docs/aprendizaje/2026-11-15.md', 'pasada la medianoche sube el informe del día anterior');
    assert.strictEqual(await ap.tick({ store, owner: '5491100000000', reglas: 'R', fetchImpl, ahora: Date.parse('2026-11-16T03:25:00Z') }), null, 'ya hecho: no repite');
  } finally { delete process.env.GITHUB_TOKEN; }

  assert.strictEqual(ap.fechaPendiente(Date.parse('2026-11-16T11:00:00Z')), '2026-11-15', 'a las 8 de la mañana todavía recupera ayer');
  assert.strictEqual(ap.fechaPendiente(Date.parse('2026-11-16T18:00:00Z')), null, 'a la tarde no corre');

  // Si falla siempre: después del último intento sube un informe con el motivo y avisa a Gustavo.
  const s2 = storeConCharla();
  const m2 = mockGitHub();
  let llamadasIA = 0;
  const siempreFalla = async (url, opt) => (url.includes('anthropic') && ++llamadasIA ? { ok: false, status: 500, text: async () => 'caída' } : m2.fetchImpl(url, opt));
  const avisos = [];
  process.env.GITHUB_TOKEN = 'token-de-prueba';
  try {
    for (let i = 0; i < ap.MAX_INTENTOS + 2; i++) await ap.tick({ store: s2, owner: '5491100000000', reglas: 'R', fetchImpl: siempreFalla, ahora: Date.parse('2026-11-16T02:10:00Z') + i * 15 * 60e3, avisar: async (t) => avisos.push(t) });
  } finally { delete process.env.GITHUB_TOKEN; }
  assert.strictEqual(llamadasIA, ap.MAX_INTENTOS * 2, // modelo principal + respaldo por intento
    'no reintenta para siempre');
  assert.strictEqual(avisos.length, 1, 'avisa una sola vez');
  const put = m2.llamadas.find((l) => l.metodo === 'PUT');
  assert.match(Buffer.from(put.body.content, 'base64').toString('utf8'), /No se pudo armar la revisión/);
});

test('si la IA contesta sin texto, prueba con el modelo del bot y anota por qué vino vacía (16/11)', async () => {
  const store = storeConCharla();
  const base = mockGitHub();
  const modelos = [];
  const fetchImpl = async (url, opt) => {
    if (url.includes('anthropic')) {
      modelos.push(JSON.parse(opt.body).model);
      if (modelos.length === 1) return { ok: true, json: async () => ({ stop_reason: 'max_tokens', content: [{ type: 'thinking', thinking: '...' }] }) };
    }
    return base.fetchImpl(url, opt);
  };
  const r = await ap.revisarDia({ store, owner: '5491100000000', fetchImpl, reglas: 'R', ahora: Date.parse('2026-11-16T02:10:00Z') });
  assert.strictEqual(modelos.length, 2, 'probó un segundo modelo');
  assert.notStrictEqual(modelos[0], modelos[1]);
  assert.match(r.contenido, /frase mocha/);
  const vacia = async (url, opt) => (url.includes('anthropic') ? { ok: true, json: async () => ({ stop_reason: 'refusal', content: [] }) } : base.fetchImpl(url, opt));
  await assert.rejects(ap.revisarDia({ store, owner: '5491100000000', fetchImpl: vacia, reglas: 'R', ahora: Date.parse('2026-11-16T02:10:00Z') }), /stop_reason=refusal/);
});
