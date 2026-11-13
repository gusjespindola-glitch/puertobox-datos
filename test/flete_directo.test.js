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
