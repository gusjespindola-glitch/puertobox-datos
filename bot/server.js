'use strict';
/**
 * Servidor del bot de WhatsApp. Funciona con YCloud (si hay YCLOUD_API_KEY) o directo con la Cloud API de Meta.
 * - Responde a los clientes con el agente.
 * - Si Gustavo escribe desde la app en un chat (eco smb_message_echoes), el bot se pausa en ese chat.
 * - Cuando el agente deriva, avisa a Gustavo a su número personal.
 * Comandos de Gustavo (escritos desde la app en el chat del cliente): "#bot" reanuda el bot en ese chat.
 */
const http = require('http');
const path = require('path');
const { crearStore } = require('./store');
const { responder } = require('./agent');

const {
  PORT = 3000, VERIFY_TOKEN, WHATSAPP_TOKEN, PHONE_NUMBER_ID, OWNER_NUMBER,
  DATA_FILE = path.join(__dirname, 'data.json'), ADMIN_KEY, YCLOUD_API_KEY, BUSINESS_NUMBER,
} = process.env;
const soloDigitos = (t) => String(t || '').replace(/\D/g, '');
const GRAPH = 'https://graph.facebook.com/v21.0';
const store = crearStore(DATA_FILE);

// Mensajes que mandó el bot por Instagram: su eco no debe pausar el chat.
const enviadosIG = new Set();
// El token de Instagram vence a los 60 días: se renueva solo una vez por día y se guarda junto a los datos.
const IG_TOKEN_FILE = path.join(path.dirname(DATA_FILE), 'ig_token.json');
function tokenIG() {
  try { return JSON.parse(require('fs').readFileSync(IG_TOKEN_FILE, 'utf8')).token || process.env.IG_TOKEN; } catch { return process.env.IG_TOKEN; }
}
async function renovarTokenIG(fetchImpl = fetch) {
  const actual = tokenIG(); if (!actual) return;
  try {
    const r = await fetchImpl(`https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(actual)}`);
    if (!r.ok) { console.error('No se pudo renovar el token de Instagram', r.status); return; }
    const j = await r.json();
    if (j.access_token) require('fs').writeFileSync(IG_TOKEN_FILE, JSON.stringify({ token: j.access_token, renovado: new Date().toISOString() }));
  } catch (e) { console.error('Renovar token IG:', e.message); }
}
async function enviarInstagram(id, body, fetchImpl) {
  const token = tokenIG();
  if (!token) { console.error('Falta IG_TOKEN'); return; }
  const partes = String(body).match(/[\s\S]{1,950}(\s|$)/g) || [String(body)]; // Instagram: máx. 1000 caracteres
  for (const texto of partes) {
    enviadosIG.add(texto.trim());
    const r = await fetchImpl('https://graph.instagram.com/v21.0/me/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ recipient: { id }, message: { text: texto.trim() } }),
    });
    if (!r.ok) console.error('Instagram error', r.status, await r.text());
    else { try { const j = await r.json(); if (j.message_id) enviadosIG.add(j.message_id); } catch { /* sin cuerpo */ } }
  }
  if (enviadosIG.size > 500) enviadosIG.clear();
}

async function enviar(to, body, fetchImpl = fetch) {
  if (String(to).startsWith('ig:')) return enviarInstagram(String(to).slice(3), body, fetchImpl);
  if (process.env.YCLOUD_API_KEY || YCLOUD_API_KEY) {
    const r = await fetchImpl('https://api.ycloud.com/v2/whatsapp/messages/sendDirectly', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': process.env.YCLOUD_API_KEY || YCLOUD_API_KEY },
      body: JSON.stringify({ from: `+${soloDigitos(process.env.BUSINESS_NUMBER || BUSINESS_NUMBER)}`, to: `+${soloDigitos(to)}`, type: 'text', text: { body } }),
    });
    if (!r.ok) console.error('YCloud error', r.status, await r.text());
    return;
  }
  const r = await fetchImpl(`${GRAPH}/${PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${WHATSAPP_TOKEN}` },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body } }),
  });
  if (!r.ok) console.error('WhatsApp error', r.status, await r.text());
}

