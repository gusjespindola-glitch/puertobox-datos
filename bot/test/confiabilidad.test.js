'use strict';
// Auditoría de procesos 15/11: fallas que hacen perder clientes sin que nadie se entere.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
process.env.OWNER_NUMBER = '5491100000000';
const { crearStore } = require('../store');

const msg = (from, body, id = 'm' + Math.random()) => ({ entry: [{ changes: [{ value: { messages: [{ id, from, type: 'text', text: { body } }] } }] }] });
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

test('1. Datos: si el archivo se corta en un reinicio, no se pierde todo (se usa la copia anterior)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pb-'));
  const f = path.join(dir, 'data.json');
  const s = crearStore(f);
  s.agregar('5491', 'user', 'hola');
  s.guardarLead('5491', { nombre: 'Ana' });
  s.agregar('5491', 'user', 'segundo');
  fs.writeFileSync(f, fs.readFileSync(f, 'utf8').slice(0, 40)); // reinicio a mitad de escritura
  const s2 = crearStore(f);
  assert.strictEqual(s2.lead('5491').nombre, 'Ana');
  assert.ok(s2.historial('5491').length >= 1);
});

test('2. Mensaje del cliente: queda guardado apenas llega, aunque el servidor se reinicie antes de contestar', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pb-'));
  const f = path.join(dir, 'data.json');
  const { procesar } = require('../server');
  const store = crearStore(f);
  await procesar(msg('5492000000001', 'quiero traer 50 remeras'), { fetchImpl: async () => { throw new Error('no se llega a llamar'); }, store, debounceMs: 60000 });
  // "reinicio": se lee de nuevo el archivo
  const s2 = crearStore(f);
  const h = s2.historial('5492000000001');
  assert.ok(h.some((m) => m.role === 'user' && /50 remeras/.test(m.content)), 'el mensaje se perdió');
  assert.ok(s2.chats().find((c) => c.telefono === '5492000000001').sinResponder, 'no quedó marcado para contestar');
});

test('3. Al arrancar, contesta los mensajes que quedaron sin respuesta por un reinicio', async () => {
  const { pendientesSinResponder } = require('../server');
  const store = crearStore(null);
  store.agregar('5492000000002', 'user', 'hola, quiero cotizar');
  store.marcar('5492000000002', { sinResponder: Date.now() });
  store.agregar('5492000000003', 'user', 'mensaje viejo');
  store.marcar('5492000000003', { sinResponder: Date.now() - 30 * 3600e3, ultimoClienteEn: Date.now() - 30 * 3600e3 });
  assert.deepStrictEqual(pendientesSinResponder(store).map((c) => c.telefono), ['5492000000002']);
});

test('4. Si WhatsApp no entrega un mensaje (por ejemplo, sin saldo en YCloud), Gustavo se entera', async () => {
  const { procesar } = require('../server');
  process.env.NTFY_TOPIC = 'prueba-topic';
  const avisos = [];
  const fetchImpl = async (url, o) => {
    if (/anthropic/.test(url)) return { ok: true, json: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'Hola, ¿qué querés traer?' }] }) };
    if (/ntfy/.test(url)) { avisos.push(JSON.parse(o.body)); return { ok: true, text: async () => '' }; }
    return { ok: false, status: 402, text: async () => 'insufficient balance' };
  };
  await procesar(msg('5492000000004', 'hola'), { fetchImpl, store: crearStore(null), debounceMs: 0 });
  delete process.env.NTFY_TOPIC;
  assert.ok(avisos.some((a) => /no se entreg|no está entregando/i.test(a.message)), 'no hubo aviso');
});

test('5. El mensaje de emergencia (sin saldo de IA) no usa frases de plantilla', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.ok(!/a la brevedad/.test(src));
});

test('6. Links firmados: vencen a los 7 días y los viejos sin vencimiento ya no sirven', () => {
  process.env.ADMIN_KEY = 'clave-prueba';
  const { firma } = require('../server');
  const srv = require('../server');
  const t = firma('charlas');
  assert.match(t, /^[0-9a-z]+-[0-9a-f]{24}$/);
  // el link viejo (sin vencimiento) no sirve
  const viejo = require('crypto').createHmac('sha256', 'clave-prueba').update('charlas').digest('hex').slice(0, 24);
  assert.strictEqual(srv.firmaOk ? srv.firmaOk('charlas', viejo) : false, false);
  // vencido
  const ayer = (Math.floor(Date.now() / 864e5) - 1).toString(36);
  assert.strictEqual(srv.firmaOk ? srv.firmaOk('charlas', `${ayer}-${t.split('-')[1]}`) : false, false);
  assert.strictEqual(srv.firmaOk('charlas', t), true);
  assert.strictEqual(srv.firmaOk('responder:1', t), false);
});
