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
  const out = await procesar(msg('5491111111111', 'Quiero traer remeras, 10 kg, factura USD 500'), { fetchImpl, store, debounceMs: 0 });
  assert.strictEqual(r.kg_presupuestado, 12); // 12 kg volumétricos (sin margen, opción C)
  assert.strictEqual(r.flete_puertobox_usd, 240); // 12 kg x USD 20
  assert.strictEqual(r.handling_puertobox_usd, 20);
  assert.ok(r.impuestos_y_gastos_estimados_usd > 0);
  assert.strictEqual(out[0].body, 'Flete USD 240');
  assert.strictEqual(llamadas.whatsapp[0].to, '5491111111111');
});

test('régimen personal con franquicia: sin derechos hasta USD 400', async () => {
  const store = crearStore(null);
  let r;
  const { fetchImpl } = mock([tool('cotizar', { kg: 1, valor_factura_usd: 100, die: 20, regimen: 'personal' }), (b) => { r = JSON.parse(b.messages.at(-1).content[0].content); return txt('ok'); }]);
  await procesar(msg('5492', 'auriculares'), { fetchImpl, store, debounceMs: 0 });
  assert.strictEqual(r.flete_puertobox_usd, 45); // 1 kg -> USD 45 total
  assert.strictEqual(r.detalle_impuestos.derechos_y_tasa, 0);
});

test('al derivar avisa a Gustavo y pausa el chat', async () => {
  const store = crearStore(null);
  const { fetchImpl, llamadas } = mock([
    tool('derivar_a_gustavo', { motivo: 'listo_para_cerrar', quiere: 'Pagar el envío de remeras', para_vos: 'Pasarle los datos para pagar', resumen: 'Juan · remeras 6109.10 · 2 kg · USD 80 · precio USD 100' }),
    txt('¡Genial! Gustavo te escribe enseguida para cerrar.'),
  ]);
  const out = await procesar(msg('5493', 'Dale, quiero avanzar'), { fetchImpl, store, debounceMs: 0 });
  // 15/11: aviso corto, lo que quiere y lo que tiene que hacer Gustavo arriba.
  const aviso = out.find((o) => o.to === process.env.OWNER_NUMBER);
  assert.match(aviso.body, /^👤 \+5493/);
  assert.match(aviso.body, /\nQuiere: Pagar el envío de remeras\nVos: Pasarle los datos para pagar/);
  assert.ok(store.estaPausado('5493'));
  // siguiente mensaje del cliente: el bot no responde
  const antes = llamadas.claude.length;
  await procesar(msg('5493', '¿Me pasás el CBU?'), { fetchImpl, store, debounceMs: 0 });
  assert.strictEqual(llamadas.claude.length, antes);
});

test('si Gustavo escribe desde la app el bot se calla, y #bot lo reactiva', async () => {
  const store = crearStore(null);
  const { fetchImpl, llamadas } = mock([txt('Hola! ¿Qué querés traer?')]);
  await procesar(eco('5494', 'Hola, soy Gustavo, te cotizo yo'), { fetchImpl, store, debounceMs: 0 });
  await procesar(msg('5494', 'Perfecto'), { fetchImpl, store, debounceMs: 0 });
  assert.strictEqual(llamadas.claude.length, 0);
  await procesar(eco('5494', '#bot'), { fetchImpl, store, debounceMs: 0 });
  await procesar(msg('5494', 'Otra consulta'), { fetchImpl, store, debounceMs: 0 });
  assert.strictEqual(llamadas.claude.length, 1);
  // el historial alterna roles correctamente
  const roles = llamadas.claude[0].messages.map((m) => m.role);
  assert.ok(roles.every((r, i) => i === 0 || r !== roles[i - 1]));
});

test('no procesa dos veces el mismo mensaje', async () => {
  const store = crearStore(null);
  const { fetchImpl, llamadas } = mock([txt('hola'), txt('hola')]);
  const m = msg('5495', 'hola', 'id-fijo');
  await procesar(m, { fetchImpl, store, debounceMs: 0 }); await procesar(m, { fetchImpl, store, debounceMs: 0 });
  assert.strictEqual(llamadas.claude.length, 1);
});

