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
