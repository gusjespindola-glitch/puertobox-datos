'use strict';
const test = require('node:test');
const assert = require('node:assert');
const pc = require('../prueba_completa');

test('prueba completa: corre de punta a punta y arma el informe (IA simulada)', async () => {
  const fetchImpl = async (url, opt) => {
    const b = JSON.parse(opt.body);
    const sys = Array.isArray(b.system) ? b.system[0].text : String(b.system);
    const text = sys.startsWith('Sos un despachante') ? '{"posicion":"9620.00.00.000J","confianza":"alta","por_que":"trípode"}' : 'Hola, ¿cómo estás? Te traemos tu compra de China hasta tu casa.';
    return { ok: true, json: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text }] }) };
  };
  const { texto, resumen } = await pc.correr(fetchImpl);
  assert.match(texto, /## A\. Posiciones arancelarias/);
  assert.match(texto, /## B\. Charlas/);
  assert.match(texto, /✅ \| Trípode selfie/); // la correcta da bien
  assert.match(texto, /❌ \| Mats de yoga/); // y una equivocada da mal: la prueba no dice que todo está bien si no lo está
  assert.match(resumen, /Posiciones: 1\/\d+ bien/);
});

test('prueba completa: todos los productos esperados existen en el arancel de ARCA', () => {
  const { aperturas } = require('../clasificador');
  for (const p of pc.PRODUCTOS) for (const e of p.esperado) assert.ok(aperturas(e).length, `${e} no existe en ARCA`);
});