/** Convierte el webhook (Meta o YCloud) en una lista de eventos: { tipo: 'mensaje'|'eco', ... }. */
function normalizar(payload) {
  const ev = [];
  if (payload.type === 'whatsapp.inbound_message.received' && payload.whatsappInboundMessage) {
    const m = payload.whatsappInboundMessage;
    ev.push({ tipo: 'mensaje', id: m.wamid || m.id, from: soloDigitos(m.from), type: m.type, text: m.text, image: m.image, audio: m.audio || m.voice });
  }
  if ((payload.type === 'whatsapp.echo_message.created') && payload.whatsappMessage) {
    const m = payload.whatsappMessage;
    ev.push({ tipo: 'eco', to: soloDigitos(m.to), text: m.text });
  }
  if (payload.object === 'instagram') {
    for (const entry of payload.entry || []) {
      for (const m of entry.messaging || []) {
        const msg = m.message;
        if (!msg || msg.is_deleted) continue;
        if (msg.is_echo) {
          const t = (msg.text || '').trim();
          if (enviadosIG.has(msg.mid) || enviadosIG.has(t)) continue; // eco del propio bot
          ev.push({ tipo: 'eco', to: `ig:${m.recipient.id}`, text: { body: t } });
          continue;
        }
        if (msg.text) ev.push({ tipo: 'mensaje', id: msg.mid, from: `ig:${m.sender.id}`, type: 'text', text: { body: msg.text } });
        else ev.push({ tipo: 'mensaje', id: msg.mid, from: `ig:${m.sender.id}`, type: (msg.attachments?.[0]?.type) || 'adjunto', text: null, audio: msg.attachments?.[0]?.type === 'audio' ? { link: msg.attachments[0].payload?.url } : undefined });
      }
    }
    return ev;
  }
  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      const v = change.value || {};
      for (const eco of v.message_echoes || []) ev.push({ tipo: 'eco', to: soloDigitos(eco.to), text: eco.text });
      for (const msg of v.messages || []) ev.push({ tipo: 'mensaje', id: msg.id, from: soloDigitos(msg.from), type: msg.type, text: msg.text, image: msg.image });
    }
  }
  return ev;
}

/**
 * Audios: se pasan a texto con Whisper en Groq (plan gratis, sin tarjeta). Necesita GROQ_API_KEY en Railway.
 * Sin clave, o si algo falla, devuelve null y el bot le pide al cliente que lo escriba (como antes).
 */
async function transcribirAudio(audio, fetchImpl = fetch) {
  const clave = process.env.GROQ_API_KEY;
  if (!clave || !audio || !audio.link) return null;
  try {
    const headers = /api\.ycloud\.com/.test(audio.link) ? { 'X-API-Key': process.env.YCLOUD_API_KEY || YCLOUD_API_KEY } : {};
    const r = await fetchImpl(audio.link, { headers });
    if (!r.ok) { console.error('Audio: no se pudo descargar', r.status); return null; }
    const datos = await r.arrayBuffer();
    if (!datos.byteLength || datos.byteLength > 24e6) return null; // tope del plan gratis: 25 MB
    const form = new FormData();
    form.append('file', new Blob([datos], { type: audio.mime_type || 'audio/ogg' }), 'audio.ogg');
    form.append('model', 'whisper-large-v3-turbo');
    form.append('language', 'es');
    form.append('response_format', 'json');
    const t = await fetchImpl('https://api.groq.com/openai/v1/audio/transcriptions', { method: 'POST', headers: { authorization: `Bearer ${clave}` }, body: form });
    if (!t.ok) { console.error('Audio: Groq respondió', t.status, await t.text()); return null; }
    const texto = String((await t.json()).text || '').trim();
    return texto || null;
  } catch (err) { console.error('Audio:', err.message); return null; }
}

/** Aviso solo por ntfy (recordatorios y resumen): no gasta mensajes de WhatsApp. */
async function avisarNtfy(texto, titulo = 'PuertoBox', prioridad = 'default', fetchImpl = fetch, tel = null) {
  const topic = process.env.NTFY_TOPIC;
  if (!topic) return;
  const headers = { Title: titulo, Priority: prioridad };
  const acciones = accionesNtfy(tel);
  if (acciones) headers.Actions = acciones;
  try {
    await fetchImpl(`https://ntfy.sh/${encodeURIComponent(topic)}`, { method: 'POST', headers, body: texto });
  } catch (e) { console.error('ntfy error', e.message); }
}

/**
 * Botones en la notificación (pedido del 14/11: nada de comandos para acordarse).
 * "Ya lo atendí" marca al cliente sin abrir nada; "Ver pendientes" abre la lista con un botón por cliente.
 * Los links llevan una firma por cliente (HMAC con ADMIN_KEY), nunca la clave.
 */
