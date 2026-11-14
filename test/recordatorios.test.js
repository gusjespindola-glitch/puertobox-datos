'use strict';
// Asistente de pendientes (14/11/2026): recordatorios por ntfy, importantes primero, resumen a las 9, silencio de 22 a 8.
const test = require('node:test');
const assert = require('node:assert');
const { crearStore } = require('../bot/store');
const { revisar, pendientes, textoPendientes } = require('../bot/recordatorios');
const { avisarGustavo, procesar } = require('../bot/server');

const H = 3600e3;
const OWNER = '5492216982199';
// 14/11/2026 15:00 hora argentina = 18:00 UTC
const TARDE = Date.UTC(2026, 10, 14, 18, 0);

function armar(ahora) {
  const st = crearStore(null);
  // Quiere pagar, derivado hace 2 h, sin respuesta → importante
  st.agregar('5491100000001', 'user', 'quiero pagar'); st.guardarLead('5491100000001', { nombre: 'Ana', producto: 'remeras', valor_usd: 300 });
  st.marcar('5491100000001', { derivadoEn: ahora - 2 * H, derivadoMotivo: 'listo_para_cerrar', derivadoResumen: 'remeras 300 USD', recordatorios: 0, ultimoClienteEn: ahora - 2 * H });
  // Pidió persona hace 20 min → todavía no toca aviso
  st.marcar('5491100000002', { derivadoEn: ahora - 20 * 60e3, derivadoMotivo: 'pide_humano', recordatorios: 0, ultimoClienteEn: ahora - 20 * 60e3 });
  // Derivado y ya atendido → no es pendiente
  st.marcar('5491100000003', { derivadoEn: ahora - 5 * H, derivadoMotivo: 'reclamo', gustavoRespondioEn: ahora - 4 * H, ultimoClienteEn: ahora - 5 * H });
  return st;
}

test('pendientes: importantes primero y los atendidos no aparecen', () => {
  const st = armar(TARDE);
  const { esperando } = pendientes(st, OWNER, TARDE);
  assert.deepStrictEqual(esperando.map((p) => p.c.telefono), ['5491100000001', '5491100000002']);
  assert.strictEqual(esperando[0].importante, true);
  assert.match(textoPendientes(st, OWNER, TARDE), /⭐ Ana \(\+5491100000001\)/);
});

test('recordatorio: avisa a la hora, después cada 3 h, como mucho 4 veces', async () => {
  const st = armar(TARDE);
  st.meta('resumenDia', '2026-11-14'); // el resumen ya salió hoy
  const avisos = [];
  const avisar = async (t, titulo, prio) => avisos.push({ t, titulo, prio });
  assert.deepStrictEqual(await revisar({ store: st, owner: OWNER, avisar, ahora: TARDE }), ['5491100000001']);
  assert.strictEqual(avisos[0].prio, 'high');
  assert.match(avisos[0].t, /#listo 5491100000001/);
  assert.deepStrictEqual(await revisar({ store: st, owner: OWNER, avisar, ahora: TARDE + 45 * 60e3 }), ['5491100000002'], 'el de 20 min ya cumplió la hora (65 min); Ana no repite antes de 3 h');
  for (let i = 1; i <= 5; i++) await revisar({ store: st, owner: OWNER, avisar, ahora: TARDE + i * 3 * H + 60e3 });
  // Ana: 4 avisos como máximo (algunos caen en horario de silencio y no cuentan)
  const deAna = avisos.filter((a) => a.t.includes('5491100000001')).length;
  assert.ok(deAna <= 4, `Ana recibió ${deAna} avisos`);
});

test('silencio de 22 a 8: no avisa de noche', async () => {
  const noche = Date.UTC(2026, 10, 15, 2, 0); // 23:00 hora argentina
  const st = armar(noche);
  const avisos = [];
  assert.deepStrictEqual(await revisar({ store: st, owner: OWNER, avisar: async (t) => avisos.push(t), ahora: noche }), []);
});

test('resumen de las 9: una vez por día', async () => {
  const nueve = Date.UTC(2026, 10, 15, 12, 5); // 9:05 hora argentina
  const st = armar(nueve);
  const titulos = [];
  const avisar = async (t, titulo) => titulos.push(titulo);
  await revisar({ store: st, owner: OWNER, avisar, ahora: nueve });
  await revisar({ store: st, owner: OWNER, avisar, ahora: nueve + 15 * 60e3 });
  assert.strictEqual(titulos.filter((t) => /resumen/.test(t)).length, 1);
});

test('#listo marca al cliente como atendido', async () => {
  process.env.OWNER_NUMBER = OWNER;
  const st = armar(Date.now());
  const enviados = [];
  const fetchImpl = async (u, o) => { enviados.push(o.body); return { ok: true, json: async () => ({}), text: async () => '' }; };
  await procesar({ type: 'whatsapp.inbound_message.received', whatsappInboundMessage: { id: 'cmd1', from: '+' + OWNER, type: 'text', text: { body: '#listo 5491100000001' } } }, { store: st, fetchImpl, debounceMs: 0 });
  assert.ok(!pendientes(st, OWNER).esperando.some((p) => p.c.telefono === '5491100000001'));
});

test('un solo aviso: con ntfy no manda además WhatsApp', async () => {
  const urls = [];
  const fetchImpl = async (u) => { urls.push(String(u)); return { ok: true, json: async () => ({}), text: async () => '' }; };
  process.env.NTFY_TOPIC = 'prueba'; process.env.YCLOUD_API_KEY = 'x';
  await avisarGustavo(OWNER, 'cliente', fetchImpl);
  assert.deepStrictEqual(urls.map((u) => new URL(u).host), ['ntfy.sh']);
  delete process.env.NTFY_TOPIC; urls.length = 0;
  await avisarGustavo(OWNER, 'cliente', fetchImpl);
  assert.deepStrictEqual(urls.map((u) => new URL(u).host), ['api.ycloud.com']);
});
