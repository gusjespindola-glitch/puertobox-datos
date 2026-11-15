'use strict';
// 15/11 Gustavo: el presupuestador se abre ya cargado con los datos de la charla; él revisa y lo manda.
const test = require('node:test');
const assert = require('node:assert');
const { crearStore } = require('../store');
const { datosDeCharla, enviarDesdeCotizador } = require('../presupuesto_charla');

const iaResponde = (json) => async (url) => {
  assert.match(url, /anthropic/);
  return { ok: true, json: async () => ({ content: [{ type: 'text', text: JSON.stringify(json) }] }) };
};

test('charla vieja sin cotización: la IA saca los datos que dio el cliente y la posición fijada se respeta', async () => {
  const store = crearStore(null);
  const tel = '5492983385139';
  store.agregar(tel, 'user', 'Arrancador 12V con compresor, aprox 10 unidades, 24x14,5x11 cm, con caja 900 gramos');
  store.agregar(tel, 'assistant', 'Por el dato. ¿Tiene marca?');
  store.guardarLead(tel, { posicion_fija: { posicion: '8504.40.90', die: 35, internos: 0, confianza: 'alta' } });
  let llamadas = 0;
  const fetchImpl = async (u, o) => { llamadas++; return iaResponde({ nombre: null, producto: 'Arrancador portátil 12V con compresor de aire', unidades: 10, kg_total: 9, valor_usd: null, cajas: null, largo_cm: null, ancho_cm: null, alto_cm: null, litio: true, cuit_puertobox: false, notas: 'Medidas son del producto, no de la caja.' })(u, o); };
  const d = await datosDeCharla(tel, { store, fetchImpl });
  assert.strictEqual(d.fuente, 'charla');
  assert.strictEqual(d.posicion, '8504.40.90');
  assert.strictEqual(d.die, 35);
  assert.strictEqual(d.input.kg, 9);
  assert.strictEqual(d.input.unid, 10);
  assert.strictEqual(d.input.reg, 'comercial');
  assert.strictEqual(d.input.litio, true);
  assert.deepStrictEqual(d.faltan, ['valor de la mercadería', 'medidas de la caja']);
  // La segunda vez no vuelve a gastar IA si la charla no cambió
  await datosDeCharla(tel, { store, fetchImpl });
  assert.strictEqual(llamadas, 1);
});

test('si el bot ya cotizó, se usan esos datos tal cual (sin IA)', async () => {
  const store = crearStore(null);
  const tel = '5491100000000';
  store.agregar(tel, 'user', 'remeras');
  store.guardarLead(tel, { nombre: 'Juan', producto: 'Remeras', posicion_fija: { posicion: '6109.10.00', die: 35, confianza: 'alta' }, cotizacion: { en: 'x', input: { kg: 10, valor_factura_usd: 500, cantidad_cajas: 1, largo_cm: 50, ancho_cm: 40, alto_cm: 30, unidades: 50, regimen: 'comercial' }, r: {} } });
  const d = await datosDeCharla(tel, { store, fetchImpl: async () => { throw new Error('no debería llamar a la IA'); } });
  assert.strictEqual(d.fuente, 'cotizacion');
  assert.strictEqual(d.input.valor, 500);
  assert.deepStrictEqual(d.faltan, []);
});

