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
  assert.match(avisos[0].t, /Espera hace/); // corto: quién, qué quiere, qué hacer y cuánto espera (el botón «Ya lo atendí» viene en la notificación)
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

test('avisos: van como JSON a ntfy (con tildes), con botones firmados, y si ntfy rechaza se reintenta sin botones (15/11)', async () => {
  process.env.ADMIN_KEY = 'clave-secreta'; process.env.PUBLIC_URL = 'https://puertobox.com.ar';
  const { accionesNtfy } = require('../bot/server');
  const a = accionesNtfy('5491100000001');
  assert.deepStrictEqual(a.map((x) => x.label), ['Ver y contestar', 'Ya lo atendí', 'Ver pendientes']);
  assert.match(a[1].url, /^https:\/\/puertobox\.com\.ar\/atendido\?tel=5491100000001&t=[0-9a-z]+-[0-9a-f]{24}$/);
  // 15/11 18:03: todos los botones abren una página (los "http" por detrás no daban ninguna señal en el celular).
  assert.ok(a.every((x) => x.action === 'view'));
  const pos = accionesNtfy('5491100000001', 'confirmar_posicion');
  assert.deepStrictEqual(pos.map((x) => x.label), ['Confirmar posición', 'Ver y contestar']);
  assert.match(pos[0].url, /\/posicion\?tel=5491100000001&t=/);
  assert.ok(!JSON.stringify(a).includes('clave-secreta'));
  process.env.NTFY_TOPIC = 'prueba';
  const cuerpos = [];
  // Todos los encabezados tienen que ser ASCII (si no, ntfy rechaza el aviso).
  await avisarGustavo(OWNER, 'Cliente: Agustín — trípode', async (u, o) => { cuerpos.push(JSON.parse(o.body)); for (const v of Object.values(o.headers)) assert.match(v, /^[\x20-\x7e]*$/); return { ok: true }; }, undefined, '5491100000001');
  assert.strictEqual(cuerpos[0].topic, 'prueba');
  assert.strictEqual(cuerpos[0].message, 'Cliente: Agustín — trípode');
  assert.strictEqual(cuerpos[0].actions[1].label, 'Ya lo atendí');
  // ntfy rechaza → reintenta sin botones y el aviso llega igual.
  const intentos = [];
  const ok = await avisarGustavo(OWNER, 'hola', async (u, o) => { const b = JSON.parse(o.body); intentos.push(b); return b.actions ? { ok: false, status: 400, text: async () => 'invalid' } : { ok: true }; }, undefined, '5491100000001');
  assert.strictEqual(ok, true);
  assert.strictEqual(intentos.length, 2);
  assert.ok(!intentos[1].actions);
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
  // El botón del aviso (GET) marca y muestra "Listo".
  const g = await fetch(`${base}/atendido?tel=5491100000009&t=${firma('atendido:5491100000009')}`);
  assert.strictEqual(g.status, 200);
  assert.match(await g.text(), /✅ Listo[\s\S]*quedó como atendido/);
  assert.strictEqual((await fetch(`${base}/atendido?tel=5491100000009&t=mal`)).status, 401);
  // Acceso guardado (15/11 18:07): después de entrar una vez, /charlas y /pendientes abren sin link.
  assert.strictEqual((await fetch(`${base}/charlas`)).status, 401);
  const cookie = /pbp=[0-9a-f]{32}/.exec(pag.headers.get('set-cookie'))[0];
  assert.strictEqual((await fetch(`${base}/charlas`, { headers: { cookie } })).status, 200);
  assert.strictEqual((await fetch(`${base}/pendientes`, { headers: { cookie } })).status, 200);
  assert.strictEqual((await fetch(`${base}/charlas`, { headers: { cookie: 'pbp=' + '0'.repeat(32) } })).status, 401);
  // 16/11 ("no abre"): el cotizador del nomenclador también abre con esa cookie.
  assert.strictEqual((await fetch(`${base}/nomenclador/`)).status, 401);
  assert.strictEqual((await fetch(`${base}/nomenclador/`, { headers: { cookie } })).status, 200);
  s.close();
});

