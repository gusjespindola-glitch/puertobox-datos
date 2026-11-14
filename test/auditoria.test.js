'use strict';
// Arreglos de la auditoría del 14/11/2026 (docs/auditoria/2026-11-14-completa.md).
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const { fleteVenta, fleteCosto } = require('../src/flete_directo');
const { ejecutar } = require('../bot/tools');
const { firmaYCloudOk, servidor } = require('../bot/server');
const { crearStore } = require('../bot/store');
const paginas = require('../src/paginas');
const negocio = require('../src/negocio');

test('flete: pesar más nunca cuesta menos (sin saltos de tramo)', () => {
  let prev = 0;
  for (let kg = 1; kg <= 60; kg += 0.5) {
    const v = fleteVenta(kg);
    assert.ok(v >= prev, `${kg} kg (USD ${v}) sale más barato que ${kg - 0.5} kg (USD ${prev})`);
    prev = v;
  }
  assert.strictEqual(fleteVenta(9.5), fleteVenta(10));
});

test('flete: nunca se pierde, ni con la caja 15% más pesada', () => {
  for (let kg = 1; kg <= 60; kg += 0.5) {
    const peor = Math.ceil(kg * 1.15 * 2) / 2;
    assert.ok(fleteVenta(kg) + 20 - fleteCosto(peor) > 0, `${kg} kg pierde plata`);
  }
});

test('cotizar: frena datos imposibles y pedidos sobre el tope', () => {
  const ctx = { store: crearStore(null), telefono: '1', derivaciones: [] };
  assert.ok(ejecutar('cotizar', { kg: 0, valor_factura_usd: 100, die: 20, regimen: 'comercial' }, ctx).error);
  assert.ok(ejecutar('cotizar', { kg: 5, valor_factura_usd: 0, die: 20, regimen: 'comercial' }, ctx).error);
  const grande = ejecutar('cotizar', { kg: 50, valor_factura_usd: 8000, die: 20, regimen: 'comercial' }, ctx);
  assert.ok(grande.aviso && !grande.flete_puertobox_usd);
});

test('cotizar: el flete es firme solo con medidas y cajas de hasta 23 kg', () => {
  const ctx = { store: crearStore(null), telefono: '1', derivaciones: [] };
  const base = { valor_factura_usd: 300, die: 20, regimen: 'comercial' };
  assert.strictEqual(ejecutar('cotizar', { ...base, kg: 5, largo_cm: 40, ancho_cm: 30, alto_cm: 30 }, ctx).flete_firme, true);
  const sinMedidas = ejecutar('cotizar', { ...base, kg: 5 }, ctx);
  assert.strictEqual(sinMedidas.flete_firme, false);
  assert.match(sinMedidas.aviso, /medidas/);
  const pesada = ejecutar('cotizar', { ...base, kg: 30, largo_cm: 50, ancho_cm: 40, alto_cm: 50 }, ctx);
  assert.strictEqual(pesada.flete_firme, false);
  assert.match(pesada.aviso, /recargo/);
});

test('cotizar: uso propio sin envíos con beneficio paga derechos', () => {
  const ctx = { store: crearStore(null), telefono: '1', derivaciones: [] };
  const base = { kg: 2, valor_factura_usd: 80, die: 20, regimen: 'personal' };
  const con = ejecutar('cotizar', base, ctx).detalle_impuestos.derechos_y_tasa;
  const sin = ejecutar('cotizar', { ...base, sin_franquicia: true }, ctx).detalle_impuestos.derechos_y_tasa;
  assert.strictEqual(con, 0);
  assert.ok(sin > 0);
});

test('webhook: firma de YCloud', () => {
  const secreto = 'whsec_prueba';
  const cuerpo = '{"type":"x"}';
  const t = Math.floor(Date.now() / 1000);
  const s = crypto.createHmac('sha256', secreto).update(`${t}.${cuerpo}`).digest('hex');
  assert.ok(firmaYCloudOk(`t=${t},s=${s}`, cuerpo, secreto));
  assert.ok(!firmaYCloudOk(`t=${t},s=${s}`, cuerpo + ' ', secreto), 'cuerpo cambiado');
  assert.ok(!firmaYCloudOk(undefined, cuerpo, secreto), 'sin firma');
  assert.ok(!firmaYCloudOk(`t=${t - 3600},s=${crypto.createHmac('sha256', secreto).update(`${t - 3600}.${cuerpo}`).digest('hex')}`, cuerpo, secreto), 'firma vieja');
  assert.ok(firmaYCloudOk(undefined, cuerpo, undefined), 'sin secreto configurado acepta (como antes)');
});

test('webhook: un cuerpo que no es JSON no tira el servidor', async () => {
  const srv = servidor().listen(0);
  await new Promise((r) => srv.once('listening', r));
  const url = `http://127.0.0.1:${srv.address().port}`;
  const r = await fetch(`${url}/webhook`, { method: 'POST', body: 'esto no es json' });
  assert.strictEqual(r.status, 200);
  const sigue = await fetch(`${url}/salud`);
  assert.strictEqual(sigue.status, 200);
  srv.close();
});

test('web: WhatsApp con link real y vista previa para compartir', () => {
  const h = paginas.home();
  const d = negocio.datos();
  assert.ok(!/href="#" data-wa/.test(h), 'quedó un botón de WhatsApp con href="#"');
  assert.ok(h.includes(`href="${d.wa_link}"`));
  assert.ok(h.includes('og:title') && h.includes('rel="canonical"'));
  assert.ok(!/id="cnt1">0</.test(h), 'el número de la portada arranca en 0');
  assert.ok(h.includes(`id="cnt1">${d.usd_kg_total_desde}<`), 'la portada muestra el kilo con la gestión incluida, igual que el bot');
});