test('enviar desde el cotizador: recotiza con los números de Gustavo, fija su posición, arma el PDF, lo manda y pausa el bot', async () => {
  const store = crearStore(null);
  const tel = '5491100000001';
  store.agregar(tel, 'user', 'hola');
  const envios = [];
  const r = await enviarDesdeCotizador(tel, { posicion: '8504.40.90', die: '35', ii: '0', valor: '200', kg: '9', cajas: '1', largo: '50', ancho: '40', alto: '30', unid: '10', reg: 'comercial', litio: '1', cli: 'Pedro', prod: 'Arrancador 12V' },
    { store, baseUrl: 'https://x', enviarDoc: async (...a) => envios.push(a) });
  assert.ok(r.ok, r.error);
  assert.match(r.nro, /^0001-/);
  assert.strictEqual(envios.length, 1);
  assert.match(envios[0][1], /^https:\/\/x\/presupuesto\/[0-9a-f]{32}\.pdf$/);
  const l = store.lead(tel);
  assert.strictEqual(l.posicion_fija.posicion, '8504.40.90');
  assert.strictEqual(l.cotizacion.input.con_bateria_litio, true);
  assert.ok(l.cotizacion.r.recargo_litio_usd > 0);
  assert.ok(store.chats().find((c) => c.telefono === tel).mensajes.at(-1).content.startsWith('[Gustavo] '));
  assert.ok(store.pausado ? store.pausado(tel) : true);
});

test('enviar: sin valor o peso, o fuera de las 24 h, no manda nada', async () => {
  const store = crearStore(null);
  const tel = '5491100000002';
  store.agregar(tel, 'user', 'hola');
  const enviarDoc = async () => { throw new Error('no debería mandar'); };
  assert.match((await enviarDesdeCotizador(tel, { kg: '5' }, { store, baseUrl: 'x', enviarDoc })).error, /valor o el peso/);
  store.marcar(tel, { ultimoClienteEn: Date.now() - 25 * 3600e3 });
  assert.match((await enviarDesdeCotizador(tel, { kg: '5', valor: '100', posicion: '1' }, { store, baseUrl: 'x', enviarDoc })).error, /24 h/);
});

test('si la IA falla o no encuentra nada, el respaldo saca unidades, peso con caja y litio (charla real del arrancador, 15/11)', async () => {
  const store = crearStore(null);
  const tel = '5492983385140';
  store.agregar(tel, 'user', 'https://www.alibaba.com/product-detail/12V-Car-Jump-Starter-With-Air_1601952873179.html\nEste seria el producto, aprox 10 unidades por avion\n24 × 14,5 × 11 cm, producto sin caja 763 gramos, con caja 900 gramos aprox');
  store.agregar(tel, 'assistant', 'Como el producto tiene batería de litio, nuestro despachante tiene que revisarlo.');
  store.guardarLead(tel, { producto: 'Arrancador 12V' });
  let llamadas = 0;
  const falla = async () => { llamadas++; return { ok: false, status: 529 }; };
  const d = await datosDeCharla(tel, { store, fetchImpl: falla });
  assert.strictEqual(d.input.unid, 10);
  assert.strictEqual(d.input.kg, 9);
  assert.strictEqual(d.input.litio, true);
  assert.match(d.notas, /No pude/);
  // Con IA que no encuentra nada tampoco queda vacío, y no se guarda vacío
  const store2 = crearStore(null);
  store2.agregar(tel, 'user', 'quiero traer 5 unidades de 2 kg');
  const d2 = await datosDeCharla(tel, { store: store2, fetchImpl: iaResponde({}) });
  assert.strictEqual(d2.input.unid, 5);
  assert.strictEqual(d2.input.kg, 10);
});

test('el bot anota el pedido mientras charla y el cotizador lo toma tal cual (16/11: "volcalo cuando lo interpreta el bot")', async () => {
  const { ejecutar } = require('../tools');
  const store = crearStore(null);
  const tel = '5492983385141';
  const ctx = { store, telefono: tel, derivaciones: [] };
  store.agregar(tel, 'user', 'aprox 10 unidades, con caja 900 gramos');
  await ejecutar('anotar_pedido', { producto: 'Arrancador 12V con compresor', unidades: 10, kg_por_unidad: 0.9, con_bateria_litio: true, link: 'https://alibaba.com/x' }, ctx);
  assert.strictEqual(store.lead(tel).pedido.kg_total, 9);
  store.agregar(tel, 'user', 'le pago 15 dolares cada uno, caja de 50x40x30');
  await ejecutar('anotar_pedido', { valor_usd: 150, largo_cm: 50, ancho_cm: 40, alto_cm: 30, cantidad_cajas: 1 }, ctx);
  const d = await datosDeCharla(tel, { store, fetchImpl: async () => { throw new Error('no hace falta leer la charla'); } });
  assert.strictEqual(d.fuente, 'bot');
  assert.deepStrictEqual([d.input.unid, d.input.kg, d.input.valor, d.input.largo, d.input.litio], [10, 9, 150, 50, true]);
  assert.strictEqual(d.producto, 'Arrancador 12V con compresor');
  assert.strictEqual(d.link, 'https://alibaba.com/x');
  assert.deepStrictEqual(d.alertas, []);
});

