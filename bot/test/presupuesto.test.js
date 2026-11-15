'use strict';
// 15/11 Gustavo: el presupuesto formal se arma solo cuando el cliente confirma; lo manda él con un botón.
const test = require('node:test');
const assert = require('node:assert');
const { ejecutar } = require('../tools');
const { crearStore } = require('../store');
const { armarDatos, pdf } = require('../../src/presupuesto_pdf');

test('presupuesto formal: se arma solo al confirmar, con número correlativo, y da un PDF', async () => {
  const store = crearStore(null);
  const ctx = { store, telefono: '5491100000000', derivaciones: [] };
  store.guardarLead(ctx.telefono, { nombre: 'Juan', producto: 'remeras de algodón' });
  await ejecutar('cotizar', { kg: 10, largo_cm: 50, ancho_cm: 40, alto_cm: 30, valor_factura_usd: 500, die: 16, regimen: 'comercial', unidades: 50 }, ctx);
  assert.ok(store.lead(ctx.telefono).cotizacion.r.total_puertobox_usd > 0);
  // Una duda no genera presupuesto
  await ejecutar('derivar_a_gustavo', { motivo: 'duda', resumen: 'x' }, ctx);
  assert.strictEqual(store.presupuestoDe(ctx.telefono), null);
  await ejecutar('derivar_a_gustavo', { motivo: 'listo_para_cerrar', resumen: 'Juan cierra' }, ctx);
  const p = store.presupuestoDe(ctx.telefono);
  assert.match(p.nro, /^0001-00000001$/);
  assert.strictEqual(ctx.derivaciones.at(-1).presupuesto, p.nro);
  assert.match(p.token, /^[0-9a-f]{32}$/);
  // Volver a confirmar con la misma cotización no crea otro
  assert.strictEqual(store.crearPresupuesto(ctx.telefono).nro, p.nro);
  const D = armarDatos({ nro: p.nro, lead: store.lead(ctx.telefono), cliente: { nombre: 'Juan Pérez' } });
  assert.strictEqual(D.total, store.lead(ctx.telefono).cotizacion.r.total_puertobox_usd);
  assert.strictEqual(D.mercaderia.desc, 'remeras de algodón');
  const buf = await pdf(D);
  assert.strictEqual(buf.slice(0, 5).toString(), '%PDF-');
});

test('presupuesto formal: sin cotización no se arma', () => {
  const store = crearStore(null);
  store.guardarLead('5492', { nombre: 'Ana' });
  assert.strictEqual(store.crearPresupuesto('5492'), null);
});

test('charlas: botón al cotizador con los datos del cliente cargados (también en charlas viejas sin cotización)', () => {
  const { paginaCharlas } = require('../recordatorios');
  const store = crearStore(null);
  store.agregar('5492364652566', 'user', 'hola');
  store.guardarLead('5492364652566', { nombre: 'Cliente Nusse', producto: 'Mats y bolsos', posicion: '9506.91.00' });
  const h = paginaCharlas(store, 'x', Date.now(), 3, () => '/r', null, '', () => '?t', '/nomenclador/?t=abc');
  assert.match(h, /Armar presupuesto en el cotizador/);
  assert.match(h, /#cot&pos=9506.91.00/);
  assert.match(h, /prod=Mats\+y\+bolsos/);
});
