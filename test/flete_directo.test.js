'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { estimarImpuestos } = require('../src/flete_directo');

// Ejemplo del curso (Courier 2025, Lic. Padilla): FOB 1168,75 · flete 46,46 · seguro 12,15 · DI 2%
test('pequeños envíos: derechos sobre (FOB - 400) + flete + seguro (ejemplo del curso)', () => {
  const r = estimarImpuestos({ valorFactura: 1168.75, flete: 46.46, die: 2, regimen: 'personal' });
  assert.ok(Math.abs(r.cif - 1227.36) < 0.05);
  assert.ok(Math.abs(r.derechos_y_tasa - (16.55 + 24.82)) < 0.1);
  assert.ok(Math.abs(r.iva - 266.43) < 0.1);
});

test('courier general: derechos sobre todo el CIF (ejemplo del curso)', () => {
  const r = estimarImpuestos({ valorFactura: 1168.75, flete: 46.46, die: 2, regimen: 'comercial' });
  assert.ok(Math.abs(r.derechos_y_tasa - (24.55 + 36.82)) < 0.1);
  assert.ok(Math.abs(r.iva - 270.63) < 0.1);
});

test('pequeños envíos hasta USD 400: solo IVA', () => {
  const r = estimarImpuestos({ valorFactura: 300, flete: 50, die: 20, regimen: 'personal' });
  assert.strictEqual(r.derechos_y_tasa, 0);
});

test('kilos enteros: nunca se cobran medios kilos (15/11, Gustavo: la aerolínea redondea)', () => {
  const { kgCobrable, presupuesto } = require('../src/flete_directo');
  assert.strictEqual(kgCobrable({ kg: 1.2 }), 2);
  assert.strictEqual(kgCobrable({ kg: 9.5 }), 10);
  assert.strictEqual(kgCobrable({ kg: 2 }), 2);
  assert.strictEqual(kgCobrable({ kg: 18, cajas: 2, largo: 60, ancho: 40, alto: 40 }), 39);
  for (let kg = 0.1; kg <= 60; kg += 0.3) assert.ok(Number.isInteger(presupuesto({ kg, valorFactura: 100, die: 20 }).kg_presupuestado), `${kg} kg`);
  const d = require('../src/negocio').datos();
  assert.doesNotMatch(d.tabla_texto, /,5/);
});
