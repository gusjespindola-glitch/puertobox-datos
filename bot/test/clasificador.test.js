'use strict';
// 15/11/2026: el bot cotizó el mismo arrancador con 35% y después 20% de derechos (los dos inventados).
const test = require('node:test');
const assert = require('node:assert');
const { crearStore } = require('../store');
const { clasificar, aperturas, exacta } = require('../clasificador');
const { ejecutar } = require('../tools');
const { limpiar } = require('../agent');

const respuesta = (content, stop = 'end_turn') => ({ ok: true, json: async () => ({ stop_reason: stop, content }) });
function mockIA(pasos) {
  const llamadas = [];
  let i = 0;
  const fetchImpl = async (url, opt) => { llamadas.push(JSON.parse(opt.body)); return pasos[i++](JSON.parse(opt.body)); };
  return { fetchImpl, llamadas };
}

test('busca por código en el arancel de ARCA (exacto, sin palabras)', () => {
  const a = aperturas('8507.60');
  assert.ok(a.length >= 5);
  assert.ok(a.every((x) => x.posicion.startsWith('8507.60')));
  assert.strictEqual(exacta('8507.60.00.990V').die, 18);
  assert.strictEqual(exacta('9999.99.99.999X'), null);
});

test('clasificar: busca en internet con el producto completo, verifica en ARCA y el derecho sale de ARCA', async () => {
  const store = crearStore(null);
  const { fetchImpl, llamadas } = mockIA([
    () => respuesta([{ type: 'tool_use', id: 'a', name: 'buscar_codigo', input: { codigo: '8507.60' } }], 'tool_use'),
    // La IA dice 35%, pero el derecho tiene que salir de ARCA (18%).
    () => respuesta([{ type: 'text', text: '{"posicion":"8507.60.00.990V","die":35,"nombre_tecnico":"Arrancador con batería de litio","por_que":"Carácter esencial: la batería","confianza":"alta","alternativas":[{"posicion":"8414.80","por_que":"compresor"}]}' }]),
  ]);
  const ctx = { telefono: '549111', store, derivaciones: [], fetchImpl };
  const producto = 'Arrancador portátil 12V con compresor de aire, batería de litio https://www.alibaba.com/product-detail/x.html';
  const r = await clasificar({ producto_completo: producto }, ctx);
  assert.strictEqual(r.posicion, '8507.60.00.990V');
  assert.strictEqual(r.die, 18);
  // Le pasó el producto completo, con el link, y la búsqueda web.
  assert.match(llamadas[0].messages[0].content, /alibaba\.com/);
  assert.ok(llamadas[0].tools.some((t) => t.type && t.type.startsWith('web_search')));
  assert.strictEqual(ctx.derivaciones.length, 0); // confianza alta: no molesta a Gustavo

  // Segundo pedido en la misma charla: misma posición, sin volver a llamar a la IA.
  const r2 = await clasificar({ producto_completo: 'arrancador 23 kg' }, ctx);
  assert.strictEqual(r2.posicion, '8507.60.00.990V');
  assert.strictEqual(r2.ya_fijada, true);
  assert.strictEqual(llamadas.length, 2);

  // cotizar usa el derecho fijado aunque la IA del chat pase otro.
  const q = ejecutar('cotizar', { kg: 23, valor_factura_usd: 500, die: 35, regimen: 'comercial', unidades: 25 }, ctx);
  assert.strictEqual(q.posicion, '8507.60.00.990V');
  assert.strictEqual(q.posicion_a_confirmar, false);
  const conDie18 = ejecutar('cotizar', { kg: 23, valor_factura_usd: 500, die: 18, regimen: 'comercial', unidades: 25 }, { telefono: 'otro', store: crearStore(null), derivaciones: [] });
  assert.strictEqual(q.impuestos_y_gastos_estimados_usd, conDie18.impuestos_y_gastos_estimados_usd);
});

