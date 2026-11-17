'use strict';
// Revisión nocturna del 16/11 (11 charlas, 9 con errores): arreglos que se pueden probar sin gastar IA.
process.env.NODE_ENV = 'test';
const test = require('node:test');
const assert = require('node:assert');
const { crearStore } = require('../store');

const txt = (t) => ({ ok: true, json: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: t }] }) });

test('no vuelve a saludar a mitad de charla (charlas 9 y 10)', async () => {
  const { responder, sacarSaludo } = require('../agent');
  assert.strictEqual(sacarSaludo('Hola, ¿cómo estás? Para avanzar necesito el peso.', true), 'Para avanzar necesito el peso.');
  assert.strictEqual(sacarSaludo('Hola, buen día. Solo trabajamos courier aéreo.', true), 'Solo trabajamos courier aéreo.');
  assert.strictEqual(sacarSaludo('Hola, ¿cómo estás? ¿Qué querés traer?', false), 'Hola, ¿cómo estás? ¿Qué querés traer?'); // primer mensaje: sí saluda
  const st = crearStore(null);
  st.agregar('5491', 'user', 'quiero traer scrubs');
  st.agregar('5491', 'assistant', '¿De qué material son?');
  const r = await responder({ telefono: '5491', texto: 'poliester', store: st, fetchImpl: async () => txt('Hola, ¿cómo estás? ¿Cuánto le pagás al proveedor por los 40?') });
  assert.strictEqual(r, '¿Cuánto le pagás al proveedor por los 40?');
});

test('no manda dos veces el mismo mensaje (charlas 1, 6, 7 y 11), salvo que el cliente lo pida', async () => {
  const { responder } = require('../agent');
  const repetido = 'Sin problema. Cuando tengas el peso y las medidas de la caja me los pasás y te armo el presupuesto.';
  const st = crearStore(null);
  st.agregar('5492', 'user', 'no se cuanto pesa');
  st.agregar('5492', 'assistant', repetido);
  assert.strictEqual(await responder({ telefono: '5492', texto: 'ok', store: st, fetchImpl: async () => txt(repetido) }), null);
  assert.strictEqual(st.historial('5492').filter((m) => m.content === repetido).length, 1);
  // Si lo pide de nuevo, se manda.
  assert.strictEqual(await responder({ telefono: '5492', texto: 'me lo reenviás?', store: st, fetchImpl: async () => txt(repetido) }), repetido);
  // Un mensaje distinto sale normal.
  assert.match(await responder({ telefono: '5492', texto: 'son 3 kg', store: st, fetchImpl: async () => txt('¿Y las medidas de la caja?') }), /medidas/);
});

test('una reacción con emoji no se contesta (charla 9)', async () => {
  const { procesar } = require('../server');
  const st = crearStore(null);
  const enviados = [];
  const fetchImpl = async (url, opt) => { enviados.push(url); return txt('¿Me pasás el peso?'); };
  const payload = { entry: [{ changes: [{ value: { messages: [{ id: 'r1', from: '5493', type: 'reaction', reaction: { emoji: '👍' } }] } }] }] };
  const out = await procesar(payload, { fetchImpl, store: st, debounceMs: 0 });
  assert.deepStrictEqual(out, []);
  assert.strictEqual(enviados.length, 0);
});

test('revisión nocturna: las posiciones arancelarias no se borran al anonimizar (salía "[número]J")', () => {
  const { anonimizar } = require('../aprendizaje');
  const s = anonimizar('Posición 6108.22.00.110J y 6108.22, teléfono +54 9 221 555-1234');
  assert.match(s, /6108\.22\.00\.110J/);
  assert.match(s, /6108\.22\b/);
  assert.doesNotMatch(s, /555/);
});

test('revisión nocturna: si el modelo no acepta "sin pensar", repite el pedido sin ese parámetro (Sonnet 5.5, 400)', async () => {
  const { pedirSinPensar } = require('../aprendizaje');
  const cuerpos = [];
  const fetchImpl = async (url, opt) => {
    const b = JSON.parse(opt.body); cuerpos.push(b);
    if (b.thinking) return { ok: false, status: 400, text: async () => '{"error":{"message":"To turn thinking off on this model, send \\"thinking\\""}}' };
    return txt('# Revisión');
  };
  const r = await pedirSinPensar(fetchImpl, { model: 'claude-sonnet-5-5', max_tokens: 10, messages: [] });
  assert.ok(r.ok);
  assert.strictEqual(cuerpos.length, 2);
  assert.strictEqual(cuerpos[1].thinking, undefined);
  // Otro 400 (no de "pensar") no se reintenta.
  const r2 = await pedirSinPensar(async () => ({ ok: false, status: 400, text: async () => 'otro error' }), { model: 'x', messages: [] });
  assert.strictEqual(r2.ok, false);
  assert.strictEqual(await r2.text(), 'otro error');
});

test('prompt: fallas internas, proveedor, ahorros, "ok gracias", peso estimado, captura y pesos', () => {
  const p = require('../agent').SYSTEM;
  assert.match(p, /Hablar de fallas internas/);
  assert.match(p, /Hablar mal del proveedor/);
  assert.match(p, /Estimar ahorros, compararte con otros couriers/);
  assert.match(p, /ok gracias/);
  assert.match(p, /Con 40 scrubs el peso sale en unos 14 kg/);
  assert.match(p, /Decir que no te llegó una imagen o captura/);
  assert.match(p, /Precio en pesos/);
});
