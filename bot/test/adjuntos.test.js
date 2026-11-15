'use strict';
// 15/11 Gustavo: "tengo este problema cuando me manda imágenes o archivos" (el bot decía que no se podía abrir).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { procesar } = require('../adjuntos');

function mockFetch(leido) {
  const llamadas = [];
  const f = async (url, o = {}) => {
    llamadas.push({ url, o });
    if (/ycloud/.test(url)) return { ok: true, arrayBuffer: async () => Buffer.from('%PDF-1.4 proforma') };
    if (/anthropic/.test(url)) {
      const body = JSON.parse(o.body);
      f.bloque = body.messages[0].content[0];
      return { ok: true, json: async () => ({ content: [{ type: 'text', text: leido }] }) };
    }
    throw new Error('url inesperada ' + url);
  };
  f.llamadas = llamadas;
  return f;
}

test('PDF del cliente: se baja con la clave de YCloud, la IA lo lee y el bot recibe el contenido con el link', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'media-'));
  const f = mockFetch('Proforma: 2 mineras Antminer, USD 1.200 c/u, 24 kg cada una, caja 50x40x30.');
  const t = await procesar({ type: 'document', document: { link: 'https://api.ycloud.com/v2/media/abc', mime_type: 'application/pdf', filename: 'proforma.pdf' } }, { fetchImpl: f, dir, apiKey: 'K' });
  assert.strictEqual(f.llamadas[0].o.headers['X-API-Key'], 'K');
  assert.strictEqual(f.bloque.type, 'document');
  assert.match(t, /leído automáticamente/);
  assert.match(t, /USD 1\.200 c\/u, 24 kg/);
  const ruta = t.match(/\[archivo:(\/media\/[0-9a-f]{32}\.pdf)\]/)[1];
  assert.ok(fs.existsSync(path.join(dir, path.basename(ruta))));
});

test('foto: va como imagen a la IA y guarda el pie de foto', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'media-'));
  const f = mockFetch('Arrancador 12V con compresor, sin marca visible.');
  const t = await procesar({ type: 'image', image: { link: 'https://api.ycloud.com/v2/media/x', mime_type: 'image/jpeg', caption: 'este es' } }, { fetchImpl: f, dir, apiKey: 'K' });
  assert.strictEqual(f.bloque.type, 'image');
  assert.match(t, /una imagen, leído automáticamente\. Escribió: "este es"\./);
  assert.match(t, /\[archivo:\/media\/[0-9a-f]{32}\.jpg\]/);
});

test('archivo que no se puede leer (Excel): se guarda igual para Gustavo y el bot pide los datos sin decir que no se abre', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'media-'));
  const f = mockFetch('no debería leerse');
  const t = await procesar({ type: 'document', document: { link: 'https://api.ycloud.com/v2/media/y', mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', filename: 'lista.xlsx' } }, { fetchImpl: f, dir, apiKey: 'K' });
  assert.ok(!f.llamadas.some((l) => /anthropic/.test(l.url)));
  assert.match(t, /no se pudo leer automáticamente/);
  assert.match(t, /\[archivo:\/media\/[0-9a-f]{32}\.xlsx\]/);
  assert.match(t, /sin decir que no se abre/);
});

test('/charlas muestra la foto y el link al archivo', () => {
  const { crearStore } = require('../store');
  const { paginaCharlas } = require('../recordatorios');
  const store = crearStore(null);
  store.agregar('5491', 'user', '[El cliente mandó una imagen, leído automáticamente. [archivo:/media/0123456789abcdef0123456789abcdef.jpg]]\nMinera 24 kg');
  store.agregar('5491', 'user', '[El cliente mandó un archivo (p.pdf), leído automáticamente. [archivo:/media/fedcba9876543210fedcba9876543210.pdf]]\nProforma');
  const h = paginaCharlas(store, 'x', Date.now(), 3, () => '/r', '5491');
  assert.match(h, /<img src="\/media\/0123456789abcdef0123456789abcdef\.jpg"/);
  assert.match(h, /📎 Abrir el archivo \(PDF\)/);
});
