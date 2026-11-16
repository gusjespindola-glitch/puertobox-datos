'use strict';
// Charlas reales del 16/11 (captura de /charlas que mandó Gustavo a las 15:43): poleas, consolidado marítimo, clamps, cintas.
process.env.NODE_ENV = 'test';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { crearStore } = require('../store');

const XLSX = fs.readFileSync(path.join(__dirname, 'fixtures', 'proforma.xlsx'));

test('Excel del cliente (proforma / packing list): se pasa a texto con todas las hojas', () => {
  const { xlsxATexto } = require('../adjuntos');
  const t = xlsxATexto(XLSX);
  assert.match(t, /Kinesiology tape 5cm \| 30 \| 2\.1 \| 0\.7 \| 26x20x11\.5/);
  assert.match(t, /Cartons \| 1/);
});

test('Excel del cliente: la IA lo lee como texto y el bot recibe el contenido (antes: "no se pudo leer")', async () => {
  const { procesar } = require('../adjuntos');
  const pedidos = [];
  const fetchImpl = async (url, opt = {}) => {
    if (url.includes('ycloud') || url.includes('archivo')) return { ok: true, arrayBuffer: async () => XLSX };
    pedidos.push(JSON.parse(opt.body));
    return { ok: true, json: async () => ({ content: [{ type: 'text', text: '30 rollos de cinta, USD 63, 0,7 kg, caja 26x20x11,5' }] }) };
  };
  const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'pb-'));
  const e = { type: 'document', document: { link: 'https://ejemplo/archivo', filename: 'PI26-W01.xlsx', mime_type: 'application/octet-stream' } };
  const r = await procesar(e, { fetchImpl, dir, apiKey: 'x' });
  assert.match(r, /leído automáticamente/);
  assert.match(r, /30 rollos/);
  assert.match(pedidos[0].messages[0].content[0].text, /Kinesiology tape/);
});

test('lectura de archivos: si la IA se queda sin lugar sin escribir, reintenta con más lugar y sin pensar', async () => {
  const { leerConIA } = require('../adjuntos');
  const cuerpos = [];
  const fetchImpl = async (url, opt) => {
    cuerpos.push(JSON.parse(opt.body));
    return cuerpos.length === 1
      ? { ok: true, json: async () => ({ stop_reason: 'max_tokens', content: [{ type: 'thinking', thinking: '...' }] }) }
      : { ok: true, json: async () => ({ content: [{ type: 'text', text: 'Proforma: 54 rollos' }] }) };
  };
  assert.strictEqual(await leerConIA(Buffer.from('%PDF'), 'application/pdf', fetchImpl), 'Proforma: 54 rollos');
  assert.strictEqual(cuerpos[1].max_tokens, 6000);
  assert.deepStrictEqual(cuerpos[1].thinking, { type: 'disabled' });
});

test('mensajes que llegan mientras contesta: si ya estaba contestado, no manda un segundo mensaje repetido', async () => {
  const { responder } = require('../agent');
  const st = crearStore(null);
  st.agregar('5491', 'user', 'quiero traer poleas');
  st.agregar('5491', 'user', 'por barco no trabajan?');
  st.agregar('5491', 'assistant', 'Solo trabajamos courier aéreo. ¿Cuántas poleas son?');
  let pedido = null;
  const fetchImpl = async (url, opt) => { pedido = JSON.parse(opt.body); return { ok: true, json: async () => ({ content: [{ type: 'text', text: '(nada)' }] }) }; };
  const r = await responder({ telefono: '5491', texto: 'por barco no trabajan?', store: st, fetchImpl, guardado: true });
  assert.strictEqual(r, null);
  assert.match(JSON.stringify(pedido.messages.slice(-1)), /respondé exactamente: \(nada\)/);
  assert.strictEqual(st.historial('5491').slice(-1)[0].content, 'Solo trabajamos courier aéreo. ¿Cuántas poleas son?');
});

test('prompt: links de Alibaba, no volver a saludar, rango del proveedor y cajón de madera', () => {
  const p = require('../agent').SYSTEM;
  assert.match(p, /Decir que no podés abrir un link/);
  assert.match(p, /Volver a saludar en medio de una charla/);
  assert.match(p, /Si el proveedor da un rango/);
  assert.match(p, /wooden crate/);
});

test('link de Alibaba: como la página no se puede leer, pide la captura del precio y de "Packaging & delivery"', () => {
  const p = require('../agent').SYSTEM;
  assert.match(p, /Packaging & delivery/);
  assert.match(p, /Empaque y entrega/);
  assert.match(p, /Artículo individual/);
  assert.match(require('../adjuntos').INSTRUCCIONES, /Empaque y entrega/);
});

test('presupuesto: cuando se cobra por volumen, lo dice y explica por qué (Gustavo 16/11, arrancadores 20 kg → 26 kg)', () => {
  const { ejecutar } = require('../tools');
  const ctx = (t) => ({ telefono: t, store: crearStore(null), derivaciones: [] });
  const r = ejecutar('cotizar', { kg: 20, valor_factura_usd: 263.3, die: 18, regimen: 'comercial', unidades: 10, cantidad_cajas: 10, largo_cm: 24, ancho_cm: 12, alto_cm: 45, con_bateria_litio: true }, ctx('v1'));
  assert.strictEqual(r.aplica_volumetrico, true);
  assert.strictEqual(r.kg_cobrable, 26);
  assert.strictEqual(r.linea_volumetrico, 'Se cobran 26 kg y no 20, por *peso volumétrico*: las 10 cajas de 24×12×45 cm ocupan más de lo que pesan.');
  const real = ejecutar('cotizar', { kg: 30, valor_factura_usd: 300, die: 18, regimen: 'comercial', unidades: 10, cantidad_cajas: 1, largo_cm: 40, ancho_cm: 30, alto_cm: 30 }, ctx('v2'));
  assert.strictEqual(real.aplica_volumetrico, false);
  assert.strictEqual(real.linea_volumetrico, undefined);
  assert.match(require('../agent').SYSTEM, /linea_volumetrico`?, tal cual/);
});

test('formato del presupuesto (Gustavo 16/11 16:49): montos con punto de miles, primero la plata y un solo aviso', () => {
  const { ejecutar } = require('../tools');
  const r = ejecutar('cotizar', { kg: 40, valor_factura_usd: 526.6, die: 18, regimen: 'comercial', unidades: 20, cantidad_cajas: 20, largo_cm: 24, ancho_cm: 12, alto_cm: 45, con_bateria_litio: true }, { telefono: 'f1', store: crearStore(null), derivaciones: [] });
  assert.strictEqual(r.montos.total, '1.257');
  assert.strictEqual(r.montos.flete, '936');
  assert.strictEqual(r.montos.recargo_litio, '281');
  assert.strictEqual(r.montos.valor, '526,60');
  assert.match(r.montos.por_unidad, /^\d+,\d{2}$/);
  assert.strictEqual(r.linea_volumetrico, 'Se cobran 52 kg y no 40, por *peso volumétrico*: las 20 cajas de 24×12×45 cm ocupan más de lo que pesan.');
  const p = require('../agent').SYSTEM;
  assert.match(p, /\*Presupuesto · \[unidades\]/);
  assert.match(p, /un solo aviso/);
  assert.match(p, /¿Te sirve\? Pasame tu código postal y lo avanzamos\./);
});
