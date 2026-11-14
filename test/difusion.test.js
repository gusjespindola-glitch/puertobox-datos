'use strict';
const test = require('node:test');
const assert = require('node:assert');
const dif = require('../bot/difusion');
const { crearStore } = require('../bot/store');

const enHorario = () => { let t = Date.UTC(2026, 10, 16, 15, 0); return t; }; // 12:00 en Argentina

test('difusión: normaliza celulares argentinos', () => {
  assert.strictEqual(dif.normalizar('+54 9 11 6213-1132'), '5491162131132');
  assert.strictEqual(dif.normalizar('+54 9 362 455-2666'), '5493624552666');
  assert.strictEqual(dif.normalizar('011 15 6213-1132'), '5491162131132');
  assert.strictEqual(dif.normalizar('+1 (917) 326-9469'), null);
});

test('difusión: carga sin repetidos, sin números de Gustavo ni de gente que ya habla con el bot', () => {
  const st = crearStore(null);
  st.agregar('5491100000001', 'user', 'hola');
  const r = dif.cargar(st, '+54 9 11 6213-1132\n+54 9 11 6213-1132\n5492213033034\n+54 9 11 0000-0001\nbasura', (t) => t === '5492213033034');
  assert.deepStrictEqual(r, { agregados: 1, salteados: 3, enCola: 1 });
});

test('difusión: crea la plantilla si falta y no manda hasta que Meta la apruebe; después manda de a lotes', async () => {
  process.env.YCLOUD_API_KEY = 'x'; process.env.BUSINESS_NUMBER = '5492216826773';
  const st = crearStore(null);
  dif.cargar(st, Array.from({ length: 15 }, (_, i) => `54911${String(60000000 + i)}`).join('\n'));
  let estado = 'PENDING'; const llamadas = [];
  const fetchImpl = async (u, o) => {
    llamadas.push([o.method, u.replace('https://api.ycloud.com/v2', '')]);
    if (u.includes('/phoneNumbers')) return { ok: true, status: 200, text: async () => JSON.stringify({ items: [{ phoneNumber: '+5492216826773', wabaId: 'W1' }] }) };
    if (o.method === 'GET' && u.includes('/templates/')) return llamadas.some((l) => l[0] === 'POST' && l[1] === '/whatsapp/templates') ? { ok: true, status: 200, text: async () => JSON.stringify({ status: estado }) } : { ok: false, status: 404, text: async () => 'not found' };
    if (o.method === 'POST' && u.endsWith('/templates')) { const b = JSON.parse(o.body); assert.strictEqual(b.category, 'MARKETING'); assert.strictEqual(b.wabaId, 'W1'); return { ok: true, status: 200, text: async () => JSON.stringify({ status: 'PENDING' }) }; }
    if (u.includes('sendDirectly')) { const b = JSON.parse(o.body); assert.strictEqual(b.type, 'template'); return { ok: true, status: 200, text: async () => '{}' }; }
    throw new Error('inesperado ' + u);
  };
  const t = enHorario();
  assert.deepStrictEqual(await dif.tick({ store: st, ahora: t, fetchImpl }), []);
  assert.strictEqual(dif.estado(st).plantilla.estado, 'PENDING');
  estado = 'APPROVED';
  const env = await dif.tick({ store: st, ahora: t + 15 * 60e3, fetchImpl });
  assert.strictEqual(env.length, 10);
  assert.strictEqual(dif.estado(st).cola.length, 5);
  assert.deepStrictEqual(await dif.tick({ store: st, ahora: t + 12 * 3600e3, fetchImpl }), []); // de noche no
});

test('difusión: BAJA saca al número y le contesta sin llamar a la IA', async () => {
  const st = crearStore(null);
  dif.cargar(st, '+54 9 11 6213-1132');
  const { procesar } = require('../bot/server');
  const salidas = [];
  const fetchImpl = async (u, o) => { if (String(u).includes('anthropic')) throw new Error('no debería llamar a la IA'); salidas.push(o && o.body); return { ok: true, status: 200, json: async () => ({}), text: async () => '{}' }; };
  await procesar({ type: 'whatsapp.inbound_message.received', whatsappInboundMessage: { id: 'b1', from: '+5491162131132', type: 'text', text: { body: 'BAJA' } } }, { store: st, fetchImpl, debounceMs: 0 });
  assert.ok(dif.estado(st).bajas.includes('5491162131132'));
  assert.strictEqual(dif.estado(st).cola.length, 0);
});

test('difusión: página con estado y formulario', () => {
  const st = crearStore(null);
  const html = dif.pagina(st, '/difusion?t=abc');
  assert.match(html, /Cargar y mandar/);
  assert.match(html, /Para mandar/);
});