test('YCloud: recibe el webhook, responde por la API de YCloud', async () => {
  process.env.YCLOUD_API_KEY = 'k'; process.env.BUSINESS_NUMBER = '5491122223333';
  try {
    const store = crearStore(null);
    const { fetchImpl, llamadas } = mock([txt('Hola! ¿Qué querés traer?')]);
    const evento = { id: 'evt_1', type: 'whatsapp.inbound_message.received', apiVersion: 'v2',
      whatsappInboundMessage: { id: 'x1', wamid: 'wamid.1', from: '+5491144445555', to: '+5491122223333', type: 'text', text: { body: 'hola' } } };
    const out = await procesar(evento, { fetchImpl, store, debounceMs: 0 });
    assert.strictEqual(out[0].to, '5491144445555');
    assert.deepStrictEqual(llamadas.whatsapp[0], { from: '+5491122223333', to: '+5491144445555', type: 'text', text: { body: 'Hola! ¿Qué querés traer?' } });
  } finally { delete process.env.YCLOUD_API_KEY; delete process.env.BUSINESS_NUMBER; }
});

test('Gustavo pausa y reactiva un chat desde su número personal', async () => {
  const store = crearStore(null);
  const { fetchImpl, llamadas } = mock([txt('hola de nuevo')]);
  await procesar(msg(process.env.OWNER_NUMBER, '#pausa 5496'), { fetchImpl, store, debounceMs: 0 });
  assert.ok(store.estaPausado('5496'));
  await procesar(msg('5496', 'hola'), { fetchImpl, store, debounceMs: 0 });
  assert.strictEqual(llamadas.claude.length, 0);
  await procesar(msg(process.env.OWNER_NUMBER, '#bot 5496'), { fetchImpl, store, debounceMs: 0 });
  await procesar(msg('5496', 'sigo acá'), { fetchImpl, store, debounceMs: 0 });
  assert.strictEqual(llamadas.claude.length, 1);
});

test('si la IA falla, reintenta y si no puede pide repetir, sin avisar a Gustavo ni pausar', async () => {
  const store = crearStore(null);
  process.env.OWNER_NUMBER = '5499999999999'; process.env.NODE_ENV = 'test';
  let llamadas = 0;
  const fetchImpl = async (url, opts) => {
    if (String(url).includes('anthropic')) { llamadas++; return { ok: false, status: 529, text: async () => 'overloaded' }; }
    return { ok: true, json: async () => ({}), text: async () => '' };
  };
  const out = await procesar(msg('5497', 'hola'), { fetchImpl, store, debounceMs: 0 });
  assert.strictEqual(llamadas, 3);
  assert.ok(out.some((o) => o.to === '5497' && /repet/.test(o.body)));
  assert.ok(!out.some((o) => o.to === '5499999999999'));
  assert.ok(!store.estaPausado('5497'));
  delete process.env.OWNER_NUMBER;
});

test('agrupa mensajes seguidos del cliente y responde una sola vez', async () => {
  const store = crearStore(null);
  let vistos = null;
  const { fetchImpl, llamadas } = mock([(body) => { vistos = body.messages.at(-1).content; return txt('ok'); }]);
  await procesar(msg('5498', 'quiero traer'), { fetchImpl, store, debounceMs: 30 });
  await procesar(msg('5498', 'zapatillas'), { fetchImpl, store, debounceMs: 30 });
  await new Promise((r) => setTimeout(r, 120));
  assert.strictEqual(llamadas.claude.length, 1);
  assert.strictEqual(vistos, 'quiero traer\nzapatillas');
  assert.strictEqual(llamadas.whatsapp.length, 1);
});

test('#borrar desde el número de Gustavo limpia su conversación', async () => {
  const store = crearStore(null);
  store.agregar('5491100000000', 'user', 'zapatillas 20 kg');
  const { fetchImpl } = mock([]);
  const out = await procesar(msg('5491100000000', '#borrar'), { fetchImpl, store, debounceMs: 0 });
  assert.strictEqual(store.historial('5491100000000').length, 0);
  assert.ok(/borré/.test(out[0].body));
});

