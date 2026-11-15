'use strict';
// 15/11 Gustavo: certeza de la posición antes de mandar presupuestos solos.
const test = require('node:test');
const assert = require('node:assert');
const { ejecutar } = require('../tools');
const { crearStore } = require('../store');
const certeza = require('../certeza');
const { clave } = require('../clasificador');

function preparar() {
  const store = crearStore(null);
  const tel = '5491100000001';
  const ctx = { store, telefono: tel, derivaciones: [] };
  const fija = { posicion: '8504.40.90.900R', die: 0, confianza: 'media', producto: 'arrancador de batería para auto 12V con litio', nombre_tecnico: 'convertidor' };
  store.guardarLead(tel, { producto: fija.producto, posicion_fija: fija });
  ejecutar('cotizar', { kg: 10, valor_factura_usd: 500, cantidad_cajas: 1, regimen: 'comercial', unidades: 10 , largo_cm: 10, ancho_cm: 10, alto_cm: 10 }, ctx);
  return { store, tel, ctx };
}

test('validar: acepta la posición completa o los 8 dígitos si el derecho es único; rechaza lo que no existe', () => {
  assert.ok(certeza.validar('8507.60.00.110A').fila);
  assert.ok(certeza.validar('6109.10.00').fila);
  assert.match(certeza.validar('8507.60.00').error, /distinto derecho/);
  assert.match(certeza.validar('9999.99.99').error, /no existe/);
  assert.match(certeza.validar('85').error, /completa/);
});

test('corregir la posición: recalcula con el derecho nuevo, el bot la aprende y el marcador cuenta el error', () => {
  const { store, tel } = preparar();
  const antes = store.lead(tel).cotizacion.r.impuestos_y_gastos_estimados_usd;
  const r = certeza.aplicar(store, tel, '8507.60.00.110A', ejecutar);
  assert.strictEqual(r.cambio, true);
  const lead = store.lead(tel);
  assert.strictEqual(lead.posicion_fija.posicion, '8507.60.00.110A');
  assert.strictEqual(lead.posicion_fija.die, 18);
  assert.strictEqual(lead.posicion_fija.bot_propuso, '8504.40.90.900R');
  assert.ok(lead.cotizacion.r.impuestos_y_gastos_estimados_usd > antes, 'con 18% de derecho los impuestos suben');
  assert.strictEqual(lead.cotizacion.r.posicion, '8507.60.00.110A');
  // Aprendió: el caché del producto tiene la posición de Gustavo, sin la marca de error.
  const cache = store.cacheClasificacion()[clave(lead.posicion_fija.producto)];
  assert.strictEqual(cache.posicion, '8507.60.00.110A');
  assert.strictEqual(cache.confirmada, true);
  assert.strictEqual(cache.bot_propuso, undefined);
  const fila = certeza.registrar(store, tel, 'tok1');
  assert.strictEqual(fila.ok, false);
  assert.strictEqual(certeza.registrar(store, tel, 'tok1'), null, 'una vez por presupuesto');
  assert.deepStrictEqual([certeza.marcador(store).bien, certeza.marcador(store).total], [0, 1]);
});

test('dejarla como está: no cambia nada y cuenta como acierto; 20 seguidas habilitan el automático', () => {
  const { store, tel } = preparar();
  assert.strictEqual(certeza.aplicar(store, tel, '8504.40.90.900R', ejecutar).cambio, false);
  assert.strictEqual(certeza.aplicar(store, tel, '8504.40.90', ejecutar).cambio, false);
  assert.strictEqual(certeza.aplicar(store, tel, '', ejecutar).cambio, false);
  for (let i = 0; i < 20; i++) certeza.registrar(store, tel, 't' + i);
  const m = certeza.marcador(store);
  assert.strictEqual(m.seguidas, 20);
  assert.strictEqual(m.listo, true);
});

test('posición mal escrita: avisa y no toca el presupuesto', () => {
  const { store, tel } = preparar();
  const r = certeza.aplicar(store, tel, '1234.56.78', ejecutar);
  assert.ok(r.error);
  assert.strictEqual(store.lead(tel).posicion_fija.posicion, '8504.40.90.900R');
});

test('cotizar: con el precio de venta muestra la ganancia por unidad en pesos', () => {
  const store = crearStore(null);
  const ctx = { store, telefono: '5491100000003', derivaciones: [] };
  const r = ejecutar('cotizar', { kg: 12, valor_factura_usd: 500, die: 20, regimen: 'comercial', unidades: 100, cantidad_cajas: 1, precio_venta_unidad: 25000, moneda_venta: 'ARS' , largo_cm: 10, ancho_cm: 10, alto_cm: 10 }, ctx);
  const dolar = require('../../src/negocio').datos().dolar_referencia_ars;
  assert.ok(dolar > 0);
  assert.strictEqual(r.ganancia_por_unidad_usd, Math.round((25000 / dolar - r.costo_por_unidad_usd) * 100) / 100);
  assert.ok(r.ganancia_por_unidad_ars > 0);
  assert.match(r.aviso, /Ganancia/);
  const sin = ejecutar('cotizar', { kg: 12, valor_factura_usd: 500, die: 20, regimen: 'comercial', unidades: 100, precio_venta_unidad: 1, moneda_venta: 'ARS' , cantidad_cajas: 1, largo_cm: 10, ancho_cm: 10, alto_cm: 10 }, ctx);
  assert.match(sin.aviso, /no le queda ganancia/);
});
