'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { precioCliente, costeo } = require('../src/precio_fijo');

test('fórmula: 2 kg y USD 80 → 28×2 + 55%×80 = 100', () => {
  assert.strictEqual(precioCliente({ kg: 2, valorFactura: 80 }).total, 100);
});
test('mínimo USD 40', () => {
  assert.strictEqual(precioCliente({ kg: 0.3, valorFactura: 10 }).total, 40);
});
test('volumétrico manda', () => {
  assert.strictEqual(precioCliente({ kg: 1, largo: 50, ancho: 40, alto: 30, valorFactura: 0 }).kg_facturable, 12);
});
test('ningún caso típico da pérdida', () => {
  const casos = [[2, 80], [5, 50], [1.5, 120], [1, 150], [3, 700], [20, 1200], [8, 150], [10, 100], [0.5, 20]];
  for (const [kg, v] of casos) assert.ok(costeo({ kg, valorFactura: v }).neto > 0, `${kg}kg USD${v}`);
});
