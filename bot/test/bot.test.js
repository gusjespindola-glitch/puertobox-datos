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

test('cotiza con el modelo flete directo y responde al cliente', async () => {
  const store = crearStore(null);
  let r;
  const { fetchImpl, llamadas } = mock([
    tool('buscar_posicion', { producto: 'remeras' }),
    tool('cotizar', { kg: 10, largo_cm: 50, ancho_cm: 40, alto_cm: 30, valor_factura_usd: 500, die: 16, regimen: 'comercial' }),
    (body) => { r = JSON.parse(body.messages.at(-1).content[0].content); return txt(`Flete USD ${r.flete_puertobox_usd}`); },
  ]);
  const out = await procesar(msg('5491111111111', 'Quiero traer remeras, 10 kg, factura USD 500'), { fetchImpl, store });
  assert.strictEqual(r.kg_presupuestado, 12); // 12 kg volumétricos, sin tolerancia
  assert.strictEqual(r.flete_puertobox_usd, 240); // 12 kg x USD 20
  assert.strictEqual(r.handling_puertobox_usd, 10);
  assert.ok(r.impuestos_y_gastos_estimados_usd > 0);
  assert.strictEqual(out[0].body, 'Flete USD 240');
  assert.strictEqual(llamadas.whatsapp[0].to, '5491111111111');
});

test('régimen personal con franquicia: sin derechos hasta USD 400', async () => {
  const store = crearStore(null);
  let r;
  const { fetchImpl } = mock([tool('cotizar', { kg: 1, valor_factura_usd: 100, die: 20, regimen: 'personal' }), (b) => { r = JSON.parse(b.messages.at(-1).content[0].content); return txt('ok'); }]);
  await procesar(msg('5492', 'auriculares'), { fetchImpl, store });
  assert.strictEqual(r.flete_puertobox_usd, 45); // 1 kg -> USD 45 total
  assert.strictEqual(r.detalle_impuestos.derechos_y_tasa, 0);
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

test('YCloud: recibe el webhook, responde por la API de YCloud', async () => {
  process.env.YCLOUD_API_KEY = 'k'; process.env.BUSINESS_NUMBER = '5491122223333';
  try {
    const store = crearStore(null);
    const { fetchImpl, llamadas } = mock([txt('Hola! ¿Qué querés traer?')]);
    const evento = { id: 'evt_1', type: 'whatsapp.inbound_message.received', apiVersion: 'v2',
      whatsappInboundMessage: { id: 'x1', wamid: 'wamid.1', from: '+5491144445555', to: '+5491122223333', type: 'text', text: { body: 'hola' } } };
    const out = await procesar(evento, { fetchImpl, store });
    assert.strictEqual(out[0].to, '5491144445555');
    assert.deepStrictEqual(llamadas.whatsapp[0], { from: '+5491122223333', to: '+5491144445555', type: 'text', text: { body: 'Hola! ¿Qué querés traer?' } });
  } finally { delete process.env.YCLOUD_API_KEY; delete process.env.BUSINESS_NUMBER; }
});

test('Gustavo pausa y reactiva un chat desde su número personal', async () => {
  const store = crearStore(null);
  const { fetchImpl, llamadas } = mock([txt('hola de nuevo')]);
  await procesar(msg(process.env.OWNER_NUMBER, '#pausa 5496'), { fetchImpl, store });
  assert.ok(store.estaPausado('5496'));
  await procesar(msg('5496', 'hola'), { fetchImpl, store });
  assert.strictEqual(llamadas.claude.length, 0);
  await procesar(msg(process.env.OWNER_NUMBER, '#bot 5496'), { fetchImpl, store });
  await procesar(msg('5496', 'sigo acá'), { fetchImpl, store });
  assert.strictEqual(llamadas.claude.length, 1);
});

test('si la IA falla, avisa al cliente y a Gustavo en vez de quedar mudo', async () => {
  const store = crearStore(null);
  process.env.OWNER_NUMBER = '5499999999999';
  const enviados = [];
  const fetchImpl = async (url, opts) => {
    if (String(url).includes('anthropic')) return { ok: false, status: 500, text: async () => 'falla' };
    enviados.push(JSON.parse(opts.body)); return { ok: true, json: async () => ({}), text: async () => '' };
  };
  const out = await procesar(msg('5497', 'hola'), { fetchImpl, store });
  assert.ok(out.some((o) => o.to === '5497' && /Gustavo/.test(o.body)));
  assert.ok(out.some((o) => o.to === '5499999999999'));
  delete process.env.OWNER_NUMBER;
});