test('lo más nuevo gana: si el cliente cambia el peso después de la cotización, vale lo que anotó el bot después', async () => {
  const { ejecutar } = require('../tools');
  const store = crearStore(null);
  const tel = '5492983385142';
  const ctx = { store, telefono: tel, derivaciones: [] };
  store.agregar(tel, 'user', '10 unidades, 9 kilos, 150 dolares');
  await ejecutar('cotizar', { kg: 9, valor_factura_usd: 150, die: 12.6, regimen: 'comercial', unidades: 10 }, ctx);
  await new Promise((r) => setTimeout(r, 5));
  store.agregar(tel, 'user', 'serian aprox el pedido 23 kg');
  await ejecutar('anotar_pedido', { kg_total: 23 }, ctx);
  const d = await datosDeCharla(tel, { store, fetchImpl: async () => { throw new Error('no'); } });
  assert.strictEqual(d.input.kg, 23);
  assert.strictEqual(d.input.valor, 150);
});

test('control: si lo cargado no cierra con la charla, avisa en rojo', async () => {
  const { ejecutar } = require('../tools');
  const store = crearStore(null);
  const tel = '5492983385143';
  const ctx = { store, telefono: tel, derivaciones: [] };
  store.agregar(tel, 'user', 'son 100 unidades');
  store.agregar(tel, 'user', 'mejor 300 unidades, tiene batería de litio');
  await ejecutar('anotar_pedido', { unidades: 100, kg_total: 30, valor_usd: 220, largo_cm: 40, ancho_cm: 30, alto_cm: 30 }, ctx);
  const d = await datosDeCharla(tel, { store, fetchImpl: async () => { throw new Error('no'); } });
  assert.ok(d.alertas.some((a) => /300 unidades/.test(a)));
  assert.strictEqual(d.input.litio, true); // lo dijo en la charla: se tilda solo
});

test('control cruzado: siempre relee la charla y marca 🚩 si no coincide con lo que anotó el bot (15/11)', async () => {
  const { ejecutar } = require('../tools');
  const store = crearStore(null);
  const tel = '5492983385144';
  const ctx = { store, telefono: tel, derivaciones: [] };
  store.agregar(tel, 'user', 'son 300 unidades, 90 kilos, pago 660 dolares, tiene bateria');
  await ejecutar('anotar_pedido', { unidades: 100, kg_total: 90, valor_usd: 660 }, ctx); // el bot se equivocó en las unidades
  let lecturas = 0;
  const ia = async (u, o) => { lecturas++; return iaResponde({ unidades: 300, kg_total: 90, valor_usd: 660, litio: true })(u, o); };
  const d = await datosDeCharla(tel, { store, fetchImpl: ia });
  assert.strictEqual(d.input.unid, 100); // no corrige solo: avisa
  assert.ok(d.alertas.some((a) => /300 unidades y el bot anotó 100/.test(a)), d.alertas.join(' | '));
  assert.ok(d.alertas.some((a) => /litio/.test(a)));
  assert.ok(!d.alertas.some((a) => /kg|USD/.test(a)));
  // Mientras la charla no cambie, no vuelve a gastar en releerla
  await datosDeCharla(tel, { store, fetchImpl: ia });
  assert.strictEqual(lecturas, 1);
});
