'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { cotizar, tributos, pesoFacturable, costoKgProveedor, recargoSobrepeso, gastosAdmin, cargarDatos } = require('../src/calc');

const datos = cargarDatos();
const fw = datos.forwarder;

test('peso volumétrico manda cuando supera al real y redondea hacia arriba', () => {
  const p = pesoFacturable([{ kg: 10, largo: 60, ancho: 40, alto: 40 }], 5000);
  assert.strictEqual(p.detalle[0].volumetrico, 19.2);
  assert.strictEqual(p.total, 20);
});

test('tramos del proveedor', () => {
  assert.deepStrictEqual(costoKgProveedor(25, fw), { usd_kg: 11, estimado: false });
  assert.deepStrictEqual(costoKgProveedor(12, fw), { usd_kg: 13, estimado: false });
  assert.strictEqual(costoKgProveedor(4, fw).estimado, true);
});

test('recargo de sobrepeso solo para bultos > 23 kg', () => {
  const r = recargoSobrepeso([{ kg: 22 }, { kg: 24 }, { kg: 30 }], fw);
  assert.strictEqual(r.bultos, 2);
  assert.strictEqual(r.unitario_usd, 44.85); // 250 × 1,3 × 0,138
});

test('gastos admin por tramo de CIF', () => {
  assert.strictEqual(gastosAdmin(499, fw).porcentaje, 0.20);
  assert.strictEqual(gastosAdmin(500, fw).porcentaje, 0.095);
});

test('pequeños envíos: FOB ≤ 400 solo IVA (más internos si corresponde)', () => {
  const t = tributos({ regimen: 'pequenos_envios', categoria: 'ropa', fob: 300, cif: 330 }, datos);
  assert.strictEqual(t.derechos, 0);
  assert.strictEqual(t.tasa_estadistica, 0);
  assert.strictEqual(t.iva, 69.3);
});

test('pequeños envíos: derechos solo sobre el excedente de 400', () => {
  const t = tributos({ regimen: 'pequenos_envios', categoria: 'ropa', fob: 800, cif: 800 }, datos);
  // excedente = 50% → base 400 → DI 20% = 80, TE 3% = 12
  assert.strictEqual(t.derechos, 80);
  assert.strictEqual(t.tasa_estadistica, 12);
  assert.strictEqual(t.iva, r(892 * 0.21));
});

test('pequeños envíos con cupo agotado: tributa todo', () => {
  const t = tributos({ regimen: 'pequenos_envios', categoria: 'ropa', fob: 300, cif: 300, enviosUsadosAnio: 5 }, datos);
  assert.strictEqual(t.franquicia, false);
  assert.strictEqual(t.derechos, 60);
});

test('celular: DI 0% e internos 9,5%', () => {
  const t = tributos({ regimen: 'courier_comercial', categoria: 'celulares', fob: 300, cif: 300 }, datos);
  assert.strictEqual(t.derechos, 0);
  assert.strictEqual(t.impuestos_internos, r(309 * 0.095));
});

test('supera tope USD 3000 → error', () => {
  assert.throws(() => tributos({ regimen: 'pequenos_envios', categoria: 'ropa', fob: 3500, cif: 3500 }, datos));
});

test('cotización completa: 2 kg de ropa, salida consolidada de 50 kg', () => {
  const c = cotizar({ regimen: 'pequenos_envios', categoria: 'ropa', fob: 80, bultos: [{ kg: 2 }], kgSalidaConsolidada: 50 });
  assert.strictEqual(c.costo.usd_kg_proveedor, 11);
  assert.strictEqual(c.cliente.flete, 50);
  assert.ok(c.ganancia > 0, 'debe dejar ganancia');
});

test('factura real FedEx: IVA 21% + IIBB 8% sobre honorarios', () => {
  const f = require('../data/facturas_reales.json').facturas[0];
  assert.strictEqual(r(f.ars.honorarios * 0.21), f.ars.iva_honorarios);
  assert.strictEqual(r(f.ars.honorarios * fw.gastos_admin.percepciones_iibb_sobre_admin), r(f.ars.iibb_pba + f.ars.iibb_caba));
  assert.ok(Math.abs(f.ars.seguro / (f.ars.fob + f.ars.flete) - 0.01) < 0.0001, 'seguro ~1% de FOB+flete');
});

test('gasto admin incluye IVA e IIBB', () => {
  const g = gastosAdmin(300, fw);
  assert.strictEqual(g.admin, 60);
  assert.strictEqual(g.total, r(60 * 1.29));
});

function r(n) { return Math.round(n * 100) / 100; }