const BASE_URL = () => process.env.PUBLIC_URL || `https://${require('../src/negocio').datos().dominio}`;
function firma(que) {
  const clave = process.env.ADMIN_KEY || ADMIN_KEY;
  return clave ? require('crypto').createHmac('sha256', clave).update(String(que)).digest('hex').slice(0, 24) : null;
}
function firmaOk(que, dada) {
  const f = firma(que);
  return !!(f && dada && f.length === String(dada).length && require('crypto').timingSafeEqual(Buffer.from(f), Buffer.from(String(dada))));
}
function accionesNtfy(tel) {
  const fp = firma('pendientes');
  if (!fp) return null;
  const ver = `view, Ver pendientes, ${BASE_URL()}/pendientes?t=${fp}`;
  if (!tel) return ver;
  return `http, Ya lo atendí, ${BASE_URL()}/atendido?tel=${encodeURIComponent(tel)}&t=${firma('atendido:' + tel)}, method=POST, clear=true; ${ver}`;
}

/**
 * Entiende pedidos cortos de Gustavo sin que tenga que acordarse el comando exacto (pedido del 14/11).
 * Devuelve el comando ("#borrar", "#pendientes") o null si es un mensaje normal (por ejemplo, probando como cliente).
 */
function intencionGustavo(texto) {
  const t = String(texto || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[.!¡¿?,]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t) return null;
  if (/^#?\s*(borrar|borra|borra todo|borrar todo|borrar (la |mi )?(conversacion|chat)|borra (la |mi )?(conversacion|chat)|reiniciar|reinicia|reset|resetear|empezar de nuevo|empecemos de nuevo|arrancar de nuevo|nueva conversacion|limpiar( el chat)?)$/.test(t)) return '#borrar';
  if (/^#?\s*(pendientes|que tengo pendiente|quien me falta( atender)?|a quien me falta( contestar| atender)?)$/.test(t)) return '#pendientes';
  return null;
}

/**
 * Aviso a Gustavo por UN solo canal (pedido del 14/11: no duplicar).
 * Si hay NTFY_TOPIC, solo ntfy (llega siempre y no gasta WhatsApp). Si no, WhatsApp al 698 (solo llega si le escribió al bot en las últimas 24 h).
 */
async function avisarGustavo(owner, texto, fetchImpl = fetch, titulo = 'PuertoBox: cliente para atender', tel = null) {
  if (process.env.NTFY_TOPIC) return avisarNtfy(texto, titulo, 'high', fetchImpl, tel);
  if (owner) await enviar(owner, texto, fetchImpl);
}

// Agrupa los mensajes que el cliente manda seguidos y responde una sola vez, de a un chat por vez.
const DEBOUNCE_MS = Number(process.env.DEBOUNCE_MS || 6000);
const pendientes = new Map(); // tel -> { textos: [], timer }
const colas = new Map(); // tel -> Promise
const avisoSaldo = { ultimo: 0 };

async function procesar(payload, deps = {}) {
  const fetchImpl = deps.fetchImpl || fetch;
  const st = deps.store || store;
  const owner = soloDigitos(process.env.OWNER_NUMBER || OWNER_NUMBER);
  const salidas = [];
  for (let e of normalizar(payload)) {
    if (e.tipo === 'eco') {
      // Gustavo respondió desde la app o la bandeja → pausar el bot en ese chat
      const txt = e.text?.body?.trim().toLowerCase();
      if (txt === '#bot') st.reanudar(e.to); else st.pausar(e.to, 'gustavo_respondio');
      if (e.text?.body && txt !== '#bot') st.agregar(e.to, 'assistant', `[Gustavo] ${e.text.body}`);
      if (st.marcar) st.marcar(e.to, { gustavoRespondioEn: Date.now(), recordatorios: 0 });
      continue;
    }
    if (st.yaVisto(e.id)) continue;
    const tel = e.from;
    // Pedidos simples de Gustavo desde su número (texto o audio, con o sin #): "borrar", "reiniciar", "empezar de nuevo", "pendientes".
    if (owner && tel === owner) {
      const dicho = e.type === 'text' ? e.text.body : (e.audio ? (e.transcripto = await transcribirAudio(e.audio, fetchImpl)) : '');
      const intencion = intencionGustavo(dicho);
      if (intencion) e = { ...e, type: 'text', text: { body: intencion } };
    }
    // Comandos de Gustavo desde su número personal: "#pausa 549..." o "#bot 549..."
    if (owner && tel === owner && e.type === 'text' && e.text.body.trim().startsWith('#')) {
      const [cmd, num] = e.text.body.trim().replace(/^#\s+/, '#').replace(/[.!¡¿?]+$/, '').split(/\s+/);
      const cliente = soloDigitos(num);
      let r = 'Comandos: #pendientes (clientes que esperan respuesta) · #listo 549XXXXXXXXXX (ya lo atendiste: deja de recordártelo) · #borrar (borra tu chat de prueba) · #borrar 549XXXXXXXXXX (borra el de un cliente) · #pausa 549XXXXXXXXXX (callar el bot en ese chat) · #bot 549XXXXXXXXXX (reactivarlo)';
      if (cmd.toLowerCase() === '#pendientes') r = require('./recordatorios').textoPendientes(st, owner);
      if (cmd.toLowerCase() === '#listo' && cliente) { st.marcar(cliente, { gustavoRespondioEn: Date.now(), recordatorios: 0 }); r = `Listo, +${cliente} marcado como atendido. No te lo recuerdo más (salvo que vuelva a escribir).`; }
      if (cmd.toLowerCase() === '#borrar') { const t = cliente || owner; st.borrar(t); r = t === owner ? 'Listo, borré tu conversación. Escribí de nuevo como si fueras un cliente nuevo.' : `Listo, borré la conversación con +${t}.`; }
      if (cmd.toLowerCase() === '#pausa' && cliente) { st.pausar(cliente, 'manual'); r = `Bot pausado con +${cliente}.`; }
      if (cmd.toLowerCase() === '#bot' && cliente) { st.reanudar(cliente); r = `Bot reactivado con +${cliente}.`; }
      await enviar(owner, r, fetchImpl); salidas.push({ to: owner, body: r });
      continue;
    }
    const transcripto = e.transcripto !== undefined ? e.transcripto : (e.audio ? await transcribirAudio(e.audio, fetchImpl) : null); // no transcribir dos veces
    const texto = e.type === 'text' ? e.text.body
      : transcripto ? `[Audio del cliente, pasado a texto automáticamente] ${transcripto}`
      : `[El cliente mandó un ${e.type}${e.image?.caption ? `: ${e.image.caption}` : ''}. Pedile que lo describa por texto o derivá si hace falta.]`;
    if (st.estaPausado(tel)) {
      st.agregar(tel, 'user', texto);
      // Chat derivado a Gustavo: nunca clavar el visto. Aviso de espera, como mucho uno cada 3 horas.
      if (st.motivoPausa(tel) === 'derivado' && st.avisoEsperaVencido(tel, 3)) {
        const r = 'Tu consulta ya está con Gustavo, nuestro despachante de aduana, y te va a escribir a la brevedad. Si querés, podés dejar acá cualquier dato adicional.';
        await enviar(tel, r, fetchImpl); salidas.push({ to: tel, body: r });
      }
      continue;
    }
    const espera = deps.debounceMs ?? DEBOUNCE_MS;
    if (espera > 0) {
      const p = pendientes.get(tel) || { textos: [] };
      p.textos.push(texto); clearTimeout(p.timer);
      p.timer = setTimeout(() => {
        pendientes.delete(tel);
        const junto = p.textos.join('\n');
        const previa = colas.get(tel) || Promise.resolve();
        const tarea = previa.then(() => atender(tel, junto, st, fetchImpl, owner)).catch((e) => console.error(e));
        colas.set(tel, tarea);
      }, espera);
      pendientes.set(tel, p);
      continue;
    }
    salidas.push(...(await atender(tel, texto, st, fetchImpl, owner)));
  }
  return salidas;
}

const TOPE_DIARIO = Number(process.env.TOPE_MENSAJES_DIA || 60);
async function atender(tel, texto, st, fetchImpl, owner) {
  const salidas = [];
  // Tope de respuestas del bot por chat por día: si alguien manda mensajes sin parar, se pausa ese chat y se avisa una vez.
  if (tel !== owner && st.contarRespuesta && st.contarRespuesta(tel) > TOPE_DIARIO) { // Gustavo probando desde su número no tiene tope
    st.pausar(tel, 'derivado');
    if (st.marcar) st.marcar(tel, { derivadoEn: Date.now(), derivadoMotivo: 'pide_humano', derivadoResumen: `Más de ${TOPE_DIARIO} mensajes hoy: pausé el bot en este chat para cuidar el saldo.`, recordatorios: 0 });
    const aviso = `⚠️ PuertoBox: el cliente +${tel} mandó más de ${TOPE_DIARIO} mensajes hoy. Pausé el bot en ese chat para cuidar el saldo.`;
    await avisarGustavo(owner, aviso, fetchImpl, 'PuertoBox: chat pausado por exceso de mensajes', tel);
    return [{ to: owner, body: aviso }];
  }
  {
    const derivaciones = [];
    let resp;
    try {
      resp = await responder({ telefono: tel, texto, store: st, fetchImpl, derivaciones });
    } catch (err) {
      console.error(err);
      const msg = String(err && err.message);
      if (/credit balance|billing|\b401\b|invalid x-api-key|authentication/i.test(msg)) {
        // Sin saldo o clave inválida: el cliente no queda colgado y Gustavo se entera (una vez cada 3 horas).
        resp = 'Gracias por escribir a PuertoBox. En este momento te va a responder Gustavo, nuestro despachante de aduana, a la brevedad.';
        if (!avisoSaldo.ultimo || Date.now() - avisoSaldo.ultimo > 3 * 3600e3) {
          avisoSaldo.ultimo = Date.now();
          const que = /credit balance|billing/i.test(msg) ? 'se quedó SIN SALDO en Anthropic. Cargá crédito en platform.claude.com (Facturación).' : 'la clave de Anthropic no funciona. Revisá ANTHROPIC_API_KEY en Railway.';
          await avisarGustavo(owner, `⚠️ PuertoBox: el bot ${que} Mientras tanto los clientes reciben un mensaje de espera. Último cliente: ${tel}`, fetchImpl);
        }
      } else {
        resp = 'Disculpá, tuvimos un inconveniente momentáneo. ¿Me podés repetir tu último mensaje?';
      }
    }
    if (resp) { await enviar(tel, resp, fetchImpl); salidas.push({ to: tel, body: resp }); }
    for (const d of derivaciones) {
      const esIG = String(d.telefono).startsWith('ig:');
      const aviso = esIG
        ? `🔔 PuertoBox (Instagram): ${d.motivo.replace(/_/g, ' ')}\n${d.resumen}\n(Respondele desde los mensajes de Instagram de PuertoBox. El bot quedó pausado en ese chat; para reactivarlo escribí #bot en ese mismo chat.)`
        : `🔔 PuertoBox: ${d.motivo.replace(/_/g, ' ')}\nCliente: +${d.telefono}\n${d.resumen}\n(El bot quedó pausado en ese chat. Para reactivarlo mandá: #bot ${d.telefono})`;
      await avisarGustavo(owner, aviso, fetchImpl, undefined, d.telefono);
      salidas.push({ to: owner, body: aviso });
    }
  }
  return salidas;
}

/**
 * Verifica la firma de YCloud: header "YCloud-Signature: t=TIMESTAMP,s=FIRMA", FIRMA = HMAC-SHA256(secreto, `${t}.${cuerpo}`) en hex.
 * Sin secreto configurado acepta todo (como antes). Rechaza firmas de más de 5 minutos (reenvíos de mensajes viejos).
 */
function firmaYCloudOk(header, raw, secreto, ahora = Date.now()) {
  if (!secreto) return true;
  const partes = Object.fromEntries(String(header || '').split(',').map((p) => p.trim().split('=')));
  const t = Number(partes.t);
  if (!partes.s || !t || Math.abs(ahora / 1000 - t) > 300) return false;
  const crypto = require('crypto');
  const esperada = crypto.createHmac('sha256', secreto).update(`${partes.t}.${raw}`).digest('hex');
  return esperada.length === partes.s.length && crypto.timingSafeEqual(Buffer.from(esperada), Buffer.from(partes.s));
}

// Nomenclador PuertoBox (web/nomenclador) protegido con ADMIN_KEY: se entra una vez con ?key=... y queda guardado en una cookie.
const fs = require('fs');
const paginas = require('../src/paginas');
const WEB = path.join(__dirname, '..', 'web', 'nomenclador');
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8' };
function servirNomenclador(req, res, url) {
  const clave = process.env.ADMIN_KEY || ADMIN_KEY;
  const cookie = /(?:^|;\s*)pbk=([^;]+)/.exec(req.headers.cookie || '');
  const dada = url.searchParams.get('key');
  if (!clave || (dada !== clave && !(cookie && decodeURIComponent(cookie[1]) === clave))) {
    res.writeHead(401, { 'content-type': 'text/plain; charset=utf-8' });
    return res.end('Acceso restringido. Entrá con el link que tiene la clave.');
  }
  if (url.pathname === '/nomenclador') { res.writeHead(302, { location: '/nomenclador/' + (dada ? '?key=' + encodeURIComponent(dada) : '') }); return res.end(); }
  const rel = decodeURIComponent(url.pathname.slice('/nomenclador/'.length)) || 'index.html';
  const archivo = path.normalize(path.join(WEB, rel));
  if (!archivo.startsWith(WEB + path.sep) || !fs.existsSync(archivo) || fs.statSync(archivo).isDirectory()) { res.writeHead(404); return res.end('No encontrado'); }
  const headers = { 'content-type': TIPOS[path.extname(archivo)] || 'application/octet-stream', 'cache-control': rel.startsWith('data/') ? 'public, max-age=3600' : 'no-cache' };
  if (dada === clave) headers['set-cookie'] = `pbk=${encodeURIComponent(clave)}; Path=/nomenclador; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax`;
  res.writeHead(200, headers);
  fs.createReadStream(archivo).pipe(res);
}

function servidor() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    if (req.method === 'GET' && (url.pathname === '/webhook' || url.pathname === '/instagram') && url.searchParams.has('hub.mode')) {
      const tok = url.pathname === '/instagram' ? (process.env.IG_VERIFY_TOKEN || VERIFY_TOKEN) : VERIFY_TOKEN;
      const ok = url.searchParams.get('hub.mode') === 'subscribe' && tok && url.searchParams.get('hub.verify_token') === tok;
      res.writeHead(ok ? 200 : 403); return res.end(ok ? url.searchParams.get('hub.challenge') : 'forbidden');
    }
    if (req.method === 'POST' && url.pathname === '/instagram') {
      let raw = ''; req.on('data', (c) => (raw += c));
      req.on('end', () => {
        // Sin IG_APP_SECRET no se procesa nada: si no, cualquiera podría mandar mensajes falsos y gastar el saldo de la IA.
        const secreto = process.env.IG_APP_SECRET;
        if (!secreto) { res.writeHead(503); return res.end('Instagram sin configurar (falta IG_APP_SECRET)'); }
        const firmaMeta = 'sha256=' + require('crypto').createHmac('sha256', secreto).update(raw).digest('hex');
        if (req.headers['x-hub-signature-256'] !== firmaMeta) { res.writeHead(401); return res.end('firma inválida'); }
        res.writeHead(200); res.end('ok');
        let payload = {}; try { payload = JSON.parse(raw || '{}'); } catch { return; }
        procesar(payload).catch((e) => console.error(e));
      });
      return;
    }
    if (req.method === 'GET' && url.pathname === '/webhook') {
      const ok = url.searchParams.get('hub.mode') === 'subscribe' && url.searchParams.get('hub.verify_token') === VERIFY_TOKEN;
      res.writeHead(ok ? 200 : 403); return res.end(ok ? url.searchParams.get('hub.challenge') : 'forbidden');
    }
    if (req.method === 'POST' && url.pathname === '/webhook') {
      let raw = ''; req.on('data', (c) => (raw += c));
      req.on('end', () => {
        // Firma de YCloud (si está YCLOUD_WEBHOOK_SECRET en Railway): sin esto, cualquiera podría mandar mensajes falsos
        // haciéndose pasar por un cliente o por Gustavo (#borrar, #pausa) y gastar el saldo de la IA.
        if (!firmaYCloudOk(req.headers['ycloud-signature'], raw, process.env.YCLOUD_WEBHOOK_SECRET)) { res.writeHead(401); return res.end('firma inválida'); }
        res.writeHead(200); res.end('ok'); // Meta pide responder rápido
        let payload; try { payload = JSON.parse(raw || '{}'); } catch { return; } // un cuerpo roto no puede tirar el servidor
        procesar(payload).catch((e) => console.error(e));
      });
      return;
    }
    if (url.pathname === '/atendido' && req.method === 'POST') {
      const tel = soloDigitos(url.searchParams.get('tel'));
      if (!tel || !firmaOk('atendido:' + tel, url.searchParams.get('t'))) { res.writeHead(401, { 'content-type': 'text/plain; charset=utf-8' }); return res.end('Link vencido o incorrecto.'); }
      store.marcar(tel, { gustavoRespondioEn: Date.now(), recordatorios: 0 });
      const volver = url.searchParams.get('volver');
      if (volver && firmaOk('pendientes', volver)) { res.writeHead(303, { location: `/pendientes?t=${volver}` }); return res.end(); }
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' }); return res.end(`Listo: +${tel} marcado como atendido.`);
    }
    if (req.method === 'GET' && url.pathname === '/pendientes') {
      const t = url.searchParams.get('t');
      if (!firmaOk('pendientes', t)) { res.writeHead(401, { 'content-type': 'text/plain; charset=utf-8' }); return res.end('Link vencido o incorrecto.'); }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      return res.end(require('./recordatorios').paginaPendientes(store, soloDigitos(process.env.OWNER_NUMBER || OWNER_NUMBER), (tel) => `/atendido?tel=${tel}&t=${firma('atendido:' + tel)}&volver=${t}`));
    }
    if (req.method === 'GET' && url.pathname === '/leads' && ADMIN_KEY && url.searchParams.get('key') === ADMIN_KEY) {
      const leads = store.leads();
      const cols = ['telefono', 'nombre', 'producto', 'posicion', 'kg', 'valor_usd', 'precio_usd', 'tipo', 'estado', 'notas', 'actualizado'];
      const csv = [cols.join(','), ...leads.map((l) => cols.map((c) => JSON.stringify(l[c] ?? '')).join(','))].join('\n');
      res.writeHead(200, { 'content-type': 'text/csv; charset=utf-8' }); return res.end(csv);
    }
    if (req.method === 'GET' && url.pathname === '/pruebas' && ADMIN_KEY && url.searchParams.get('key') === (process.env.ADMIN_KEY || ADMIN_KEY)) {
      // Corre el simulador de clientes con la clave de Anthropic del servidor y devuelve el informe.
      const { correrEscenarios } = require('./simulador');
      return correrEscenarios().then((txt) => { res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' }); res.end(txt); })
        .catch((e) => { res.writeHead(500); res.end('Error: ' + e.message); });
    }
    if (req.method === 'GET' && (url.pathname === '/nomenclador' || url.pathname.startsWith('/nomenclador/'))) return servirNomenclador(req, res, url);
    if (req.method === 'GET' || req.method === 'HEAD') {
      const pag = paginas.servir(url.pathname, url.searchParams);
      if (pag) { res.writeHead(200, { 'content-type': pag.tipo, 'cache-control': 'public, max-age=60, s-maxage=60' }); return res.end(req.method === 'HEAD' ? undefined : pag.cuerpo); }
      if (url.pathname.startsWith('/ncm/') || url.pathname.startsWith('/importar/')) { res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' }); return res.end(paginas.buscador('')); }
    }
    if (req.method === 'GET' && (url.pathname === '/leads' || url.pathname === '/pruebas')) {
      res.writeHead(401, { 'content-type': 'text/plain; charset=utf-8' }); return res.end('Clave incorrecta. Revisá que sea la de ADMIN_KEY en Railway.');
    }
    res.writeHead(200); res.end('PuertoBox bot ok'); // /salud y cualquier otra ruta
  });
}

if (require.main === module) {
  servidor().listen(PORT, () => console.log(`Bot escuchando en :${PORT}`));
  if (process.env.IG_TOKEN) { renovarTokenIG(); setInterval(renovarTokenIG, 24 * 3600e3).unref(); }
  // Asistente de pendientes: cada 15 minutos revisa clientes sin respuesta y manda avisos por ntfy (y el resumen de las 9).
  const { revisar } = require('./recordatorios');
  const tic = () => revisar({ store, owner: soloDigitos(process.env.OWNER_NUMBER || OWNER_NUMBER), avisar: (t, titulo, prioridad, tel) => avisarNtfy(t, titulo, prioridad, fetch, tel) }).catch((e) => console.error('Recordatorios:', e.message));
  setTimeout(tic, 60e3).unref(); setInterval(tic, 15 * 60e3).unref();
}
module.exports = { procesar, servidor, normalizar, firmaYCloudOk, transcribirAudio, avisarGustavo, accionesNtfy, firma, intencionGustavo };