test('el nomenclador pide clave y la recuerda con cookie', async () => {
  process.env.ADMIN_KEY = 'clave123';
  const { servidor } = require('../server');
  const srv = servidor().listen(0); await new Promise((r) => srv.once('listening', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  try {
    const sin = await fetch(base + '/nomenclador/'); await sin.text();
    assert.strictEqual(sin.status, 401);
    const con = await fetch(base + '/nomenclador/?key=clave123'); await con.text();
    assert.strictEqual(con.status, 200);
    const cookie = con.headers.get('set-cookie').split(';')[0];
    const data = await fetch(base + '/nomenclador/data/intervenciones.json', { headers: { cookie } });
    assert.strictEqual(data.status, 200); await data.text();
    const fuera = await fetch(base + '/nomenclador/%2e%2e/%2e%2e/package.json', { headers: { cookie } });
    assert.ok(!(await fuera.text()).includes('"scripts"'));
  } finally { srv.closeAllConnections(); srv.close(); delete process.env.ADMIN_KEY; }
});

test('si la IA termina sin texto, igual le responde al cliente', async () => {
  const store = crearStore(null);
  const { fetchImpl, llamadas } = mock([{ stop_reason: 'end_turn', content: [] }, txt('¿Qué querés traer?')]);
  const out = await procesar(msg('5480', 'hola?'), { fetchImpl, store, debounceMs: 0 });
  assert.strictEqual(out[0].body, '¿Qué querés traer?');
  assert.strictEqual(llamadas.claude.length, 2);
});

test('derivar por duda no pausa el bot', async () => {
  const store = crearStore(null);
  const { fetchImpl } = mock([tool('derivar_a_gustavo', { motivo: 'duda', resumen: 'termo para revender' }), txt('Eso lo confirma Gustavo. ¿Cuántas cajas son?')]);
  await procesar(msg('5481', 'termos para vender'), { fetchImpl, store, debounceMs: 0 });
  assert.ok(!store.estaPausado('5481'));
});

test('chat derivado: si el cliente escribe, recibe aviso de espera (no visto)', async () => {
  const store = crearStore(null);
  store.pausar('5482', 'derivado');
  const { fetchImpl } = mock([]);
  const out = await procesar(msg('5482', '¿y?'), { fetchImpl, store, debounceMs: 0 });
  assert.ok(/nuestro despachante/.test(out[0].body) && !/Gustavo/.test(out[0].body));
  const out2 = await procesar(msg('5482', 'hola??'), { fetchImpl, store, debounceMs: 0 });
  assert.strictEqual(out2.length, 0);
});

test('dos herramientas a la vez: responde todas y sigue sin error', async () => {
  const store = crearStore(null);
  const dos = { stop_reason: 'tool_use', content: [{ type: 'text', text: 'Busco' }, { type: 'tool_use', id: 'a1', name: 'buscar_posicion', input: { producto: 'remeras' } }, { type: 'tool_use', id: 'a2', name: 'registrar_lead', input: { producto: 'remeras' } }] };
  let segunda;
  const { fetchImpl } = mock([dos, (body) => { segunda = body.messages; return txt('¿Es para vos o para vender?'); }]);
  const out = await procesar(msg('5490', 'remeras'), { fetchImpl, store, debounceMs: 0 });
  const res = segunda[segunda.length - 1].content;
  assert.deepStrictEqual(res.map((r) => r.tool_use_id), ['a1', 'a2']);
  assert.strictEqual(out[0].body, '¿Es para vos o para vender?');
});

test('herramienta pedida con stop_reason distinto igual se responde', async () => {
  const store = crearStore(null);
  const raro = { stop_reason: 'max_tokens', content: [{ type: 'tool_use', id: 'b1', name: 'registrar_lead', input: {} }] };
  const { fetchImpl } = mock([raro, txt('Listo')]);
  const out = await procesar(msg('5491', 'hola'), { fetchImpl, store, debounceMs: 0 });
  assert.strictEqual(out[0].body, 'Listo');
});

test('saca muletillas del arranque', () => {
  const { limpiar } = require('../agent');
  assert.strictEqual(limpiar('Perfecto, sin marca. ¿Cuánto pagás?'), 'Sin marca. ¿Cuánto pagás?');
  assert.strictEqual(limpiar('¡Buenísimo! ¿Son para vos?'), '¿Son para vos?');
  assert.strictEqual(limpiar('Joya, 600 USD. ¿Sabés cuánto pesa?'), '600 USD. ¿Sabés cuánto pesa?');
  assert.strictEqual(limpiar('Dale'), 'Dale');
  assert.strictEqual(limpiar('Joya. ¿sabés cuánto pesa?'), '¿Sabés cuánto pesa?');
});

test('Instagram: responde por Instagram, ignora su propio eco y se pausa si responde Gustavo', async () => {
  const { procesar: proc } = require('../server');
  const { crearStore } = require('../store');
  const st = crearStore(null);
  process.env.IG_TOKEN = 'tok';
  const llamadas = [];
  const fetchImpl = async (url, opt) => {
    llamadas.push({ url, body: opt && opt.body });
    if (String(url).includes('anthropic')) return { ok: true, json: async () => ({ content: [{ type: 'text', text: 'Hola, gracias por escribir a PuertoBox. ¿Qué producto querés traer?' }], stop_reason: 'end_turn' }) };
    return { ok: true, json: async () => ({ message_id: 'mid.bot1' }), text: async () => '' };
  };
  const ig = (m) => ({ object: 'instagram', entry: [{ id: 'pb', messaging: [m] }] });
  process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || 'x';
  await proc(ig({ sender: { id: '777' }, recipient: { id: 'pb' }, message: { mid: 'm1', text: 'Hola' } }), { fetchImpl, store: st, debounceMs: 0 });
  const envio = llamadas.find((l) => String(l.url).includes('graph.instagram.com'));
  assert.ok(envio, 'mandó por Instagram');
  assert.strictEqual(JSON.parse(envio.body).recipient.id, '777');
  // eco del propio bot: no pausa
  await proc(ig({ sender: { id: 'pb' }, recipient: { id: '777' }, message: { mid: 'mid.bot1', text: 'x', is_echo: true } }), { fetchImpl, store: st, debounceMs: 0 });
  assert.strictEqual(st.estaPausado('ig:777'), false);
  // Gustavo responde desde la app: pausa
  await proc(ig({ sender: { id: 'pb' }, recipient: { id: '777' }, message: { mid: 'm2', text: 'Hola, soy Gustavo', is_echo: true } }), { fetchImpl, store: st, debounceMs: 0 });
  assert.strictEqual(st.estaPausado('ig:777'), true);
});

test('sin saldo en Anthropic: el cliente recibe espera y Gustavo un aviso', async () => {
  const { procesar: proc } = require('../server');
  const { crearStore } = require('../store');
  const st = crearStore(null);
  const enviados = [];
  const fetchImpl = async (url, opt) => {
    if (String(url).includes('anthropic')) return { ok: false, status: 400, text: async () => '{"error":{"message":"Your credit balance is too low to access the Anthropic API."}}' };
    if (opt && opt.body) enviados.push(String(opt.body));
    return { ok: true, json: async () => ({}), text: async () => '' };
  };
  await proc(msg('5499', 'hola'), { fetchImpl, store: st, debounceMs: 0 });
  assert.ok(enviados.some((b) => b.includes('te va a responder nuestro despachante')), 'mensaje de espera al cliente');
  assert.ok(enviados.some((b) => b.includes('SIN SALDO')), 'aviso a Gustavo');
});

// 15/11: charla real del arrancador. 10 unidades de 0,9 kg recotizadas como 23 kg inflaron el costo por unidad.
test('cotizar: si unidades y peso no cierran, no cotiza y pide las unidades nuevas', async () => {
  const store = crearStore(null);
  let r;
  const { fetchImpl } = mock([
    tool('cotizar', { kg: 23, valor_factura_usd: 200, die: 20, regimen: 'comercial', unidades: 10, kg_por_unidad: 0.9 }),
    (b) => { r = JSON.parse(b.messages.at(-1).content[0].content); return txt('¿Cuántas unidades serían con esos 23 kg?'); },
  ]);
  await procesar(msg('5493', 'serian 23 kg'), { fetchImpl, store, debounceMs: 0 });
  assert.ok(r.error && /unidades/.test(r.error));
  assert.strictEqual(r.costo_por_unidad_usd, undefined);
});

test('cotizar: devuelve el kilo con la gestión incluida (para comparar con la publicidad)', async () => {
  const store = crearStore(null);
  let r;
  const { fetchImpl } = mock([
    tool('cotizar', { kg: 23, valor_factura_usd: 500, die: 20, regimen: 'comercial', unidades: 25, kg_por_unidad: 0.9 }),
    (b) => { r = JSON.parse(b.messages.at(-1).content[0].content); return txt('ok'); },
  ]);
  await procesar(msg('5494', 'cotizame'), { fetchImpl, store, debounceMs: 0 });
  assert.strictEqual(r.total_puertobox_usd, 434); // 23 kg x USD 18 + USD 20
  assert.strictEqual(r.usd_por_kilo_con_gestion, 18.87);
  assert.strictEqual(r.unidades, 25);
});

test('simulador: incluye los casos de la charla del arrancador', () => {
  const { ESCENARIOS, revisar } = require('../simulador');
  const nombres = ESCENARIOS.map((e) => e.nombre);
  for (const n of ['Cambia el peso: preguntar unidades nuevas', 'Compara con el precio de la publicidad', 'Confunde costo por unidad con el kilo', 'Se enoja y pide una persona']) assert.ok(nombres.includes(n), n);
  assert.ok(revisar('El dato de USD 16 por kilo no es nuestro precio, así que no puedo cotizarlo.', { ultimo: 'x' }).some((p) => /publicidad/.test(p)));
});

test('prompt: reglas de cambio de peso, precio por kilo y cliente molesto', () => {
  const p = require('fs').readFileSync(require('path').join(__dirname, '..', 'prompt.md'), 'utf8');
  assert.match(p, /no reuses las unidades ni el valor viejos/);
  assert.match(p, /usd_por_kilo_con_gestion/);
  assert.match(p, /No vuelvas a hacer la pregunta pendiente/);
  assert.match(p, /no del kilo/);
});

test('simulador: detecta frases de robot (15/11)', () => {
  const { revisar, ESCENARIOS } = require('../simulador');
  assert.ok(revisar('Por el dato. ¿Cuánto pesa?', { ultimo: 'x' }).some((p) => /cortada/.test(p)));
  assert.ok(revisar('Te escribe a la brevedad.', { ultimo: 'x' }).some((p) => /plantilla/.test(p)));
  assert.deepStrictEqual(revisar('¿Tiene alguna marca o logo?', { ultimo: 'x' }), []);
  for (const n of ['Pide más información (anuncio)', 'Pregunta aéreo o marítimo', 'Dice que no']) assert.ok(ESCENARIOS.some((e) => e.nombre === n), n);
});

test('prompt: tono humano, sin frases cortadas ni pregunta repetida', () => {
  const p = require('fs').readFileSync(require('path').join(__dirname, '..', 'prompt.md'), 'utf8');
  assert.match(p, /Prohibido empezar con "Entendido", "Entiendo", "Comprendido", "Correcto"/);
  assert.match(p, /Repetir la misma pregunta o la misma frase/);
  assert.match(p, /Contestá primero exactamente lo que te preguntaron/);
  assert.match(p, /asesor comercial de una empresa argentina/);
});

test('decisiones de Gustavo 15/11: régimen por unidades, CUIT, litio y 50 kg por bulto', () => {
  const { render } = require('../../src/negocio');
  const p = render(require('fs').readFileSync(require('path').join(__dirname, '..', 'prompt.md'), 'utf8'));
  assert.doesNotMatch(p, /¿Es para vos o para vender\?"/);
  assert.match(p, /nunca preguntes si es para vos o para vender/);
  assert.match(p, /la importación la hace la empresa de transporte/);
  assert.match(p, /con el CUIT de PuertoBox/);
  assert.match(p, /MSDS\)\*\* y el \*\*informe de ensayo UN38\.3/);
  assert.match(p, /El máximo por bulto es 50 kg/);
  assert.match(p, /Marca reconocida \*\*hasta 3 unidades iguales\*\*: sí podés cotizar/);
  const faq = require('../../src/negocio').datos().faq_texto;
  assert.match(faq, /lo traemos con el CUIT de PuertoBox/);
  assert.doesNotMatch(faq, /figur/);
});

test('cotizar sin cantidad de cajas: no cobra recargo por caja pesada ni pide dividir (auditoría de charlas 15/11)', async () => {
  const { ejecutar } = require('../tools');
  for (const kg of [30, 90]) {
    const r = await ejecutar('cotizar', { kg, valor_factura_usd: 220, die: 16, regimen: 'comercial' }, { store: crearStore(null), telefono: 'x', derivaciones: [] });
    assert.ok(!r.recargo_cajas_usd, `${kg} kg: no debería cobrar recargo`);
    assert.ok(!/más de 50 kg|dividir/.test(r.aviso || ''), `${kg} kg: no debería pedir dividir`);
    assert.strictEqual(r.flete_firme, false);
  }
  const conCajas = await ejecutar('cotizar', { kg: 30, cantidad_cajas: 1, valor_factura_usd: 220, die: 16, regimen: 'comercial' }, { store: crearStore(null), telefono: 'x', derivaciones: [] });
  assert.ok(conCajas.recargo_cajas_usd > 0);
});
