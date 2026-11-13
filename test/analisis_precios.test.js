'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { gananciaEnvio, precioCompetidor, analizar } = require('../src/analisis_precios');
const { revisar } = require('../bot/simulador');

test('ganancia por envío: 5 kg se cotiza como 6 kg y deja ganancia positiva', () => {
  const g = gananciaEnvio(5);
  assert.strictEqual(g.kg_cotizado, 6);
  assert.strictEqual(g.venta, 160);
  assert.ok(g.ganancia > 0 && g.ganancia_peor > 0);
});

test('precio de competidor por tramos', () => {
  assert.strictEqual(precioCompetidor({ '15-65kg': 19, '65-100kg': 17, '100-300kg': 15 }, 20), 19);
  assert.strictEqual(precioCompetidor({ '1-50kg': 16.5, '100kg+': 13 }, 120), 13);
  assert.strictEqual(precioCompetidor(30, 5), 30);
});

test('análisis marca alertas', () => {
  const f = analizar([0.5, 20]);
  assert.ok(f[0].alertas.length > 0);
});

test('revisor de respuestas del simulador', () => {
  assert.deepStrictEqual(revisar('¿Qué querés traer?', { ultimo: 'hola' }), []);
  assert.ok(revisar('¡Genial! ¿Cuánto pesa? ¿Y las medidas?', { ultimo: 'x' }).length >= 2);
  assert.ok(revisar('', { ultimo: 'x' }).includes('respuesta vacía'));
  assert.ok(revisar('Decime el peso bruto', { ultimo: 'x' }).includes('usa palabras técnicas'));
});
