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
  assert.match(require('../agent').SYSTEM, /Packaging & delivery/);
});
