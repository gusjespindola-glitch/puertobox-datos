'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dolar-'));
process.env.DATA_FILE = path.join(dir, 'data.json');
const dolar = require('../../src/dolar');
const base = require('../../src/negocio').datos().dolar_referencia_ars;

test('sin actualizar usa el de negocio.json', () => {
  dolar._reset();
  assert.strictEqual(dolar.valor(), base);
  assert.strictEqual(dolar.info().automatico, false);
});

test('actualiza con la venta oficial y lo guarda', async () => {
  dolar._reset();
  const ok = await dolar.actualizar(async () => ({ compra: base - 50, venta: base + 30.4, fechaActualizacion: '2026-11-16T12:00:00Z' }));
  assert.ok(ok);
  assert.strictEqual(dolar.valor(), Math.round(base + 30.4));
  dolar._reset();
  assert.strictEqual(dolar.valor(), Math.round(base + 30.4), 'lo lee de /data/dolar.json después de un reinicio');
});

test('descarta valores disparatados y errores de la fuente', async () => {
  const antes = dolar.valor();
  assert.strictEqual(await dolar.actualizar(async () => ({ venta: base * 10 })), false);
  assert.strictEqual(await dolar.actualizar(async () => ({ venta: 0 })), false);
  assert.strictEqual(await dolar.actualizar(async () => { throw new Error('sin red'); }), false);
  assert.strictEqual(dolar.valor(), antes);
});
