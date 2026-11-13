'use strict';
const test = require('node:test');
const assert = require('node:assert');
process.env.OWNER_NUMBER = '5491100000000';
const { procesar } = require('../server');
const { crearStore } = require('../store');

// Simula Anthropic (respuestas guionadas) y WhatsApp (registra envíos)
function mock(guion) {
  const llamadas = { claude: [], whatsapp: [] };
  let i = 0;
  const fetchImpl = async (url, opt) => {
    const body = JSON.parse(opt.body);
    if (url.includes('anthropic')) {
      llamadas.claude.push(body);
      const paso = guion[i++];
      return { ok: true, json: async () => (typeof paso === 'function' ? paso(body) : paso) };
    }
    llamadas.whatsapp.push(body);
    return { ok: true, text: async () => '' };
  };
  return { fetchImpl, llamadas };
}
const tool = (name, input, id = 't' + Math.random()) => ({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id, name, input }] });
const txt = (t) => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: t }] });
const msg = (from, body, id = 'm' + Math.random()) => ({ entry: [{ changes: [{ value: { messages: [{ id, from, type: 'text', text: { body } }] } }] }] });
const eco = (to, body) => ({ entry: [{ changes: [{ value: { message_echoes: [{ to, text: { body } }] } }] }] });

test('cotiza usando las herramientas y responde al cliente', async () => {
  const store = crearStore(null);
  let resultadoCotizar;
  const { fetchImpl, llamadas } = mock([
    tool('buscar_posicion', { producto: 'remeras' }),
    tool('cotizar', { kg: 2, valor_factura_usd: 80, die: 20 }),
    (body) => { resultadoCotizar = JSON.parse(body.messages.at(-1).content[0].content); return txt(`Te queda en USD ${resultadoCotizar.precio_final_usd} final 🙌`); },
  ]);
  const out = await procesar(msg('5491111111111', 'Hola, quiero traer 2 kg de remeras, factura USD 80'), { fetchImpl, store });
  assert.strictEqual(resultadoCotizar.precio_final_usd, 100);
  assert.strictEqual(out[0].body, 'Te queda en USD 100 final 🙌');
  assert.strictEqual(llamadas.whatsapp[0].to, '5491111111111');
});

test('DIE alto usa 70%', async () => {
  const store = crearStore(null);
  let r;
  const { fetchImpl } = mock([tool('cotizar', { kg: 1, valor_factura_usd: 100, die: 35 }), (b) => { r = JSON.parse(b.messages.at(-1).content[0].content); return txt('ok'); }]);
  await procesar(msg('5492', 'auriculares'), { fetchImpl, store });
  assert.strictEqual(r.precio_final_usd, 98); // 28 + 70
});

test('al derivar avisa a Gustavo y pausa el chat', async () => {
  const store = crearStore(null);
  const { fetchImpl, llamadas } = mock([
    tool('derivar_a_gustavo', { motivo: 'listo_para_cerrar', resumen: 'Juan · remeras 6109.10 · 2 kg · USD 80 · precio USD 100' }),
    txt('¡Genial! Gustavo te escribe enseguida para cerrar.'),
  ]);
  const out = await procesar(msg('5493', 'Dale, quiero avanzar'), { fetchImpl, store });
  assert.ok(out.some((o) => o.to === process.env.OWNER_NUMBER && o.body.includes('listo para cerrar')));
  assert.ok(store.estaPausado('5493'));
  // siguiente mensaje del cliente: el bot no responde
  const antes = llamadas.claude.length;
  await procesar(msg('5493', '¿Me pasás el CBU?'), { fetchImpl, store });
  assert.strictEqual(llamadas.claude.length, antes);
});

test('si Gustavo escribe desde la app el bot se calla, y #bot lo reactiva', async () => {
  const store = crearStore(null);
  const { fetchImpl, llamadas } = mock([txt('Hola! ¿Qué querés traer?')]);
  await procesar(eco('5494', 'Hola, soy Gustavo, te cotizo yo'), { fetchImpl, store });
  await procesar(msg('5494', 'Perfecto'), { fetchImpl, store });
  assert.strictEqual(llamadas.claude.length, 0);
  await procesar(eco('5494', '#bot'), { fetchImpl, store });
  await procesar(msg('5494', 'Otra consulta'), { fetchImpl, store });
  assert.strictEqual(llamadas.claude.length, 1);
  // el historial alterna roles correctamente
  const roles = llamadas.claude[0].messages.map((m) => m.role);
  assert.ok(roles.every((r, i) => i === 0 || r !== roles[i - 1]));
});

test('no procesa dos veces el mismo mensaje', async () => {
  const store = crearStore(null);
  const { fetchImpl, llamadas } = mock([txt('hola'), txt('hola')]);
  const m = msg('5495', 'hola', 'id-fijo');
  await procesar(m, { fetchImpl, store }); await procesar(m, { fetchImpl, store });
  assert.strictEqual(llamadas.claude.length, 1);
});