test('clasificar: si no está segura, avisa a Gustavo para que confirme y el presupuesto dice "a confirmar"', async () => {
  const store = crearStore(null);
  const { fetchImpl } = mockIA([() => respuesta([{ type: 'text', text: '{"posicion":"9620.00.00.000J","por_que":"trípode","confianza":"media","alternativas":[]}' }])]);
  const ctx = { telefono: '549222', store, derivaciones: [], fetchImpl };
  const r = await clasificar({ producto_completo: 'Trípode selfie con control Bluetooth y luz, 170 cm' }, ctx);
  assert.strictEqual(r.die, 16);
  assert.strictEqual(ctx.derivaciones[0].motivo, 'confirmar_posicion');
  assert.match(ctx.derivaciones[0].resumen, /9620/);
  const q = ejecutar('cotizar', { kg: 30, valor_factura_usd: 220, die: 20, regimen: 'comercial' }, ctx);
  assert.strictEqual(q.posicion_a_confirmar, true);
});

test('clasificar: una posición que no existe en ARCA no se usa', async () => {
  const { fetchImpl } = mockIA([() => respuesta([{ type: 'text', text: '{"posicion":"9999.99.99.999X","confianza":"alta"}' }])]);
  const r = await clasificar({ producto_completo: 'algo raro' }, { telefono: '549333', store: crearStore(null), derivaciones: [], fetchImpl });
  assert.ok(r.error);
});

test('clasificar: si la búsqueda web no está habilitada, clasifica igual con el arancel', async () => {
  const { fetchImpl, llamadas } = mockIA([
    () => ({ ok: false, status: 400, text: async () => 'web_search tool is not enabled for this organization' }),
    () => respuesta([{ type: 'text', text: '{"posicion":"8507.60.00.990V","confianza":"alta"}' }]),
  ]);
  const r = await clasificar({ producto_completo: 'power bank de litio' }, { telefono: '549444', store: crearStore(null), derivaciones: [], fetchImpl });
  assert.strictEqual(r.posicion, '8507.60.00.990V');
  assert.ok(!llamadas[1].tools.some((t) => t.type && t.type.startsWith('web_search')));
});

test('clasificar: el mismo producto en otra charla sale del caché (no se paga dos veces)', async () => {
  const store = crearStore(null);
  const { fetchImpl, llamadas } = mockIA([() => respuesta([{ type: 'text', text: '{"posicion":"9620.00.00.000J","confianza":"alta"}' }])]);
  await clasificar({ producto_completo: 'Trípode 170 cm' }, { telefono: 'a', store, derivaciones: [], fetchImpl });
  const r = await clasificar({ producto_completo: 'Trípode 170 cm' }, { telefono: 'b', store, derivaciones: [], fetchImpl });
  assert.strictEqual(r.posicion, '9620.00.00.000J');
  assert.strictEqual(llamadas.length, 1);
});

test('limpiar: nunca deja frases mochas como "Por el dato."', () => {
  assert.strictEqual(limpiar('Gracias por el dato. ¿Cuánto pesa?'), '¿Cuánto pesa?');
  assert.strictEqual(limpiar('Por la info. ¿Tiene marca?'), '¿Tiene marca?');
  assert.strictEqual(limpiar('Entendido. Te paso el número.'), 'Te paso el número.');
  assert.strictEqual(limpiar('Claro que sí, las traemos.'), 'Claro que sí, las traemos.');
  assert.strictEqual(limpiar('Por el tamaño del pedido, la cotización la arma nuestro despachante.'), 'Por el tamaño del pedido, la cotización la arma nuestro despachante.');
});

test('base única: el bot sabe lo que dice el anuncio y los precios viejos que circulan', () => {
  const fs = require('fs');
  const path = require('path');
  const d = require('../../src/negocio').datos();
  assert.match(d.anuncio_vigente, new RegExp(`USD ${d.usd_kg_total_desde} el kilo \\(flete \\+ gestión, desde ${d.kg_desde} kg\\)`));
  assert.match(d.anuncio_vigente, new RegExp(`desde USD ${d.envio_minimo_usd}`));
  const prompt = require('../../src/negocio').render(fs.readFileSync(path.join(__dirname, '..', 'prompt.md'), 'utf8'));
  assert.ok(prompt.includes(d.anuncio_vigente_una_linea));
  assert.match(prompt, /USD 15 el kilo a partir de 10 kg/);
  assert.match(prompt, /clasificar_producto/);
  assert.doesNotMatch(prompt, /TABLA DE ARANCELES|usar 35%/);
  // Las piezas de los anuncios no tienen precios escritos a mano.
  const pieza = fs.readFileSync(path.join(__dirname, '..', '..', 'docs', 'marketing', 'piezas', 'precio_render.py'), 'utf8');
  assert.doesNotMatch(pieza, /19\/KG|USD 65/);
});