test('botón "Confirmar posición": muestra las opciones, confirma o cambia, y el bot deja de decir "a confirmar"', async () => {
  const os = require('os'); const path = require('path'); const fs = require('fs');
  const archivo = path.join(os.tmpdir(), `pb-pos-${process.pid}.json`);
  const TEL = '5491166000001';
  fs.writeFileSync(archivo, JSON.stringify({ chats: {}, leads: { [TEL]: { telefono: TEL, posicion_fija: { posicion: '8509.80.90.900U', die: 20, confianza: 'media', producto: '10 difusores ultrasónicos de aromas sin agua', alternativas: [{ posicion: '8479.89.99.900H', die: 12.6, por_que: 'sin motor' }] } } }, vistos: [] }));
  process.env.ADMIN_KEY = 'clave-secreta'; process.env.OWNER_NUMBER = OWNER; process.env.DATA_FILE = archivo;
  delete require.cache[require.resolve('../bot/server')];
  const srv = require('../bot/server');
  const s = srv.servidor().listen(0); await new Promise((r) => s.once('listening', r));
  const base = `http://127.0.0.1:${s.address().port}`;
  const link = `${base}/posicion?tel=${TEL}&t=${srv.firma('posicion:' + TEL)}`;
  assert.strictEqual((await fetch(`${base}/posicion?tel=${TEL}&t=mal`)).status, 401);
  const pag = await (await fetch(link)).text();
  assert.match(pag, /Confirmar 8509\.80\.90\.900U/);
  assert.match(pag, /Usar 8479\.89\.99\.900H/);
  const ok = await (await fetch(link, { method: 'POST', body: 'pos=8509.80.90.900U', headers: { 'content-type': 'application/x-www-form-urlencoded' } })).text();
  assert.match(ok, /✅ Listo[\s\S]*Confirmada/);
  const guardado = JSON.parse(fs.readFileSync(archivo, 'utf8')).leads[TEL].posicion_fija;
  assert.strictEqual(guardado.confirmada, true);
  assert.strictEqual(guardado.confianza, 'alta');
  const cambio = await (await fetch(link, { method: 'POST', body: 'pos=8479.89.99.900H', headers: { 'content-type': 'application/x-www-form-urlencoded' } })).text();
  assert.match(cambio, /Cambiada a <b>8479\.89\.99\.900H/);
  const mal = await (await fetch(link, { method: 'POST', body: 'pos=1234', headers: { 'content-type': 'application/x-www-form-urlencoded' } })).text();
  assert.match(mal, /⚠️/);
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

test('698: el chat que entra con el texto del automático del 698 queda marcado y sale en el resumen', async () => {
  const { embudo, paginaCharlas } = require('../bot/recordatorios');
  const { datos } = require('../src/negocio');
  const st = crearStore(null);
  const fetchImpl = async () => ({ ok: true, json: async () => ({}), text: async () => '' });
  st.pausar('5491100000079', 'manual');
  await procesar({ type: 'whatsapp.inbound_message.received', whatsappInboundMessage: { id: 'w698', from: '+5491100000079', type: 'text', text: { body: datos().mensaje_698 } } }, { store: st, fetchImpl, debounceMs: 0 });
  assert.strictEqual(st.chats().find((c) => c.telefono === '5491100000079').origen, '698');
  const e = embudo(st, OWNER);
  assert.strictEqual(e.del698, 1);
  assert.strictEqual(e.anuncio.chats, 0);
  assert.match(e.texto, /Desde el 698 \(link del automático\): 1 llegaron al bot/);
});

test('el link del automático del 698 lleva el texto de negocio.json', () => {
  const fs = require('fs'); const path = require('path');
  const { datos } = require('../src/negocio');
  const txt = fs.readFileSync(path.join(__dirname, '../ycloud-agent/whatsapp_698_bienvenida.txt'), 'utf8');
  assert.ok(txt.includes(`https://wa.me/${datos().whatsapp_bot}?text=${encodeURIComponent(datos().mensaje_698)}`));
});

test('el 3034 (WhatsApp personal de Gustavo) tampoco cuenta como cliente', () => {
  const { embudo, esGustavo } = require('../bot/recordatorios');
  const st = crearStore(null);
  st.guardarLead('5492213033034', { producto: 'prueba' });
  st.guardarLead('5491100000099', { producto: 'real' });
  assert.ok(esGustavo('5492213033034', OWNER));
  assert.strictEqual(embudo(st, OWNER).consultas, 1);
});

test('página de charlas: muestra clientes con su charla, marca los del anuncio y oculta los números de Gustavo', () => {
  const { paginaCharlas } = require('../bot/recordatorios');
  const st = crearStore(null);
  st.agregar('5491100000055', 'user', 'Hola, quiero cotizar un envío desde China');
  st.agregar('5491100000055', 'assistant', [{ type: 'text', text: '¡Hola! ¿Qué producto querés traer?' }, { type: 'tool_use', id: 'x', name: 'cotizar', input: {} }]);
  st.marcar('5491100000055', { origen: 'anuncio' });
  st.agregar('5492213033034', 'user', 'prueba de Gustavo');
  const html = paginaCharlas(st, OWNER);
  assert.match(html, /5491100000055/);
  assert.match(html, /Del anuncio/);
  assert.match(html, /¿Qué producto querés traer\?/);
  assert.doesNotMatch(html, /5492213033034|prueba de Gustavo|tool_use/);
});

test('empujón: uno solo, entre 4 y 22 h, de 9 a 21, después de un mensaje del bot; nunca a Gustavo ni a pausados', () => {
  const { paraEmpujar } = require('../bot/recordatorios');
  const st = crearStore(null);
  st.agregar('5491100000061', 'user', 'Hola, quiero cotizar'); st.agregar('5491100000061', 'assistant', '¿Qué producto querés traer?');
  st.agregar('5491100000062', 'user', 'remeras'); st.agregar('5491100000062', 'assistant', 'Presupuesto...'); st.guardarLead('5491100000062', { estado: 'cotizado', precio_usd: 145 });
  st.agregar('5491100000063', 'user', 'hola'); st.agregar('5491100000063', 'assistant', 'hola'); st.pausar('5491100000063', 'derivado');
  st.agregar('5492213033034', 'user', 'prueba'); st.agregar('5492213033034', 'assistant', 'ok');
  st.agregar('5491100000064', 'user', 'último es del cliente');
  const base = Date.now();
  const a15 = base + 5 * 3600e3; // 5 h después
  const horaArg = (t) => (new Date(t - 3 * 3600e3)).getUTCHours();
  // Buscar un momento 5 h después que caiga entre 9 y 21 h de Argentina.
  let t = a15; while (horaArg(t) < 9 || horaArg(t) >= 21) t += 3600e3;
  const pasaron = (t - base) / 3600e3;
  const r = paraEmpujar(st, OWNER, t);
  if (pasaron <= 22) {
    assert.deepStrictEqual(r.map((x) => x.telefono).sort(), ['5491100000061', '5491100000062']);
    assert.strictEqual(r.find((x) => x.telefono === '5491100000062').cotizado, true);
    st.marcar('5491100000061', { empujonEn: t });
    assert.ok(!paraEmpujar(st, OWNER, t + 60e3).some((x) => x.telefono === '5491100000061'));
  }
  assert.deepStrictEqual(paraEmpujar(st, OWNER, base + 3600e3), []); // antes de 4 h, nada
  assert.deepStrictEqual(paraEmpujar(st, OWNER, base + 23 * 3600e3), []); // pasada la ventana, nada
});

test('empujón: la IA recibe la charla y escribe un mensaje que queda en el historial', async () => {
  const { empujon } = require('../bot/agent');
  const st = crearStore(null);
  st.agregar('5491100000071', 'user', 'remeras'); st.agregar('5491100000071', 'assistant', 'Presupuesto: USD 145');
  let cuerpo;
  const fetchImpl = async (u, o) => { cuerpo = JSON.parse(o.body); return { ok: true, json: async () => ({ content: [{ type: 'text', text: '¿Te quedó alguna duda con el presupuesto?' }] }) }; };
  const txt = await empujon({ telefono: '5491100000071', store: st, horas: 6, cotizado: true, fetchImpl });
  assert.strictEqual(txt, '¿Te quedó alguna duda con el presupuesto?');
  assert.deepStrictEqual(cuerpo.tool_choice, { type: 'none' });
  assert.match(cuerpo.messages.at(-1).content, /Sistema, no lo escribió el cliente/);
  assert.strictEqual(st.historial('5491100000071').at(-1).content, txt);
});

test('anuncio clic a WhatsApp: el mensaje con datos del anuncio (referral) marca el chat como del anuncio', async () => {
  const st = crearStore(null);
  st.pausar('5491100000079', 'manual');
  const fetchImpl = async () => ({ ok: true, json: async () => ({}), text: async () => '' });
  await procesar({ type: 'whatsapp.inbound_message.received', whatsappInboundMessage: { id: 'ref1', from: '+5491100000079', type: 'text', text: { body: 'Hola' }, referral: { sourceId: '120252806', sourceType: 'ad' } } }, { store: st, fetchImpl, debounceMs: 0 });
  const c = st.chats().find((x) => x.telefono === '5491100000079');
  assert.strictEqual(c.origen, 'anuncio');
  assert.strictEqual(c.anuncioId, '120252806');
});

test('los códigos de verificación de Meta (+44 7974 905090) no se contestan ni se derivan', async () => {
  const st = crearStore(null);
  const llamadas = [];
  const fetchImpl = async (u) => { llamadas.push(String(u)); return { ok: true, json: async () => ({}), text: async () => '' }; };
  await procesar({ type: 'whatsapp.inbound_message.received', whatsappInboundMessage: { id: 'meta1', from: '+447974905090', type: 'unsupported' } }, { store: st, fetchImpl, debounceMs: 0 });
  assert.strictEqual(llamadas.length, 0);
  assert.ok(!st.chats().some((c) => c.telefono === '447974905090' && (c.mensajes || []).length));
});

test('empujón: nunca al que dijo que no (15/11)', () => {
  const { paraEmpujar } = require('../bot/recordatorios');
  const st = crearStore(null);
  st.agregar('5491100000081', 'user', 'no graciass igualmente'); st.agregar('5491100000081', 'assistant', 'Entendido, gracias por escribir.');
  st.agregar('5491100000082', 'user', 'ropa'); st.agregar('5491100000082', 'assistant', 'No la podemos traer.'); st.guardarLead('5491100000082', { estado: 'rechazado' });
  st.agregar('5491100000083', 'user', 'remeras'); st.agregar('5491100000083', 'assistant', '¿Para vender?');
  let t = Date.now() + 5 * 3600e3;
  const horaArg = (x) => (new Date(x - 3 * 3600e3)).getUTCHours();
  while (horaArg(t) < 9 || horaArg(t) >= 21) t += 3600e3;
  if ((t - Date.now()) / 3600e3 > 22) return;
  const r = paraEmpujar(st, OWNER, t).map((x) => x.telefono);
  assert.ok(!r.includes('5491100000081'));
  assert.ok(!r.includes('5491100000082'));
  assert.ok(r.includes('5491100000083'));
});

test('charlas: Gustavo le contesta al cliente desde la página (sale por el 6773 y el bot se calla) (15/11)', async () => {
  const fs = require('fs'); const os = require('os'); const path = require('path');
  const archivo = path.join(os.tmpdir(), `pb-resp-${process.pid}.json`);
  const ahora = Date.now();
  fs.writeFileSync(archivo, JSON.stringify({ vistos: [], leads: {}, chats: {
    '5492364652566': { mensajes: [{ role: 'user', content: 'podriamos cotizar maritimo?' }, { role: 'assistant', content: 'Te escribe nuestro despachante.' }], ultimo: ahora - 3600e3, ultimoClienteEn: ahora - 3600e3, pausadoHasta: 0 },
    '5491100000777': { mensajes: [{ role: 'user', content: 'hola' }, { role: 'assistant', content: '¿Qué querés traer?' }], ultimo: ahora - 30 * 3600e3, ultimoClienteEn: ahora - 30 * 3600e3, pausadoHasta: 0 },
  } }));
  process.env.ADMIN_KEY = 'clave-secreta'; process.env.OWNER_NUMBER = OWNER; process.env.DATA_FILE = archivo;
  process.env.YCLOUD_API_KEY = 'yc'; process.env.BUSINESS_NUMBER = '5492216826773';
  delete require.cache[require.resolve('../bot/server')];
  const srv = require('../bot/server');
  const s = srv.servidor().listen(0); await new Promise((r) => s.once('listening', r));
  const base = `http://127.0.0.1:${s.address().port}`;
  const fetchReal = globalThis.fetch;
  const enviados = [];
  try {
    const pag = await (await fetchReal(`${base}/charlas?t=${srv.firma('charlas')}`)).text();
    assert.match(pag, /Enviar desde el 6773/);
    assert.match(pag, /Pasaron más de 24 h/); // el de 30 h no tiene caja
    assert.strictEqual((await fetchReal(`${base}/responder?tel=5492364652566&t=mal`, { method: 'POST', body: 'texto=hola' })).status, 401);
    // WhatsApp (YCloud) simulado: solo se intercepta la llamada a YCloud.
    globalThis.fetch = async (url, opt) => { if (String(url).includes('ycloud')) { enviados.push(JSON.parse(opt.body)); return { ok: true, text: async () => '' }; } return fetchReal(url, opt); };
    const r = await fetchReal(`${base}/responder?tel=5492364652566&t=${srv.firma('responder:5492364652566')}`, { method: 'POST', body: new URLSearchParams({ texto: 'Hola, soy Gustavo. Te paso una opción.' }), redirect: 'manual' });
    assert.strictEqual(r.status, 303);
    assert.match(r.headers.get('location'), /ok=1/);
    assert.strictEqual(enviados[0].to, '+5492364652566');
    assert.strictEqual(enviados[0].from, '+5492216826773');
    const pag2 = await (await fetchReal(`${base}/charlas?t=${srv.firma('charlas')}&abierto=5492364652566&ok=1`)).text();
    assert.match(pag2, /Vos:<\/b> Hola, soy Gustavo/);
    assert.match(pag2, /Mensaje enviado/);
    // Fuera de la ventana de 24 h no se manda.
    const v = await fetchReal(`${base}/responder?tel=5491100000777&t=${srv.firma('responder:5491100000777')}`, { method: 'POST', body: new URLSearchParams({ texto: 'hola' }), redirect: 'manual' });
    assert.match(v.headers.get('location'), /error=/);
    assert.strictEqual(enviados.length, 1);
  } finally { globalThis.fetch = fetchReal; s.close(); delete process.env.YCLOUD_API_KEY; }
});

test('prueba completa: solo con firma, e informe inexistente da 404', async () => {
  process.env.ADMIN_KEY = 'clave-secreta'; process.env.OWNER_NUMBER = OWNER; process.env.DATA_FILE = require('path').join(require('os').tmpdir(), `pb-pc-${process.pid}.json`);
  delete require.cache[require.resolve('../bot/server')];
  const srv = require('../bot/server');
  const s = srv.servidor().listen(0); await new Promise((r) => s.once('listening', r));
  const base = `http://127.0.0.1:${s.address().port}`;
  try {
    assert.strictEqual((await fetch(`${base}/prueba-completa?t=mal`, { method: 'POST' })).status, 401);
    assert.strictEqual((await fetch(`${base}/informe/${'0'.repeat(32)}`)).status, 404);
    const pag = await (await fetch(`${base}/pendientes?t=${srv.firma('pendientes')}`)).text();
    assert.match(pag, /Correr prueba completa/);
  } finally { s.close(); }
});

test('cotizador a mano del nomenclador: con clave, mismo resultado que el bot, peso volumétrico y avisos para Gustavo (15/11)', async () => {
  process.env.ADMIN_KEY = 'clave-secreta'; process.env.DATA_FILE = require('path').join(require('os').tmpdir(), `pb-cot-${process.pid}.json`);
  delete require.cache[require.resolve('../bot/server')];
  const srv = require('../bot/server');
  const s = srv.servidor().listen(0); await new Promise((r) => s.once('listening', r));
  const base = `http://127.0.0.1:${s.address().port}`;
  try {
    assert.strictEqual((await fetch(`${base}/nomenclador/api/cotizar?valor=200&kg=25`)).status, 401);
    const r = await (await fetch(`${base}/nomenclador/api/cotizar?key=clave-secreta&valor=800&kg=18&cajas=2&largo=60&ancho=40&alto=40&unidades=40&die=20`)).json();
    const { ejecutar } = require('../bot/tools');
    const bot = ejecutar('cotizar', { kg: 18, cantidad_cajas: 2, largo_cm: 60, ancho_cm: 40, alto_cm: 40, valor_factura_usd: 800, die: 20, regimen: 'comercial', unidades: 40 }, { telefono: 'x', store: crearStore(null), derivaciones: [] });
    assert.strictEqual(r.total_puertobox_usd, bot.total_puertobox_usd);
    assert.strictEqual(r.costo_por_unidad_usd, bot.costo_por_unidad_usd);
    assert.strictEqual(r.peso_volumetrico_kg, 38.4);
    assert.strictEqual(r.kg_presupuestado, 39);
    assert.ok(r.avisos.some((a) => /se cobra por volumen/.test(a)));
    assert.ok(!r.avisos.some((a) => /Decíselo/.test(a)));
    const html = await (await fetch(`${base}/nomenclador/?key=clave-secreta`)).text();
    assert.match(html, /Cotizador PuertoBox/);
    // Presupuesto tipo comprobante: no válido como factura, total a PuertoBox separado de los impuestos, sin "si pesa menos paga menos".
    assert.match(html, /Documento no válido como factura/);
    assert.match(html, /TOTAL A ABONAR A PUERTOBOX/);
    assert.match(html, /no los cobra PuertoBox/);
    assert.doesNotMatch(html, /más liviana|pesa menos/);
  } finally { s.close(); }
});

test('charlas: si el cliente manda un archivo, se ve solo el archivo (sin la lectura de la IA) — Gustavo 15/11 21:33', () => {
  const { vistaCliente, paginaCharlas: pagina } = require('../bot/recordatorios');
  const media = '/media/' + 'a'.repeat(32) + '.pdf';
  const leido = `[El cliente mandó un archivo (Packing list.pdf), leído automáticamente. Escribió: "Packing list.pdf". [archivo:${media}]]\nEs un packing list de PHYSIOTAPING con 9 ítems...`;
  assert.strictEqual(vistaCliente(leido), `📎 Packing list.pdf\n[archivo:${media}]`);
  const xlsx = `[El cliente mandó un archivo (PI26-W01-Gian.xlsx) que no se pudo leer automáticamente. Escribió: "PI26-W01-Gian.xlsx". [archivo:/media/${'b'.repeat(32)}.xlsx] Nuestro despachante lo puede ver. Pedile por texto los datos que falten.]`;
  assert.strictEqual(vistaCliente(xlsx), `📎 PI26-W01-Gian.xlsx\n[archivo:/media/${'b'.repeat(32)}.xlsx]`);
  const foto = `[El cliente mandó una imagen, leída automáticamente. Escribió: "estas son las cajas". [archivo:/media/${'c'.repeat(32)}.jpg]]\nSe ven dos cajas...`;
  assert.strictEqual(vistaCliente(foto), `📷 Imagen\n[archivo:/media/${'c'.repeat(32)}.jpg]\nestas son las cajas`);
  assert.strictEqual(vistaCliente('hola, quiero traer cintas'), 'hola, quiero traer cintas');
  // En la página: el link al archivo sí, la lectura y las instrucciones para el bot no.
  const st = crearStore(null);
  st.agregar('5491100000077', 'user', leido);
  st.agregar('5491100000077', 'user', xlsx);
  const html = pagina(st, OWNER, Date.now());
  assert.match(html, /Packing list\.pdf/);
  assert.match(html, /Abrir el archivo \(PDF\)/);
  assert.doesNotMatch(html, /Es un packing list de PHYSIOTAPING/);
  assert.doesNotMatch(html, /Pedile por texto|leído automáticamente/);
});

test('charlas: lo que el cliente escribió y Gustavo no vio va en rojo y arriba; al abrirla deja de serlo (15/11 21:40)', () => {
  const { paginaCharlas: pagina } = require('../bot/recordatorios');
  const st = crearStore(null);
  st.meta('vistoBase', 1); // como si la página ya existiera antes
  st.agregar('5491100000081', 'user', 'charla vieja');
  st.marcarVisto('5491100000081');
  st.agregar('5491100000082', 'user', 'hola, ¿me pasás el presupuesto?');
  st.agregar('5491100000082', 'user', 'te mando la factura');
  const h = pagina(st, OWNER, Date.now() + 1000, 3, null, null, '', null, null, (tel) => `/visto?tel=${tel}&t=x`);
  assert.match(h, /🔴 2 mensajes nuevos/);
  assert.match(h, /1 cliente te escribió/);
  assert.ok(h.indexOf('5491100000082') < h.indexOf('5491100000081'), 'el que tiene mensajes nuevos va primero');
  assert.match(h, /class="m cliente nuevo"/);
  assert.match(h, /data-visto="\/visto\?tel=5491100000082&amp;t=x"/);
  st.marcarVisto('5491100000082', Date.now() + 2000);
  const h2 = pagina(st, OWNER, Date.now() + 3000);
  assert.doesNotMatch(h2, /mensajes? nuevos?/);
});

test('"Ya lo atendí" también saca a un cliente de "Presupuesto enviado, no volvieron a escribir" (Nusse, 15/11 21:44)', () => {
  const ahora = TARDE;
  const st = crearStore(null);
  st.marcar('5491100000091', { ultimoClienteEn: ahora - 33 * H });
  st.guardarLead('5491100000091', { estado: 'cotizado' });
  assert.strictEqual(pendientes(st, OWNER, ahora).seguimiento.length, 1);
  st.marcar('5491100000091', { gustavoRespondioEn: ahora - H });
  assert.strictEqual(pendientes(st, OWNER, ahora).seguimiento.length, 0, 'marcado como atendido: sale de la lista');
  st.marcar('5491100000091', { ultimoClienteEn: ahora - 30 * H + 4 * H }); // el cliente vuelve a escribir después
  st.marcar('5491100000091', { gustavoRespondioEn: ahora - 30 * H });
  assert.strictEqual(pendientes(st, OWNER, ahora).seguimiento.length, 1, 'si el cliente escribe de nuevo, vuelve');
});