test('textos: el depósito de China no es "nuestro" y en Argentina no hay depósito', () => {
  const fs = require('fs');
  for (const f of ['bot/prompt.md', 'web/sitio/index.html']) {
    const t = fs.readFileSync(require('path').join(__dirname, '..', f), 'utf8');
    assert.ok(!/nuestro depósito|depósito de PuertoBox|sin depósito físico/i.test(t), f);
  }
});

test('envío dentro de China: lo paga el cliente y lo dicen el bot, la web y la herramienta', () => {
  const fs = require('fs'); const path = require('path');
  const prompt = negocio.render(fs.readFileSync(path.join(__dirname, '..', 'bot', 'prompt.md'), 'utf8'));
  assert.match(prompt, /fábrica al depósito en Shenzhen lo paga el cliente/);
  assert.match(prompt, /include the delivery to my forwarder's warehouse in Shenzhen/);
  assert.match(paginas.home(), /Ese envío dentro de China lo pagás vos/);
  assert.match(paginas.home(), /Quién paga el envío de la fábrica/);
  const ctx = { store: crearStore(null), telefono: '1', derivaciones: [] };
  assert.match(ejecutar('cotizar', { kg: 5, valor_factura_usd: 300, die: 20, regimen: 'comercial' }, ctx).reglas, /Shenzhen NO está incluido/);
});

test('presupuesto: lo de PuertoBox separado de los impuestos del courier (sin total mezclado)', () => {
  const fs = require('fs'); const path = require('path');
  const ctx = { store: crearStore(null), telefono: '1', derivaciones: [] };
  const r = ejecutar('cotizar', { kg: 5, valor_factura_usd: 300, die: 20, regimen: 'comercial', largo_cm: 40, ancho_cm: 30, alto_cm: 30 }, ctx);
  assert.strictEqual(r.total_puertobox_usd, r.flete_puertobox_usd + r.handling_puertobox_usd);
  assert.strictEqual(r.total_estimado_usd, undefined);
  const prompt = negocio.render(fs.readFileSync(path.join(__dirname, '..', 'bot', 'prompt.md'), 'utf8'));
  assert.match(prompt, /\*Total a PuertoBox: USD \[total_puertobox\]\*/);
  assert.match(prompt, /no se paga a PuertoBox/);
  assert.ok(!/Total estimado: USD/.test(prompt));
});

test('impuestos: el estimado reproduce la factura real de UPS (flete declarado, no el de venta)', () => {
  const { presupuesto } = require('../src/flete_directo');
  const f = require('../data/facturas_reales.json').facturas.find((x) => x.id === 'ups-2026-01');
  const real = f.usd.derechos + f.usd.tasa_estadistica + f.usd.iva_importacion + f.usd.gasto_documental + f.usd.iva_gasto_documental;
  const bot = presupuesto({ kg: f.kg, valorFactura: f.usd.fob, die: 16.1, regimen: 'comercial' }).impuestos_estimados_usd.total;
  assert.ok(bot >= real, `el estimado (${bot}) no puede quedar por debajo de lo real (${real})`);
  assert.ok(bot <= real * 1.05, `el estimado (${bot}) se pasa más de 5% de lo real (${real})`);
});

test('cotizar deja el lead como cotizado (para el seguimiento)', () => {
  const st = crearStore(null);
  const ctx = { store: st, telefono: '5491100000007', derivaciones: [] };
  ejecutar('cotizar', { kg: 5, valor_factura_usd: 300, die: 20, regimen: 'comercial' }, ctx);
  assert.strictEqual(st.lead('5491100000007').estado, 'cotizado');
  st.guardarLead('5491100000007', { estado: 'listo_para_cerrar' });
  ejecutar('cotizar', { kg: 6, valor_factura_usd: 300, die: 20, regimen: 'comercial' }, ctx);
  assert.strictEqual(st.lead('5491100000007').estado, 'listo_para_cerrar', 'no lo baja de estado');
});

test('tope diario: un chat que manda mensajes sin parar se pausa y avisa una vez', async () => {
  process.env.TOPE_MENSAJES_DIA = '3';
  delete require.cache[require.resolve('../bot/server')];
  const { procesar } = require('../bot/server');
  const st = crearStore(null);
  for (let i = 0; i < 3; i++) st.contarRespuesta('5491100000008');
  const salidas = await procesar({ type: 'whatsapp.inbound_message.received', whatsappInboundMessage: { id: 'spam4', from: '+5491100000008', type: 'text', text: { body: 'hola' } } }, { store: st, debounceMs: 0, fetchImpl: async () => ({ ok: true, json: async () => ({}), text: async () => '' }) });
  assert.ok(st.estaPausado('5491100000008'));
  assert.match(salidas[0].body, /más de 3 mensajes/);
  delete process.env.TOPE_MENSAJES_DIA;
});

test('instagram: sin IG_APP_SECRET no procesa nada (no se puede gastar el saldo con mensajes falsos)', async () => {
  delete process.env.IG_APP_SECRET;
  const { servidor } = require('../bot/server');
  const s = servidor().listen(0); await new Promise((r) => s.once('listening', r));
  const r = await fetch(`http://127.0.0.1:${s.address().port}/instagram`, { method: 'POST', body: '{"object":"instagram","entry":[]}' });
  assert.strictEqual(r.status, 503);
  s.close();
});
