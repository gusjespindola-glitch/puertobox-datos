'use strict';
// 17/11/2026 (Gustavo): en /charlas poder archivar las charlas de los que desistieron, no interesan o no sirven,
// para que no queden arriba mezcladas con las que hay que atender.
const test = require('node:test');
const assert = require('node:assert');
const { crearStore } = require('../store');
const { paginaCharlas, archivada, paraEmpujar, pendientes } = require('../recordatorios');

const link = (tel, v) => `/archivar?tel=${tel}&v=${v}&t=x`;

test('archivar: baja a "Archivadas", gris con el motivo, y no recibe empujón ni recordatorios', () => {
  const store = crearStore(null);
  store.agregar('5491111', 'user', 'Hola, quiero traer 100 remeras');
  store.agregar('5491111', 'assistant', 'Te paso el presupuesto: USD 300');
  store.agregar('5492222', 'user', 'Precio de auriculares?');
  store.agregar('5492222', 'assistant', 'Son USD 120 puestos en tu casa');
  store.marcar('5491111', { archivadoEn: Date.now(), archivoMotivo: 'desistio' });
  const h = paginaCharlas(store, 'x', Date.now(), 3, () => '/r', null, '', null, null, null, null, null, link);
  const iArch = h.indexOf('🗄️ Archivadas (1)');
  assert.ok(iArch > 0, 'sección de archivadas');
  assert.ok(h.indexOf('c-5492222') < iArch, 'la activa queda arriba');
  assert.ok(h.indexOf('c-5491111') > iArch, 'la archivada queda abajo');
  assert.match(h, /🗄️ Desistió/);
  assert.match(h, /↩️ Sacar de archivadas/);
  assert.match(h, /No me interesa seguirlo/); // botones en las activas
  assert.match(h, /1 clientes \(\+1 archivadas abajo\)/);
  // Sin empujón ni recordatorios para la archivada (simula 6 h de silencio a las 14 h).
  const c = store.chats().find((x) => x.telefono === '5491111');
  c.ultimoClienteEn = Date.now() - 6 * 3600e3;
  const a14 = new Date(); a14.setUTCHours(17, 0, 0, 0);
  assert.ok(!paraEmpujar(store, 'x', a14.getTime()).some((p) => (p.c || p).telefono === '5491111'));
  const pend = pendientes(store, 'x');
  assert.ok(!JSON.stringify(pend).includes('5491111'));
});

test('archivar: si el cliente vuelve a escribir, sube solo y avisa que estaba archivada', () => {
  const store = crearStore(null);
  store.agregar('5493333', 'user', 'Hola');
  store.chats()[0].mensajes[0].en = Date.now() - 120e3;
  store.marcar('5493333', { archivadoEn: Date.now() - 60e3, archivoMotivo: 'no_interesa' });
  assert.strictEqual(archivada(store.chats()[0]), true);
  store.agregar('5493333', 'user', 'Al final quiero avanzar');
  assert.strictEqual(archivada(store.chats()[0]), false);
  const h = paginaCharlas(store, 'x', Date.now(), 3, () => '/r', null, '', null, null, null, null, null, link);
  assert.ok(!h.includes('🗄️ Archivadas ('));
  assert.match(h, /Lo habías archivado \(No me interesa seguirlo\) y volvió a escribir/);
});
