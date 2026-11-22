'use strict';
// 22/11 (Gustavo: "se me está gastando todo el saldo"): medidor y tope de gasto de IA.
const test = require('node:test');
const assert = require('node:assert');
const G = require('../gasto');
const { crearStore } = require('../store');
const { conCache } = require('../clasificador');
const { definiciones } = require('../tools');

const respuesta = (model, usage) => ({ ok: true, clone() { return this; }, json: async () => ({ model, usage, content: [] }) });

test('costo: Sonnet con búsquedas web y caché, Haiku barato', () => {
  const s = G.costo('claude-sonnet-5-5', { input_tokens: 1e6, output_tokens: 0, server_tool_use: { web_search_requests: 3 } });
  assert.strictEqual(Math.round(s * 100) / 100, 2.03);
  assert.strictEqual(G.costo('claude-sonnet-5-5', { cache_read_input_tokens: 1e6 }), 0.10);
  assert.ok(G.costo('claude-haiku-5-5', { input_tokens: 10000, output_tokens: 500 }) < 0.0015);
});

test('parte: reconoce cada pieza por sus herramientas e instrucciones', () => {
  assert.strictEqual(G.parte({ tools: definiciones }), 'charlas');
  assert.strictEqual(G.parte({ tools: [{ type: 'web_search_20250305', name: 'web_search' }, { name: 'consultar_bibliografia' }] }), 'clasificador');
  assert.strictEqual(G.parte({ system: require('../adjuntos').INSTRUCCIONES }), 'archivos');
  assert.strictEqual(G.parte({ system: require('../links').INSTRUCCION }), 'links');
  assert.strictEqual(G.parte({ system: require('../intervenciones').INSTRUCCION }), 'intervenciones');
  assert.strictEqual(G.parte({ system: 'Sos el supervisor de calidad del bot de WhatsApp...' }), 'revision');
});

test('envolver: suma el gasto y, pasado el tope, abarata todo menos las charlas', async () => {
  process.env.GASTO_IA_TOPE_DIA = '0.5';
  const store = crearStore(null);
  const pedidos = []; const avisos = [];
  const base = async (url, opts) => { const b = JSON.parse(opts.body); pedidos.push(b); return respuesta(b.model, { input_tokens: 200000, output_tokens: 1000 }); };
  const f = G.envolver({ store, fetchBase: base, avisar: (t) => avisos.push(t) });
  const clasif = { model: 'claude-sonnet-5-5', tools: [{ type: 'web_search_20250305', name: 'web_search' }, { name: 'consultar_bibliografia' }], messages: [] };
  await f('https://api.anthropic.com/v1/messages', { method: 'POST', body: JSON.stringify(clasif) }); // 0,41
  await f('https://api.anthropic.com/v1/messages', { method: 'POST', body: JSON.stringify(clasif) }); // 0,82 → tope
  assert.strictEqual(avisos.length, 1);
  await f('https://api.anthropic.com/v1/messages', { method: 'POST', body: JSON.stringify(clasif) });
  assert.strictEqual(pedidos[2].model, 'claude-haiku-5-5');
  assert.ok(!pedidos[2].tools.some((t) => t.name === 'web_search'), 'sin búsqueda web pasado el tope');
  await f('https://api.anthropic.com/v1/messages', { method: 'POST', body: JSON.stringify({ model: 'claude-haiku-5-5', tools: definiciones, messages: [] }) });
  assert.strictEqual(pedidos[3].model, 'claude-haiku-5-5');
  assert.strictEqual(avisos.length, 1, 'un solo aviso por día');
  assert.match(G.resumen(store), /Gasto de IA hoy: USD 1,02 \(clasificador de posiciones USD 0,92 · charlas con clientes USD 0,10\)/);
  // Lo que no es la API de Anthropic pasa sin tocar.
  await f('https://ntfy.sh/x', { method: 'POST', body: 'hola' }).catch(() => {});
  delete process.env.GASTO_IA_TOPE_DIA;
});

test('clasificador: marca de caché en el último mensaje (lo reenviado se cobra al 5%)', () => {
  const m = [{ role: 'user', content: 'producto' }, { role: 'assistant', content: [{ type: 'text', text: 'x' }] }, { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'a', content: '{}' }] }];
  const c = conCache(m);
  assert.deepStrictEqual(c[2].content[0].cache_control, { type: 'ephemeral' });
  assert.ok(!m[2].content[0].cache_control, 'no cambia el historial guardado');
  assert.strictEqual(conCache([{ role: 'user', content: 'hola' }])[0].content, 'hola');
});
