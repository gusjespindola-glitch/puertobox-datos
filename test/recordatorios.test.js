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
  assert.match(avisos[0].t, /Ya lo atendí/);
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

test('botones: la notificación trae "Ya lo atendí" y "Ver pendientes", con firma y sin la clave', async () => {
  process.env.ADMIN_KEY = 'clave-secreta'; process.env.PUBLIC_URL = 'https://puertobox.com.ar';
  const { accionesNtfy } = require('../bot/server');
  const a = accionesNtfy('5491100000001');
  assert.match(a, /^http, Ya lo atendí, https:\/\/puertobox\.com\.ar\/atendido\?tel=5491100000001&t=[0-9a-f]{24}, method=POST, clear=true; view, Ver pendientes, https:\/\/puertobox\.com\.ar\/pendientes\?t=[0-9a-f]{24}$/);
  assert.ok(!a.includes('clave-secreta'));
  const headers = [];
  process.env.NTFY_TOPIC = 'prueba';
  await avisarGustavo(OWNER, 'cliente', async (u, o) => { headers.push(o.headers); return { ok: true }; }, undefined, '5491100000001');
  assert.match(headers[0].Actions, /Ya lo atendí/);
  delete process.env.NTFY_TOPIC;
});

test('botones: "Ya lo atendí" y la página de pendientes funcionan solo con firma válida', async () => {
  process.env.ADMIN_KEY = 'clave-secreta'; process.env.OWNER_NUMBER = OWNER; process.env.DATA_FILE = require('path').join(require('os').tmpdir(), `pb-${process.pid}.json`);
  delete require.cache[require.resolve('../bot/server')];
  const srv = require('../bot/server');
  const { firma } = srv;
  const s = srv.servidor().listen(0); await new Promise((r) => s.once('listening', r));
  const base = `http://127.0.0.1:${s.address().port}`;
  assert.strictEqual((await fetch(`${base}/pendientes?t=mal`)).status, 401);
  const pag = await fetch(`${base}/pendientes?t=${firma('pendientes')}`);
  assert.strictEqual(pag.status, 200);
  assert.match(await pag.text(), /Pendientes PuertoBox/);
  assert.strictEqual((await fetch(`${base}/atendido?tel=5491100000009&t=mal`, { method: 'POST' })).status, 401);
  const ok = await fetch(`${base}/atendido?tel=5491100000009&t=${firma('atendido:5491100000009')}`, { method: 'POST' });
  assert.strictEqual(ok.status, 200);
  assert.match(await ok.text(), /marcado como atendido/);
  s.close();
});

test('ventana de 24 h: avisa cuando se está por vencer y lo muestra en la lista', async () => {
  const ahora = TARDE;
  const st = crearStore(null);
  st.marcar('5491100000005', { derivadoEn: ahora - 22 * H, derivadoMotivo: 'listo_para_cerrar', ultimoClienteEn: ahora - 22 * H, recordatorios: 4, ultimoRecordatorio: ahora - H });
  st.meta('resumenDia', '2026-11-14');
  const avisos = [];
  await revisar({ store: st, owner: OWNER, avisar: async (t, titulo) => avisos.push(titulo), ahora });
  assert.deepStrictEqual(avisos, ['PuertoBox: se vence el plazo para contestar']);
  await revisar({ store: st, owner: OWNER, avisar: async (t, titulo) => avisos.push(titulo), ahora: ahora + 30 * 60e3 });
  assert.strictEqual(avisos.length, 1, 'el aviso de vencimiento sale una sola vez');
  assert.match(textoPendientes(st, OWNER, ahora), /te quedan 2 h para contestarle/);
});

test('si la pausa venció y el bot atiende, no molesta a Gustavo aunque el cliente siga escribiendo', () => {
  const ahora = TARDE;
  const st = crearStore(null);
  st.marcar('5491100000006', { derivadoEn: ahora - 30 * H, derivadoMotivo: 'pide_humano', gustavoRespondioEn: ahora - 29 * H, ultimoClienteEn: ahora - H, pausadoHasta: ahora - 5 * H });
  assert.strictEqual(pendientes(st, OWNER, ahora).esperando.length, 0);
  st.marcar('5491100000006', { pausadoHasta: ahora + 5 * H });
  assert.strictEqual(pendientes(st, OWNER, ahora).esperando.length, 1, 'con el bot pausado, sí espera a Gustavo');
});

test('resumen de las 9: trae los números del día (consultas → presupuestos → quieren pagar)', async () => {
  const { embudo } = require('../bot/recordatorios');
  const st = crearStore(null);
  st.guardarLead('5491100000011', { estado: 'nuevo' });
  st.guardarLead('5491100000012', { estado: 'cotizado', precio_usd: 145 });
  st.guardarLead('5491100000013', { estado: 'listo_para_cerrar', precio_usd: 380 });
  const e = embudo(st, OWNER, Date.now());
  assert.deepStrictEqual([e.consultas, e.cotizados, e.pagar], [3, 2, 1]);
  assert.match(e.texto, /3 consultas nuevas · 2 con presupuesto · 1 quieren pagar/);
});

test('anuncio de Meta: el chat que entra con el texto del anuncio queda marcado y sale en el resumen', async () => {
  const { embudo } = require('../bot/recordatorios');
  const st = crearStore(null);
  const fetchImpl = async () => ({ ok: true, json: async () => ({}), text: async () => '' });
  st.pausar('5491100000077', 'manual'); st.pausar('5491100000078', 'manual'); // pausados: no llama a la IA
  await procesar({ type: 'whatsapp.inbound_message.received', whatsappInboundMessage: { id: 'ad1', from: '+5491100000077', type: 'text', text: { body: 'Hola, quiero cotizar un envío desde China' } } }, { store: st, fetchImpl, debounceMs: 0 });
  await procesar({ type: 'whatsapp.inbound_message.received', whatsappInboundMessage: { id: 'web1', from: '+5491100000078', type: 'text', text: { body: 'Hola, vi la web y quiero cotizar un envío desde China' } } }, { store: st, fetchImpl, debounceMs: 0 });
  st.guardarLead('5491100000077', { estado: 'cotizado', precio_usd: 120 });
  const e = embudo(st, OWNER);
  assert.deepStrictEqual(e.anuncio, { chats: 1, cotizados: 1, pagar: 0 });
  assert.match(e.texto, /Del anuncio de Meta: 1 escribieron · 1 con presupuesto/);
});

test('el 3034 (WhatsApp personal de Gustavo) tampoco cuenta como cliente', () => {
  const { embudo, esGustavo } = require('../bot/recordatorios');
  const st = crearStore(null);
  st.guardarLead('5492213033034', { producto: 'prueba' });
  st.guardarLead('5491100000099', { producto: 'real' });
  assert.ok(esGustavo('5492213033034', OWNER));
  assert.strictEqual(embudo(st, OWNER).consultas, 1);
});
