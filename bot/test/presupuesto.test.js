'use strict';
// 15/11 Gustavo: el presupuesto formal se arma solo cuando el cliente confirma; lo manda él con un botón.
const test = require('node:test');
const assert = require('node:assert');
const { ejecutar } = require('../tools');
const { crearStore } = require('../store');
const { armarDatos, pdf } = require('../../src/presupuesto_pdf');

test('presupuesto formal: se arma solo al confirmar, con número correlativo, y da un PDF', async () => {
  const store = crearStore(null);
  const ctx = { store, telefono: '5491100000000', derivaciones: [] };
  store.guardarLead(ctx.telefono, { nombre: 'Juan', producto: 'remeras de algodón' });
  await ejecutar('cotizar', { kg: 10, largo_cm: 50, ancho_cm: 40, alto_cm: 30, valor_factura_usd: 500, die: 16, regimen: 'comercial', unidades: 50 , cantidad_cajas: 1 }, ctx);
  assert.ok(store.lead(ctx.telefono).cotizacion.r.total_puertobox_usd > 0);
  // Una duda no genera presupuesto
  await ejecutar('derivar_a_gustavo', { motivo: 'duda', resumen: 'x' }, ctx);
  assert.strictEqual(store.presupuestoDe(ctx.telefono), null);
  await ejecutar('derivar_a_gustavo', { motivo: 'listo_para_cerrar', resumen: 'Juan cierra' }, ctx);
  const p = store.presupuestoDe(ctx.telefono);
  assert.match(p.nro, /^0001-00000001$/);
  assert.strictEqual(ctx.derivaciones.at(-1).presupuesto, p.nro);
  assert.match(p.token, /^[0-9a-f]{32}$/);
  // Volver a confirmar con la misma cotización no crea otro
  assert.strictEqual(store.crearPresupuesto(ctx.telefono).nro, p.nro);
  const D = armarDatos({ nro: p.nro, lead: store.lead(ctx.telefono), cliente: { nombre: 'Juan Pérez' } });
  assert.strictEqual(D.total, store.lead(ctx.telefono).cotizacion.r.total_puertobox_usd);
  assert.strictEqual(D.mercaderia.desc, 'remeras de algodón');
  const buf = await pdf(D);
  assert.strictEqual(buf.slice(0, 5).toString(), '%PDF-');
});

test('presupuesto formal: sin cotización no se arma', () => {
  const store = crearStore(null);
  store.guardarLead('5492', { nombre: 'Ana' });
  assert.strictEqual(store.crearPresupuesto('5492'), null);
});

test('presupuesto: el archivo se guarda con el nombre del cliente, o el producto si no hay nombre (16/11)', async () => {
  const { nombreArchivo, disposicion } = require('../../src/presupuesto_pdf');
  assert.strictEqual(nombreArchivo({ nro: '0001-00000012', cliente: { nombre: 'Juan Pérez' }, mercaderia: { desc: 'remeras' } }), 'Presupuesto 0001-00000012 - Juan Pérez.pdf');
  assert.strictEqual(nombreArchivo({ nro: '0001-00000013', cliente: { nombre: '' }, mercaderia: { desc: 'zapatillas / running' } }), 'Presupuesto 0001-00000013 - zapatillas running.pdf');
  assert.strictEqual(nombreArchivo({ nro: '0001-00000014', cliente: {}, mercaderia: {} }), 'Presupuesto 0001-00000014.pdf');
  assert.match(disposicion('Presupuesto 1 - Juan Pérez.pdf'), /filename="Presupuesto 1 - Juan Perez\.pdf"; filename\*=UTF-8''Presupuesto%201%20-%20Juan%20P%C3%A9rez\.pdf/);

  // De punta a punta con el servidor: el botón "Ver PDF" lleva a un link que termina en el nombre (así lo guarda el iPhone).
  const fs = require('fs'); const os = require('os'); const path = require('path');
  const archivo = path.join(os.tmpdir(), `pb-presu-${process.pid}.json`);
  try { fs.unlinkSync(archivo); } catch {}
  const tel = '5491100000555';
  const st = crearStore(archivo);
  const ctx = { store: st, telefono: tel, derivaciones: [] };
  st.guardarLead(tel, { producto: 'remeras de algodón' });
  await ejecutar('cotizar', { kg: 10, largo_cm: 50, ancho_cm: 40, alto_cm: 30, valor_factura_usd: 500, die: 16, regimen: 'comercial', unidades: 50, cantidad_cajas: 1 }, ctx);
  await ejecutar('derivar_a_gustavo', { motivo: 'listo_para_cerrar', resumen: 'cierra' }, ctx);
  process.env.ADMIN_KEY = 'clave-secreta'; process.env.DATA_FILE = archivo;
  delete require.cache[require.resolve('../server')];
  const srv = require('../server');
  const s = srv.servidor().listen(0); await new Promise((r) => s.once('listening', r));
  const base = `http://127.0.0.1:${s.address().port}`;
  try {
    const ver = async (nombre) => {
      const r = await fetch(`${base}/presupuesto-ver?tel=${tel}&t=${srv.firma('presu:' + tel)}`, { method: 'POST', body: new URLSearchParams({ nombre }), redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' } });
      assert.strictEqual(r.status, 303);
      const loc = r.headers.get('location');
      const pdfR = await fetch(base + loc);
      assert.strictEqual(pdfR.status, 200);
      assert.strictEqual((await pdfR.arrayBuffer()).byteLength > 1000, true);
      return { loc: decodeURIComponent(loc), cd: pdfR.headers.get('content-disposition') };
    };
    const sinNombre = await ver('');
    assert.match(sinNombre.loc, /\/Presupuesto 0001-\d{8} - remeras de algodón\.pdf$/);
    assert.match(sinNombre.cd, /remeras de algod/);
    const conNombre = await ver('Juan Pérez');
    assert.match(conNombre.loc, /\/Presupuesto 0001-\d{8} - Juan Pérez\.pdf$/);
    assert.match(conNombre.cd, /filename="Presupuesto 0001-\d{8} - Juan Perez\.pdf"/);
  } finally { s.close(); try { fs.unlinkSync(archivo); } catch {} }
});
