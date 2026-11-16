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

/** Manda un PDF por WhatsApp desde el 6773 (YCloud). Lo usa solo Gustavo con el botón "Enviar presupuesto". */
async function enviarDocumento(to, link, filename, caption, fetchImpl = fetch, tipo = 'document') {
  // 16/11: las fotos salen como foto (se ven en el chat); el resto, como documento con su nombre.
  const cuerpo = tipo === 'image' ? { type: 'image', image: { link, ...(caption ? { caption } : {}) } } : { type: 'document', document: { link, filename, ...(caption ? { caption } : {}) } };
  const r = await fetchImpl('https://api.ycloud.com/v2/whatsapp/messages/sendDirectly', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': process.env.YCLOUD_API_KEY || YCLOUD_API_KEY },
    body: JSON.stringify({ from: `+${soloDigitos(process.env.BUSINESS_NUMBER || BUSINESS_NUMBER)}`, to: `+${soloDigitos(to)}`, ...cuerpo }),
  });
  if (!r.ok) { const t = await r.text(); throw new Error(`YCloud ${r.status}: ${t.slice(0, 100)}`); }
}

// Auditoría 15/11: si WhatsApp no entrega (sin saldo en YCloud, número bloqueado, ventana vencida), antes solo quedaba en el log.
// Ahora Gustavo recibe un aviso (como mucho uno cada 3 horas) con el motivo.
const avisoEnvio = { ultimo: 0 };
async function falloEnvio(to, status, detalle, fetchImpl, st = store) {
  console.error('Envío fallido', status, detalle);
  // 15/11: queda marcado en la charla para que Gustavo vea qué no le llegó al cliente (no se reenvía solo).
  try { if (st && st.marcarNoEntregado) st.marcarNoEntregado(soloDigitos(to)); } catch { /* sin marca */ }
  if (!process.env.NTFY_TOPIC || Date.now() - avisoEnvio.ultimo < 3 * 3600e3) return;
  avisoEnvio.ultimo = Date.now();
  const motivo = /balance|billing|payment|insufficient|saldo/i.test(detalle) ? 'Parece falta de saldo o de medio de pago en YCloud (Billing).' : /24|window|re-engagement|131047/i.test(detalle) ? 'Pasaron más de 24 h desde el último mensaje del cliente.' : `Error ${status}.`;
  try { await avisarNtfy(`⚠️ WhatsApp no está entregando los mensajes del bot: el último a +${to} no se entregó. ${motivo}`, 'PuertoBox: mensajes no se entregaron', 'high', fetchImpl); } catch { /* sin aviso */ }
}

async function enviar(to, body, fetchImpl = fetch, opciones = {}) {
  if (String(to).startsWith('ig:')) return enviarInstagram(String(to).slice(3), body, fetchImpl);
  if (process.env.YCLOUD_API_KEY || YCLOUD_API_KEY) {
    const r = await fetchImpl('https://api.ycloud.com/v2/whatsapp/messages/sendDirectly', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': process.env.YCLOUD_API_KEY || YCLOUD_API_KEY },
      body: JSON.stringify({ from: `+${soloDigitos(process.env.BUSINESS_NUMBER || BUSINESS_NUMBER)}`, to: `+${soloDigitos(to)}`, type: 'text', text: { body } }),
    });
    if (!r.ok) { const t = await r.text(); await falloEnvio(to, r.status, t, fetchImpl, opciones.st || store); if (opciones.lanzar) throw new Error(`YCloud ${r.status}: ${t.slice(0, 100)}`); }
    return;
  }
  const r = await fetchImpl(`${GRAPH}/${PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${WHATSAPP_TOKEN}` },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body } }),
  });
  if (!r.ok) { const t = await r.text(); await falloEnvio(to, r.status, t, fetchImpl, opciones.st || store); if (opciones.lanzar) throw new Error(`WhatsApp ${r.status}: ${t.slice(0, 100)}`); }
}

/** Convierte el webhook (Meta o YCloud) en una lista de eventos: { tipo: 'mensaje'|'eco', ... }. */
function normalizar(payload) {
  const ev = [];
  if (payload.type === 'whatsapp.inbound_message.received' && payload.whatsappInboundMessage) {
    const m = payload.whatsappInboundMessage;
    ev.push({ tipo: 'mensaje', id: m.wamid || m.id, from: soloDigitos(m.from), type: m.type, text: m.text, image: m.image, document: m.document, video: m.video, sticker: m.sticker, audio: m.audio || m.voice, referral: m.referral || (m.context && m.context.referral) || null });
  }
  // 16/11 ("Te mando IMG_1156.jpeg" → cliente: "No llegó nada"): si el webhook de YCloud manda también los estados
  // (evento whatsapp.message.updated), un mensaje que WhatsApp no pudo entregar queda marcado y Gustavo recibe el aviso.
  if (payload.type === 'whatsapp.message.updated' && payload.whatsappMessage && payload.whatsappMessage.status === 'failed') {
    const m = payload.whatsappMessage;
    ev.push({ tipo: 'fallo', to: soloDigitos(m.to), detalle: `${m.errorCode || ''} ${m.errorMessage || ''}`.trim() });
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
      for (const msg of v.messages || []) ev.push({ tipo: 'mensaje', id: msg.id, from: soloDigitos(msg.from), type: msg.type, text: msg.text, image: msg.image, document: msg.document });
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
async function avisarNtfy(texto, titulo = 'PuertoBox', prioridad = 'default', fetchImpl = fetch, tel = null, tipo = null) {
  const topic = process.env.NTFY_TOPIC;
  if (!topic) return false;
  // 15/11: se manda como JSON (UTF-8). Antes iba en encabezados y el botón "Ya lo atendí" (con tilde) hacía que ntfy
  // rechazara el aviso: solo llegaba el resumen de las 9 (que no tiene ese botón). Ahora se revisa la respuesta y,
  // si falla, se reintenta sin botones para que el aviso llegue igual.
  const PRIORIDAD = { min: 1, low: 2, default: 3, high: 4, urgent: 5, max: 5 };
  const base = { topic, title: titulo, message: texto, priority: PRIORIDAD[prioridad] || 3 };
  const acciones = accionesNtfy(tel, tipo);
  // 16/11 (Gustavo: "contesto y sigue la notificación"): los avisos de un cliente van con el mismo número de serie,
  // así el nuevo reemplaza al anterior y, cuando Gustavo contesta o lo marca atendido, se borran (borrarAvisosNtfy).
  // 16/11 12:14: en el iPhone, ntfy no borra: cada borrado aparecía como un aviso vacío. Se desactiva (queda la función por si cambia).
  const seq = null;
  const intentar = async (cuerpo, conSeq) => {
    const r = await fetchImpl('https://ntfy.sh/', { method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8', ...(conSeq ? { 'X-Sequence-ID': seq } : {}) }, body: JSON.stringify(conSeq ? { ...cuerpo, sequence_id: seq } : cuerpo) });
    if (r && r.ok === false) throw new Error(`ntfy ${r.status}: ${r.text ? (await r.text()).slice(0, 200) : ''}`);
    return true;
  };
  const conBotones = acciones ? { ...base, actions: acciones } : base;
  try { return await intentar(conBotones, !!seq); } catch (e) {
    console.error('ntfy error', e.message);
    // Si ntfy no acepta el número de serie, que el aviso llegue igual con sus botones; si tampoco, sin botones.
    if (seq) { try { return await intentar(conBotones, false); } catch (e1) { console.error('ntfy error (sin serie)', e1.message); } }
    try { return await intentar(base, false); } catch (e2) { console.error('ntfy error (sin botones)', e2.message); return false; }
  }
}
const seqNtfy = (tel) => `cli-${String(tel).replace(/[^0-9A-Za-z_-]/g, '').slice(0, 60)}`;
/** Saca del celular los avisos de ese cliente (Gustavo ya contestó, lo marcó atendido o abrió la charla). */
async function borrarAvisosNtfy(tel, fetchImpl = fetch, forzar = false) {
  const topic = process.env.NTFY_TOPIC;
  if (!topic || !tel || !(forzar || process.env.NTFY_BORRAR === '1')) return false;
  try { const r = await fetchImpl(`https://ntfy.sh/${encodeURIComponent(topic)}/${seqNtfy(tel)}`, { method: 'DELETE' }); return !!(r && r.ok !== false); } catch (e) { console.error('ntfy borrar', e.message); return false; }
}

/**
 * Botones en la notificación (pedido del 14/11: nada de comandos para acordarse).
 * "Ya lo atendí" marca al cliente sin abrir nada; "Ver pendientes" abre la lista con un botón por cliente.
 * Los links llevan una firma por cliente (HMAC con ADMIN_KEY), nunca la clave.
 */
// Archivos que mandan los clientes (15/11): se guardan junto a los datos y se sirven en /media/<nombre largo al azar>.
const DIR_MEDIA = () => path.join(path.dirname(process.env.DATA_FILE || DATA_FILE), 'media');
/** Lee un formulario con archivo (multipart/form-data) sin librerías. Devuelve { campos, archivo: { nombre, tipo, buf } | null }. */
function leerMultipart(buf, contentType) {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || '');
  if (!m) return { campos: {}, archivo: null };
  const sep = Buffer.from('--' + (m[1] || m[2]).trim());
  const campos = {}; let archivo = null;
  let i = buf.indexOf(sep);
  while (i >= 0) {
    const ini = i + sep.length;
    if (buf.slice(ini, ini + 2).toString() === '--') break;
    const fin = buf.indexOf(sep, ini);
    if (fin < 0) break;
    const parte = buf.slice(ini + 2, fin - 2); // sin el \r\n de cada lado
    const corte = parte.indexOf('\r\n\r\n');
    if (corte >= 0) {
      const cab = parte.slice(0, corte).toString('utf8');
      const cuerpo = parte.slice(corte + 4);
      const nombre = (/name="([^"]*)"/i.exec(cab) || [])[1];
      const fn = /filename="([^"]*)"/i.exec(cab);
      if (fn) { if (fn[1] && cuerpo.length) archivo = { campo: nombre, nombre: path.basename(fn[1]), tipo: ((/content-type:\s*([^\r\n;]+)/i.exec(cab) || [])[1] || 'application/octet-stream').trim().toLowerCase(), buf: cuerpo }; }
      else if (nombre) campos[nombre] = cuerpo.toString('utf8');
    }
    i = fin;
  }
  return { campos, archivo };
}
const BASE_URL = () => process.env.PUBLIC_URL || `https://${require('../src/negocio').datos().dominio}`;
// Links firmados (avisos, charlas, responder). Auditoría 15/11: antes no vencían nunca y el tema de ntfy quedó publicado en el repo;
// ahora cada link vence a los 7 días (los avisos nuevos traen links nuevos). Formato: <día de vencimiento>-<firma>.
const DIAS_LINK = 7;
const hoyDia = () => Math.floor(Date.now() / 864e5);
function firmaCon(que, vence) {
  const clave = process.env.ADMIN_KEY || ADMIN_KEY;
  return clave ? require('crypto').createHmac('sha256', clave).update(`${que}|${vence}`).digest('hex').slice(0, 24) : null;
}
function firma(que) {
  const vence = hoyDia() + DIAS_LINK;
  const f = firmaCon(que, vence);
  return f ? `${vence.toString(36)}-${f}` : null;
}
// Acceso guardado en el celular (15/11 18:07, Gustavo borró el aviso y se quedó sin forma de entrar a las charlas):
// la primera vez que entra a /charlas o /pendientes (con link del aviso o con ?key=) queda una cookie por un año;
// después puertobox.com.ar/charlas abre directo. Si se cambia ADMIN_KEY, la cookie deja de valer.
function panelValor() {
  const clave = process.env.ADMIN_KEY || ADMIN_KEY;
  return clave ? require('crypto').createHmac('sha256', clave).update('panel-celular').digest('hex').slice(0, 32) : null;
}
function panelOk(req) {
  const m = /(?:^|;\s*)pbp=([0-9a-f]{32})/.exec((req && req.headers && req.headers.cookie) || '');
  const v = panelValor();
  return !!(m && v && require('crypto').timingSafeEqual(Buffer.from(m[1]), Buffer.from(v)));
}
const cookiePanel = () => `pbp=${panelValor()}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax`;
const intentosEntrar = { lista: [] };
const SIN_ACCESO = '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>PuertoBox</title></head><body style="font-family:system-ui,sans-serif;padding:20px"><h1>Entrá una vez desde un aviso</h1><p>Abrí cualquier aviso de PuertoBox en el celular y tocá un botón (por ejemplo "Ver pendientes"). Desde ese momento, esta página abre directo en este celular.</p><h2 style="font-size:18px;margin-top:28px">¿Abriste la app PuertoBox del celular?</h2><p>La primera vez escribí tu clave (la de Railway, ADMIN_KEY). Queda guardada en la app.</p><form method="post" action="/entrar"><input name="clave" type="password" autocomplete="current-password" style="font-size:16px;padding:10px;width:100%;box-sizing:border-box;border:1px solid #ccc;border-radius:10px"><button style="margin-top:10px;padding:12px;width:100%;font-size:16px;border:0;border-radius:10px;background:#1a7f37;color:#fff">Entrar</button></form></body></html>';
function firmaOk(que, dada) {
  const m = /^([0-9a-z]+)-([0-9a-f]{24})$/.exec(String(dada || ''));
  if (!m) return false;
  const vence = parseInt(m[1], 36);
  if (!(vence >= hoyDia()) || vence > hoyDia() + DIAS_LINK) return false;
  const f = firmaCon(que, vence);
  return !!(f && require('crypto').timingSafeEqual(Buffer.from(f), Buffer.from(m[2])));
}
// 15/11 18:03 (Gustavo: "no funcionan los botones, puse Ya lo atendí y no cambia nada"): los botones que corrían
// por detrás (http) no daban ninguna señal. Ahora todos abren una página que hace la acción y muestra "✅ Listo".
// El aviso de "confirmá la posición" trae su propio botón para confirmarla o elegir otra.
function accionesNtfy(tel, tipo = null) {
  const fp = firma('pendientes');
  if (!fp) return null;
  const ver = { action: 'view', label: 'Ver pendientes', url: `${BASE_URL()}/pendientes?t=${fp}` };
  const charlas = { action: 'view', label: 'Ver charlas', url: `${BASE_URL()}/charlas?t=${firma('charlas')}` };
  if (!tel) return [ver, charlas];
  const contestar = { action: 'view', label: 'Ver y contestar', url: `${BASE_URL()}/charlas?t=${firma('charlas')}&abierto=${encodeURIComponent(tel)}#c-${encodeURIComponent(tel)}` };
  if (tipo === 'confirmar_posicion') return [{ action: 'view', label: 'Confirmar posición', url: `${BASE_URL()}/posicion?tel=${encodeURIComponent(tel)}&t=${firma('posicion:' + tel)}` }, contestar];
  return [contestar, { action: 'view', label: 'Ya lo atendí', url: `${BASE_URL()}/atendido?tel=${encodeURIComponent(tel)}&t=${firma('atendido:' + tel)}`, clear: true }, ver];
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
/** Aviso de derivación corto (15/11, Gustavo: "tengo que leer mucho para darme cuenta qué pide el cliente"). */
function avisoCorto(d, st) {
  const lead = (st && st.lead ? st.lead(d.telefono) : null) || {};
  const quien = lead.nombre ? `${lead.nombre} (+${d.telefono})` : `+${d.telefono}`;
  const lineas = [`👤 ${quien}${lead.producto ? ' · ' + lead.producto : ''}`];
  if (d.quiere) lineas.push(`Quiere: ${d.quiere}`);
  if (d.para_vos) lineas.push(`Vos: ${d.para_vos}`);
  if (!d.quiere && !d.para_vos) lineas.push(String(d.resumen || '').slice(0, 200));
  else if (d.resumen) lineas.push('', String(d.resumen).slice(0, 220));
  if (d.presupuesto) lineas.push('', `📄 Presupuesto formal N° ${d.presupuesto} listo: en «Ver y contestar» tocá «Enviar presupuesto».`);
  if (d.motivo !== 'duda') lineas.push('', 'El bot ya no le contesta: le escribís vos desde «Ver y contestar».');
  return lineas.join('\n');
}

async function avisoMensajeNuevo(st, tel, texto, owner, fetchImpl = fetch, ahora = Date.now()) {
  const rec = require('./recordatorios');
  if (!process.env.NTFY_TOPIC || rec.esGustavo(tel, owner) || String(tel).startsWith('ig:')) return false;
  const c = st.chats().find((x) => x.telefono === tel) || {};
  if (c.avisoNuevoEn && ahora - c.avisoNuevoEn < 10 * 60e3) return false;
  if (st.marcar) st.marcar(tel, { avisoNuevoEn: ahora });
  const l = (st.lead && st.lead(tel)) || {};
  // 16/11: sin códigos internos ("[Audio del cliente…] [archivo:/media/…]") y en la primera línea, que es lo que se ve sin abrir el aviso.
  const linea = rec.resumenVista(String(texto || '')).replace(/\s+/g, ' ').trim().slice(0, 160);
  return avisarNtfy(`💬 ${l.nombre ? l.nombre + ' (+' + tel + ')' : '+' + tel}: ${linea}`, `🔴 Sin contestar: ${l.nombre || '+' + tel}`, rec.silencio(ahora) ? 'low' : 'high', fetchImpl, tel);
}

async function ticArancel(fetchImpl = fetch) {
  try {
    const r = await require('../src/arancel').actualizar(fetchImpl);
    if (r.nuevo) await avisarGustavo(soloDigitos(process.env.OWNER_NUMBER || OWNER_NUMBER), r.texto, fetchImpl, 'PuertoBox: arancel ARCA actualizado');
    return r;
  } catch (e) {
    console.error('arancel ARCA:', e.message);
    // Si ARCA no responde o cambia el archivo, Gustavo se entera (como mucho una vez por semana) y el nomenclador sigue con el anterior.
    const marca = path.join(require('../src/arancel').dir(), 'aviso_error.txt');
    let ultimo = 0; try { ultimo = Number(fs.readFileSync(marca, 'utf8')) || 0; } catch (_) { /* nunca avisó */ }
    if (Date.now() - ultimo > 7 * 864e5) {
      try { fs.mkdirSync(path.dirname(marca), { recursive: true }); fs.writeFileSync(marca, String(Date.now())); } catch (_) { /* sin volumen */ }
      await avisarGustavo(soloDigitos(process.env.OWNER_NUMBER || OWNER_NUMBER), `⚠️ No pude bajar el arancel de ARCA para actualizar el nomenclador (${e.message}). Sigue funcionando con el del ${require('../src/arancel').leer('sim.json').meta.fecha_archivos}.`, fetchImpl, 'PuertoBox: arancel ARCA');
    }
    return { error: e.message };
  }
}
async function avisarGustavo(owner, texto, fetchImpl = fetch, titulo = 'PuertoBox: cliente para atender', tel = null, tipo = null) {
  if (process.env.NTFY_TOPIC) return avisarNtfy(texto, titulo, 'high', fetchImpl, tel, tipo);
  if (owner) await enviar(owner, texto, fetchImpl);
}

// Agrupa los mensajes que el cliente manda seguidos y responde una sola vez, de a un chat por vez.
const DEBOUNCE_MS = Number(process.env.DEBOUNCE_MS || 6000);
const pendientes = new Map(); // tel -> { textos: [], timer }
const colas = new Map(); // tel -> Promise
const avisoSaldo = { ultimo: 0 };

const normalizarTexto = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
function empiezaCon(texto, clave) {
  const m = require('../src/negocio').datos()[clave];
  return !!m && normalizarTexto(texto).startsWith(normalizarTexto(m));
}
const esMensajeAnuncio = (texto) => empiezaCon(texto, 'mensaje_anuncio') || empiezaCon(texto, 'mensaje_anuncio_whatsapp'); // 16/11: el precargado nuevo de los anuncios
const esMensaje698 = (texto) => empiezaCon(texto, 'mensaje_698');

const NUMEROS_META = new Set(['447974905090', '447480784000', '16505434800', '13105850000']);

async function procesar(payload, deps = {}) {
  const fetchImpl = deps.fetchImpl || fetch;
  const st = deps.store || store;
  const owner = soloDigitos(process.env.OWNER_NUMBER || OWNER_NUMBER);
  const salidas = [];
  for (let e of normalizar(payload)) {
    if (e.tipo === 'fallo') { await falloEnvio(e.to, 'failed', e.detalle || 'WhatsApp no lo entregó', fetchImpl, st); continue; }
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
    // ¿Vino del anuncio de Meta? El link del anuncio trae un texto precargado propio (negocio.json → mensaje_anuncio).
    if (st.marcar && (e.referral || (e.type === 'text' && esMensajeAnuncio(e.text.body)))) {
      // Anuncio clic a WhatsApp: WhatsApp manda los datos del anuncio (referral) en el primer mensaje.
      st.marcar(tel, { origen: 'anuncio', origenEn: Date.now(), ...(e.referral ? { anuncioId: e.referral.sourceId || e.referral.source_id || null } : {}) });
    } else if (st.marcar && e.type === 'text' && esMensaje698(e.text.body)) {
      // Vino del link del mensaje automático del 698 (para medir si la gente pasa del 698 al bot).
      st.marcar(tel, { origen: '698', origenEn: Date.now() });
    }
    { const p0 = pendientes.get(tel); if (p0) clearTimeout(p0.timer); } // si manda varias fotos seguidas, no contestar a mitad (15/11)
    const transcripto = e.transcripto !== undefined ? e.transcripto : (e.audio ? await transcribirAudio(e.audio, fetchImpl) : null); // no transcribir dos veces
    const texto = e.type === 'text' ? e.text.body
      : transcripto ? `[Audio del cliente, pasado a texto automáticamente]${await require('./adjuntos').guardarAudio(e.audio, { fetchImpl, dir: DIR_MEDIA(), apiKey: process.env.YCLOUD_API_KEY || YCLOUD_API_KEY })} ${transcripto}`
      : e.audio ? `[El cliente mandó un audio que no se pudo pasar a texto.${await require('./adjuntos').guardarAudio(e.audio, { fetchImpl, dir: DIR_MEDIA(), apiKey: process.env.YCLOUD_API_KEY || YCLOUD_API_KEY })} Pedile que lo escriba, sin decir que no se escucha.]`
      : ['image', 'document', 'video', 'sticker'].includes(e.type)
        ? await require('./adjuntos').procesar(e, { fetchImpl, dir: DIR_MEDIA(), apiKey: process.env.YCLOUD_API_KEY || YCLOUD_API_KEY, puedeLeer: lecturasHoy(st, tel) <= TOPE_LECTURAS })
        : `[El cliente mandó un ${e.type}. Pedile los datos por texto sin decir que no se abre.]`;
    // Códigos de verificación de Meta/Facebook (llegan desde números oficiales, como +44 7974 905090): no son clientes.
    // WhatsApp no deja leerlos por la API (llegan como "unsupported"): no se contestan ni se derivan.
    if (NUMEROS_META.has(tel)) continue;
    // BAJA: el que no quiere más mensajes de la difusión. Se lo saca y no se le vuelve a escribir.
    if (e.type === 'text' && require('./difusion').esBaja(e.text.body)) {
      require('./difusion').darDeBaja(st, tel);
      const r = 'Listo, no te vamos a enviar más mensajes. Si algún día querés cotizar un envío desde China, escribinos por acá.';
      await enviar(tel, r, fetchImpl); salidas.push({ to: tel, body: r });
      continue;
    }
    if (st.estaPausado(tel)) {
      st.agregar(tel, 'user', texto);
      // 15/11 21:40 (Gustavo: "las notificaciones no me llegan"): con el chat en manos de Gustavo, el bot no contesta y
      // antes el aviso recién salía a la hora. Ahora sale al instante (uno cada 10 min por chat, para no llenar el celu
      // cuando mandan varios archivos seguidos). De 22 a 8, sin sonido.
      await avisoMensajeNuevo(st, tel, texto, owner, fetchImpl);
      // Chat derivado a Gustavo: nunca clavar el visto. Aviso de espera, como mucho uno cada 3 horas.
      if (st.motivoPausa(tel) === 'derivado' && st.avisoEsperaVencido(tel, 3)) {
        const r = 'Tu consulta ya la tiene nuestro despachante de aduana y te escribe por este mismo chat. Si querés sumar algún dato, dejalo acá.';
        await enviar(tel, r, fetchImpl); salidas.push({ to: tel, body: r });
        st.agregar(tel, 'assistant', r); // que se vea en /charlas (15/11: no se sabía si el cliente lo había recibido)
      }
      continue;
    }
    const espera = deps.debounceMs ?? DEBOUNCE_MS;
    if (espera > 0) {
      const p = pendientes.get(tel) || { textos: [] };
      // Auditoría 15/11: el mensaje se guarda apenas llega (antes quedaba solo en memoria y un reinicio lo perdía).
      st.agregar(tel, 'user', texto);
      if (st.marcar) st.marcar(tel, { sinResponder: Date.now() });
      p.textos.push(texto); clearTimeout(p.timer);
      p.timer = setTimeout(() => {
        pendientes.delete(tel);
        const junto = p.textos.join('\n');
        const previa = colas.get(tel) || Promise.resolve();
        const tarea = previa.then(() => atender(tel, junto, st, fetchImpl, owner, true)).catch((e) => console.error(e));
        colas.set(tel, tarea);
      }, espera);
      if (p.timer.unref) p.timer.unref();
      pendientes.set(tel, p);
      continue;
    }
    salidas.push(...(await atender(tel, texto, st, fetchImpl, owner)));
  }
  return salidas;
}

const TOPE_DIARIO = Number(process.env.TOPE_MENSAJES_DIA || 60);
// Lecturas de imágenes/PDF con IA por chat por día (auditoría 15/11: sin tope, 100 fotos eran 100 lecturas pagas). Pasado el tope, se guardan igual.
const TOPE_LECTURAS = Number(process.env.TOPE_LECTURAS_DIA || 20);
function lecturasHoy(st, tel) {
  const c = st.chats().find((x) => x.telefono === tel) || {};
  const hoy = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
  const n = c.lecturasDia === hoy ? (c.lecturas || 0) + 1 : 1;
  if (st.marcar) st.marcar(tel, { lecturasDia: hoy, lecturas: n });
  return n;
}
async function atender(tel, texto, st, fetchImpl, owner, guardado = false) {
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
      resp = await responder({ telefono: tel, texto, store: st, fetchImpl, derivaciones, guardado });
    } catch (err) {
      console.error(err);
      const msg = String(err && err.message);
      if (/credit balance|billing|\b401\b|invalid x-api-key|authentication/i.test(msg)) {
        // Sin saldo o clave inválida: el cliente no queda colgado y Gustavo se entera (una vez cada 3 horas).
        resp = 'Hola, te escribo de PuertoBox. En un rato te responde nuestro despachante de aduana por este mismo chat.';
        if (!avisoSaldo.ultimo || Date.now() - avisoSaldo.ultimo > 3 * 3600e3) {
          avisoSaldo.ultimo = Date.now();
          const que = /credit balance|billing/i.test(msg) ? 'se quedó SIN SALDO en Anthropic. Cargá crédito en platform.claude.com (Facturación).' : 'la clave de Anthropic no funciona. Revisá ANTHROPIC_API_KEY en Railway.';
          await avisarGustavo(owner, `⚠️ PuertoBox: el bot ${que} Mientras tanto los clientes reciben un mensaje de espera. Último cliente: ${tel}`, fetchImpl);
        }
      } else {
        resp = 'Disculpá, tuvimos un inconveniente momentáneo. ¿Me podés repetir tu último mensaje?';
      }
    }
    // Contestado (con la IA o con el mensaje de espera): ya no queda pendiente, así un reinicio no lo repite.
    if (st.marcar) st.marcar(tel, { sinResponder: null });
    if (resp && !(st.historial(tel).slice(-1)[0] || {}).content?.startsWith?.(resp.slice(0, 30))) st.agregar(tel, 'assistant', resp);
    if (resp) { await enviar(tel, resp, fetchImpl, { st }); salidas.push({ to: tel, body: resp }); }
    for (const d of derivaciones) {
      const esIG = String(d.telefono).startsWith('ig:');
      const aviso = d.motivo === 'confirmar_posicion'
        ? `🔎 PuertoBox: confirmá la posición\nCliente: +${d.telefono}\n${d.resumen}\n(El bot sigue atendiendo con esta posición "a confirmar".)`
        : esIG
        ? `🔔 PuertoBox (Instagram): ${d.motivo.replace(/_/g, ' ')}\n${d.resumen}\n(Respondele desde los mensajes de Instagram de PuertoBox. El bot quedó pausado en ese chat; para reactivarlo escribí #bot en ese mismo chat.)`
        : avisoCorto(d, st);
      const TITULO = { listo_para_cerrar: 'Quiere pagar', mayorista: 'Pedido grande', reclamo: 'Reclamo', pide_humano: 'Pide hablar con vos', duda: 'Duda para vos' };
      await avisarGustavo(owner, aviso, fetchImpl, d.motivo === 'confirmar_posicion' ? 'PuertoBox: confirmá la posición' : `PuertoBox: ${TITULO[d.motivo] || 'cliente para atender'}`, d.telefono, d.motivo);
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
function cotizarAMano(q) {
  const n = (k) => { const v = parseFloat(String(q.get(k) || '').replace(',', '.')); return Number.isFinite(v) && v > 0 ? v : undefined; };
  const input = {
    kg: n('kg'), valor_factura_usd: n('valor'), die: parseFloat(q.get('die')) || 0, internos: parseFloat(q.get('internos')) || 0,
    regimen: q.get('regimen') === 'personal' ? 'personal' : 'comercial', sin_franquicia: q.get('sin_franquicia') === '1',
    cantidad_cajas: n('cajas') || 1, largo_cm: n('largo'), ancho_cm: n('ancho'), alto_cm: n('alto'), unidades: n('unidades'),
    con_bateria_litio: q.get('litio') === '1', con_cuit_puertobox: q.get('cuit_pb') === '1',
  };
  // Cajas de distintos tamaños (16/11): bultos=1x26x20x11.5;2x34x34x20 (cantidad x largo x ancho x alto, separados por ;)
  const bultos = String(q.get('bultos') || '').split(';').map((t) => t.split(/[x×*]/i).map((v) => parseFloat(String(v).replace(',', '.'))))
    .filter((v) => v.length === 4 && v.every((x) => x > 0)).map(([cantidad, largo_cm, ancho_cm, alto_cm]) => ({ cantidad, largo_cm, ancho_cm, alto_cm }));
  if (bultos.length > 1) input.bultos = bultos;
  const { crearStore } = require('./store');
  const r = require('./tools').ejecutar('cotizar', input, { telefono: 'cotizador', store: crearStore(null), derivaciones: [], manual: true });
  const div = require('../data/precios_venta.json').flete_directo.divisor_volumetrico;
  const vol = input.bultos ? Math.round(input.bultos.reduce((t, b) => t + (b.largo_cm * b.ancho_cm * b.alto_cm / div) * b.cantidad, 0) * 100) / 100
    : input.largo_cm && input.ancho_cm && input.alto_cm ? Math.round((input.largo_cm * input.ancho_cm * input.alto_cm / div) * input.cantidad_cajas * 100) / 100 : null;
  if (input.bultos) input.cantidad_cajas = input.bultos.reduce((t, b) => t + b.cantidad, 0);
  // Al cotizador le hablamos a Gustavo, no al bot (15/11 y 16/11: le aparecía "no cotices... pedíselas al cliente").
  if (r.error) {
    const e = String(r.error);
    if (/medidas|medir/i.test(e)) return { error: 'Cargá el largo, el ancho y el alto de la caja (en cm). Si hay cajas de distintos tamaños, agregá una fila por cada tamaño.', falta: 'medidas' };
    if (/cajas/i.test(e)) return { error: 'Cargá cuántas cajas son.', falta: 'cajas' };
    if (/peso o el valor/i.test(e)) return { error: 'Cargá el valor al proveedor y el peso.', falta: 'valor_kg' };
    if (/No cierran unidades y peso/i.test(e)) return { error: 'Las unidades y el peso no cierran: revisalos.', falta: 'unidades' };
    return { error: e.replace(/\s*No cotices[^.]*\.?/gi, '').replace(/pregunt[aá]selo[s]? al cliente[^.]*\.?/gi, '').trim() || 'Faltan datos para calcular.' };
  }
  const NEG = require('../src/negocio').datos();
  const avisos = [];
  if (!vol) avisos.push('Sin medidas: el flete se confirma con las medidas de la caja (no es precio cerrado).');
  if (vol && vol > input.kg * 1.3) avisos.push(`Cajas grandes para lo que pesan: se cobra por volumen (${r.kg_presupuestado} kg en vez de ${input.kg} kg). Con cajas más chicas o más llenas baja el flete.`);
  if (r.recargo_cajas_usd) avisos.push(`Cajas de más de 23 kg: recargo de la aerolínea de USD ${r.recargo_cajas_usd} (ya sumado). Con cajas de hasta 23 kg se evita.`);
  if (input.kg / input.cantidad_cajas > NEG.caja_max_kg) avisos.push(`Hay cajas de más de ${NEG.caja_max_kg} kg: es el máximo por bulto del courier, hay que dividirlas.`);
  if (r.recargo_litio_usd) avisos.push(`Batería de litio: recargo de carga peligrosa de USD ${r.recargo_litio_usd} (ya sumado). Pedir al proveedor la MSDS y el informe UN38.3.`);
  if (input.con_cuit_puertobox) avisos.push('Con CUIT de PuertoBox: gestión USD ' + r.handling_puertobox_usd + '. El envío dentro de Argentina va aparte y los impuestos los paga PuertoBox (cobrárselos al cliente antes de despachar).');
  if ((input.valor_factura_usd || 0) > NEG.tope_por_envio_usd) avisos.push(`Supera USD ${NEG.tope_por_envio_usd} por envío: no entra como courier.`);
  return { ...r, aviso: undefined, avisos, peso_real_kg: input.kg || 0, peso_volumetrico_kg: vol, divisor_volumetrico: div, kg_por_caja: input.kg ? Math.round((input.kg / input.cantidad_cajas) * 100) / 100 : null, reglas: undefined };
}

function servirNomenclador(req, res, url) {
  const clave = process.env.ADMIN_KEY || ADMIN_KEY;
  const cookie = /(?:^|;\s*)pbk=([^;]+)/.exec(req.headers.cookie || '');
  // Desde la página de charlas se entra con un link firmado (sin la clave a la vista) y queda la cookie.
  const conFirma = !!url.searchParams.get('t') && firmaOk('nomenclador', url.searchParams.get('t'));
  const dada = conFirma ? clave : url.searchParams.get('key');
  // 16/11 (Gustavo: "no abre"): con la cookie de /charlas y /pendientes también entra, así no hace falta la clave aparte.
  if (!clave || (dada !== clave && !(cookie && decodeURIComponent(cookie[1]) === clave) && !panelOk(req))) {
    res.writeHead(401, { 'content-type': 'text/plain; charset=utf-8' });
    return res.end('Acceso restringido. Entrá con el link que tiene la clave.');
  }
  if (url.pathname === '/nomenclador') { res.writeHead(302, { location: '/nomenclador/' + (dada ? '?key=' + encodeURIComponent(dada) : '') }); return res.end(); }
  const rel = decodeURIComponent(url.pathname.slice('/nomenclador/'.length)) || 'index.html';
  // Cotizador a mano (15/11, Gustavo): el mismo motor que usa el bot (`cotizar`), así los números siempre coinciden.
  if (rel === 'api/cotizar') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    return res.end(JSON.stringify(cotizarAMano(url.searchParams)));
  }
  // Arancel ARCA que se actualiza solo (16/11): historial de cambios y datos bajados, que mandan sobre los del repo.
  if (rel === 'api/cambios') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    return res.end(JSON.stringify(require('../src/arancel').historial()));
  }
  if (/^data\/(sim|notas|sufijos)\.json$/.test(rel)) {
    const p = require('../src/arancel').ruta(rel.slice(5));
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-cache' });
    return fs.createReadStream(p).pipe(res);
  }
  const archivo = path.normalize(path.join(WEB, rel));
  if (!archivo.startsWith(WEB + path.sep) || !fs.existsSync(archivo) || fs.statSync(archivo).isDirectory()) { res.writeHead(404); return res.end('No encontrado'); }
  const headers = { 'content-type': TIPOS[path.extname(archivo)] || 'application/octet-stream', 'cache-control': rel.startsWith('data/') ? 'public, max-age=3600' : 'no-cache' };
  if (dada === clave) headers['set-cookie'] = `pbk=${encodeURIComponent(clave)}; Path=/nomenclador; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax`;
  res.writeHead(200, headers);
  fs.createReadStream(archivo).pipe(res);
}

let pruebaEnCurso = false;
const informes = new Map();
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
    if (url.pathname === '/seguir-bot' && req.method === 'POST') {
      // "Que lo siga el bot": Gustavo devuelve el chat al bot (se despausa y deja de figurar como esperando).
      const tel = soloDigitos(url.searchParams.get('tel'));
      if (!tel || !firmaOk('bot:' + tel, url.searchParams.get('t'))) { res.writeHead(401, { 'content-type': 'text/plain; charset=utf-8' }); return res.end('Link vencido o incorrecto.'); }
      store.reanudar(tel); store.marcar(tel, { gustavoRespondioEn: Date.now(), recordatorios: 0 });
      const lead = store.lead && store.lead(tel);
      if (lead && ['derivado', 'listo_para_cerrar'].includes(lead.estado)) store.guardarLead(tel, { estado: lead.precio_usd ? 'cotizado' : 'nuevo' });
      const volver = url.searchParams.get('volver');
      if (volver && firmaOk('pendientes', volver)) { res.writeHead(303, { location: `/pendientes?t=${volver}` }); return res.end(); }
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' }); return res.end(`Listo: el bot sigue con +${tel}.`);
    }
    // Páginas que abren los botones del aviso (15/11): hacen la acción y lo dicen claro.
    const paginaSimple = (titulo, cuerpo) => `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>PuertoBox</title><style>body{font-family:system-ui,sans-serif;margin:0;padding:20px;background:#f5f5f5;color:#111}h1{font-size:22px}p{font-size:16px;color:#333}form{margin:10px 0}button{width:100%;padding:14px;font-size:17px;border:0;border-radius:12px;background:#1a7f37;color:#fff;text-align:left}button.otra{background:#e8eef5;color:#0b4f8a}input{width:100%;box-sizing:border-box;font-size:17px;padding:12px;border:1px solid #ccc;border-radius:12px;margin-bottom:8px}a{color:#1a5fb4;font-size:16px}.err{color:#a40000}</style></head><body><h1>${titulo}</h1>${cuerpo}</body></html>`;
    const escH = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    if (url.pathname === '/atendido' && req.method === 'GET') {
      const tel = soloDigitos(url.searchParams.get('tel'));
      if (!tel || !firmaOk('atendido:' + tel, url.searchParams.get('t'))) { res.writeHead(401, { 'content-type': 'text/html; charset=utf-8' }); return res.end(paginaSimple('Link vencido', '<p>Abrí la lista de pendientes desde un aviso nuevo.</p>')); }
      store.marcar(tel, { gustavoRespondioEn: Date.now(), recordatorios: 0 });
      borrarAvisosNtfy(tel);
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      return res.end(paginaSimple('✅ Listo', `<p>+${escH(tel)} quedó como atendido. No te lo vuelvo a recordar, salvo que el cliente escriba de nuevo.</p><p><a href="/pendientes?t=${firma('pendientes')}">Ver pendientes →</a></p>`));
    }
    if (url.pathname === '/posicion') {
      const tel = soloDigitos(url.searchParams.get('tel'));
      const t = url.searchParams.get('t');
      if (!tel || !firmaOk('posicion:' + tel, t)) { res.writeHead(401, { 'content-type': 'text/html; charset=utf-8' }); return res.end(paginaSimple('Link vencido', '<p>Abrí la charla desde /charlas.</p>')); }
      const accion = `/posicion?tel=${tel}&t=${t}`;
      const ver = (msg = '') => {
        const fija = (store.lead(tel) || {}).posicion_fija;
        if (!fija) return paginaSimple('Sin posición', '<p>Ese cliente todavía no tiene posición elegida.</p>');
        const op = [{ posicion: fija.posicion, die: fija.die, por_que: fija.confirmada ? 'Ya confirmada por vos' : `La eligió el bot (confianza ${fija.confianza || '-'})` }, ...(fija.alternativas || []).filter((a) => a.posicion !== fija.posicion)];
        return paginaSimple('🔎 Posición', `${msg}<p><b>Producto:</b> ${escH(String(fija.producto || '').slice(0, 300))}</p>${op.map((o, i) => `<form method="post" action="${accion}"><input type="hidden" name="pos" value="${escH(o.posicion)}"><button class="${i ? 'otra' : ''}">${i ? 'Usar' : 'Confirmar'} ${escH(o.posicion)} · DIE ${escH(o.die)}%<br><small>${escH(String(o.por_que || '').slice(0, 140))}</small></button></form>`).join('')}<form method="post" action="${accion}"><input name="pos" placeholder="Otra posición, ej. 8543.70.99"><button class="otra">Usar la que escribí</button></form><p><a href="/charlas?t=${firma('charlas')}&abierto=${tel}#c-${tel}">Ver la charla →</a></p>`);
      };
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      if (req.method !== 'POST') return res.end(ver());
      let raw = ''; req.on('data', (c) => { raw += c; if (raw.length > 5000) req.destroy(); });
      return req.on('end', () => {
        const pos = (new URLSearchParams(raw).get('pos') || '').trim();
        const r = require('./certeza').confirmar(store, tel, pos, require('./tools').ejecutar);
        if (r.error) return res.end(ver(`<p class="err">⚠️ ${escH(r.error)}</p>`));
        res.end(paginaSimple('✅ Listo', `<p>${r.cambio ? `Cambiada a <b>${escH(r.a)}</b> (antes ${escH(r.de)}). El presupuesto se recalculó con el derecho nuevo.` : `Confirmada <b>${escH(r.a)}</b>.`} El bot la usa desde ahora sin "(a confirmar)" y la aprende para este producto.</p><p><a href="/charlas?t=${firma('charlas')}&abierto=${tel}#c-${tel}">Ver la charla →</a></p>`));
      });
    }
    if (url.pathname === '/atendido' && req.method === 'POST') {
      const tel = soloDigitos(url.searchParams.get('tel'));
      if (!tel || !firmaOk('atendido:' + tel, url.searchParams.get('t'))) { res.writeHead(401, { 'content-type': 'text/plain; charset=utf-8' }); return res.end('Link vencido o incorrecto.'); }
      store.marcar(tel, { gustavoRespondioEn: Date.now(), recordatorios: 0 });
      borrarAvisosNtfy(tel);
      const volver = url.searchParams.get('volver');
      if (volver && firmaOk('pendientes', volver)) { res.writeHead(303, { location: `/pendientes?t=${volver}` }); return res.end(); }
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' }); return res.end(`Listo: +${tel} marcado como atendido.`);
    }
    if (req.method === 'GET' && url.pathname === '/pendientes') {
      let t = url.searchParams.get('t');
      const claveP = process.env.ADMIN_KEY || ADMIN_KEY;
      if (!(firmaOk('pendientes', t) || panelOk(req) || (claveP && url.searchParams.get('key') === claveP))) { res.writeHead(401, { 'content-type': 'text/html; charset=utf-8' }); return res.end(SIN_ACCESO); }
      if (!firmaOk('pendientes', t)) t = firma('pendientes');
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'set-cookie': cookiePanel() });
      const html = require('./recordatorios').paginaPendientes(store, soloDigitos(process.env.OWNER_NUMBER || OWNER_NUMBER), (tel) => `/atendido?tel=${tel}&t=${firma('atendido:' + tel)}&volver=${t}`, Date.now(), (tel) => `/seguir-bot?tel=${tel}&t=${firma('bot:' + tel)}&volver=${t}`, (tel) => `/charlas?t=${firma('charlas')}&abierto=${tel}#c-${tel}`);
      const di = require('../src/dolar').info();
      const lineaDolar = `<p style="color:#666;font-size:14px">Dólar que usa el bot para la ganancia en pesos: $${di.ars} ${di.automatico ? `(oficial, se actualiza solo; último: ${new Date(di.fecha).toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })})` : '(fijo de negocio.json: todavía no se actualizó solo)'}</p>`;
      const botonPrueba = `<h2>Prueba completa del bot</h2><p>Prueba posiciones arancelarias y charlas reales con la IA. Tarda unos 10 minutos y gasta unos USD 2 a 3 del saldo de Anthropic. Cuando termina te llega un aviso con el informe.</p><form method="post" action="/prueba-completa?t=${firma('prueba')}"><button class="bot">${pruebaEnCurso ? 'Prueba en curso…' : 'Correr prueba completa'}</button></form>`;
      return res.end(html.replace('<h1>Pendientes PuertoBox</h1>', `<h1>Pendientes PuertoBox</h1><p><a href="/charlas?t=${firma('charlas')}">Ver todas las charlas con el bot →</a></p>`).replace('</body>', `${botonPrueba}${lineaDolar}</body>`));
    }
    if (url.pathname === '/difusion') {
      // Mensaje a clientes anteriores del 698 (plantilla de WhatsApp). Con ?key=ADMIN_KEY o link firmado.
      const clave = process.env.ADMIN_KEY || ADMIN_KEY;
      const t = url.searchParams.get('t'); const k = url.searchParams.get('key');
      if (!(firmaOk('difusion', t) || (clave && k === clave))) { res.writeHead(401, { 'content-type': 'text/plain; charset=utf-8' }); return res.end('Link vencido o incorrecto.'); }
      const dif = require('./difusion');
      const accion = `/difusion?t=${firma('difusion')}`;
      const esG = (tel) => require('./recordatorios').esGustavo(tel, soloDigitos(process.env.OWNER_NUMBER || OWNER_NUMBER));
      if (req.method === 'POST') {
        let raw = ''; req.on('data', (c) => { raw += c; if (raw.length > 200000) req.destroy(); });
        return req.on('end', async () => {
          const numeros = new URLSearchParams(raw).get('numeros') || '';
          const r = dif.cargar(store, numeros, esG);
          let extra = '';
          try { const p = await dif.asegurarPlantilla(store); extra = p.estado === 'APPROVED' ? ' Ya están saliendo.' : ' Salen apenas Meta apruebe el mensaje.'; } catch (e) { extra = ' Ojo: ' + e.message; }
          res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
          res.end(dif.pagina(store, accion, `Cargados ${r.agregados} números (${r.salteados} salteados).${extra}`));
        });
      }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      return res.end(dif.pagina(store, accion));
    }
    if (req.method === 'GET' && url.pathname === '/charlas') {
      const clave = process.env.ADMIN_KEY || ADMIN_KEY;
      if (!(firmaOk('charlas', url.searchParams.get('t')) || panelOk(req) || (clave && url.searchParams.get('key') === clave))) { res.writeHead(401, { 'content-type': 'text/html; charset=utf-8' }); return res.end(SIN_ACCESO); }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'set-cookie': cookiePanel() });
      const abierto = soloDigitos(url.searchParams.get('abierto') || '') || null;
      const aviso = url.searchParams.get('corregido') === '1' ? 'Corrección guardada. El bot la aplica desde su próximo mensaje.' : url.searchParams.get('ok') === '1' ? 'Mensaje enviado. El bot quedó callado en ese chat.' : url.searchParams.get('error') ? `No se pudo enviar: ${url.searchParams.get('error')}` : '';
      const htmlCharlas = require('./recordatorios').paginaCharlas(store, soloDigitos(process.env.OWNER_NUMBER || OWNER_NUMBER), Date.now(), 3, (tel) => `/responder?tel=${tel}&t=${firma('responder:' + tel)}`, abierto, aviso, (tel) => `?tel=${tel}&t=${firma('presu:' + tel)}`, (tel) => `/corregir?tel=${tel}&t=${firma('corregir:' + tel)}`, (tel) => `/visto?tel=${tel}&t=${firma('visto:' + tel)}`, (tel, v) => `/marcar-presu?tel=${tel}&v=${v}&t=${firma('marcarpresu:' + tel)}`);
      if (abierto && store.marcarVisto) store.marcarVisto(abierto); // la abrió desde un aviso: ya la ve
      if (abierto) borrarAvisosNtfy(abierto);
      return res.end(htmlCharlas);
    }
    // Charlas como app en la pantalla de inicio (16/11): manifiesto e íconos son públicos y no llevan ningún acceso.
    if (req.method === 'GET' && url.pathname === '/app/manifest.json') {
      res.writeHead(200, { 'content-type': 'application/manifest+json; charset=utf-8', 'cache-control': 'public, max-age=3600' });
      return res.end(JSON.stringify({ name: 'PuertoBox Charlas', short_name: 'PuertoBox', start_url: '/charlas', scope: '/', display: 'standalone', background_color: '#f5f5f5', theme_color: '#1a7f37', icons: [{ src: '/app/icono-192.png', sizes: '192x192', type: 'image/png' }, { src: '/app/icono-512.png', sizes: '512x512', type: 'image/png' }] }));
    }
    if (req.method === 'GET' && /^\/app\/icono-(180|192|512)\.png$/.test(url.pathname)) {
      res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'public, max-age=86400' });
      return fs.createReadStream(path.join(__dirname, '..', 'web', 'app', path.basename(url.pathname))).pipe(res);
    }
    // La app del celular guarda su propio acceso la primera vez, con la clave (como ?key=). Como mucho 10 intentos por hora.
    if (req.method === 'POST' && url.pathname === '/entrar') {
      let raw = ''; req.on('data', (c) => { raw += c; if (raw.length > 2000) req.destroy(); });
      return req.on('end', () => {
        const ahora = Date.now(); intentosEntrar.lista = intentosEntrar.lista.filter((t) => ahora - t < 3600e3);
        const clave = process.env.ADMIN_KEY || ADMIN_KEY;
        if (intentosEntrar.lista.length >= 10) { res.writeHead(429, { 'content-type': 'text/plain; charset=utf-8' }); return res.end('Demasiados intentos. Probá en una hora.'); }
        intentosEntrar.lista.push(ahora);
        const dada = (new URLSearchParams(raw).get('clave') || '').trim();
        const ok = clave && dada.length === clave.length && require('crypto').timingSafeEqual(Buffer.from(dada), Buffer.from(clave));
        if (!ok) { res.writeHead(401, { 'content-type': 'text/html; charset=utf-8' }); return res.end(SIN_ACCESO.replace('<h1>', '<p style="color:#a40000">Clave incorrecta.</p><h1>')); }
        res.writeHead(303, { location: '/charlas', 'set-cookie': cookiePanel() }); return res.end();
      });
    }
    // Gustavo marca que ya le pasó presupuesto (16/11): la tarjeta queda en verde.
    if (req.method === 'POST' && url.pathname === '/marcar-presu') {
      const tel = soloDigitos(url.searchParams.get('tel') || '');
      if (!tel || !firmaOk('marcarpresu:' + tel, url.searchParams.get('t'))) { res.writeHead(401, { 'content-type': 'text/plain; charset=utf-8' }); return res.end('Link vencido o incorrecto.'); }
      const si = url.searchParams.get('v') === '1';
      store.marcar(tel, si ? { presupuestoPasadoEn: Date.now() } : { presupuestoPasadoEn: null, presupuestoEnviadoEn: null });
      if (si && store.guardarLead) { const l = store.lead(tel) || {}; if (!l.estado || l.estado === 'nuevo') store.guardarLead(tel, { estado: 'cotizado' }); }
      if (store.marcarVisto) store.marcarVisto(tel);
      res.writeHead(303, { location: `/charlas?t=${firma('charlas')}&abierto=${tel}#c-${tel}` }); return res.end();
    }
    // Gustavo abrió una charla en /charlas: sus mensajes dejan de figurar como nuevos (15/11).
    if (req.method === 'POST' && url.pathname === '/visto') {
      const tel = soloDigitos(url.searchParams.get('tel') || '');
      if (!tel || !firmaOk('visto:' + tel, url.searchParams.get('t'))) { res.writeHead(401); return res.end(); }
      if (store.marcarVisto) store.marcarVisto(tel);
      borrarAvisosNtfy(tel);
      res.writeHead(204); return res.end();
    }
    // Circuito de aprendizaje (15/11): Gustavo corrige al bot desde /charlas; no le llega nada al cliente.
    if (req.method === 'POST' && url.pathname === '/corregir') {
      const tel = soloDigitos(url.searchParams.get('tel') || '');
      if (!tel || !firmaOk('corregir:' + tel, url.searchParams.get('t'))) { res.writeHead(401, { 'content-type': 'text/plain; charset=utf-8' }); return res.end('Link vencido o incorrecto.'); }
      let raw = ''; req.on('data', (c) => { raw += c; if (raw.length > 20000) req.destroy(); });
      return req.on('end', () => {
        const ok = require('./aprendizaje').agregarCorreccion(store, tel, new URLSearchParams(raw).get('texto') || '');
        res.writeHead(303, { location: `/charlas?t=${firma('charlas')}&abierto=${tel}${ok ? '&corregido=1' : '&error=' + encodeURIComponent('la corrección está vacía')}#c-${tel}` }); res.end();
      });
    }
    // Prueba completa del bot (15/11): corre en segundo plano y avisa por ntfy con el link al informe.
    if (req.method === 'POST' && url.pathname === '/prueba-completa') {
      if (!firmaOk('prueba', url.searchParams.get('t'))) { res.writeHead(401, { 'content-type': 'text/plain; charset=utf-8' }); return res.end('Link vencido o incorrecto.'); }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      const pag = (t) => `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="font-family:system-ui;padding:20px"><h2>${t}</h2><p><a href="/pendientes?t=${firma('pendientes')}">Volver a pendientes</a></p></body></html>`;
      if (pruebaEnCurso) return res.end(pag('Ya hay una prueba corriendo. Te aviso cuando termine.'));
      pruebaEnCurso = true;
      require('./prueba_completa').correr().then(async ({ texto, resumen }) => {
        const token = require('crypto').randomBytes(16).toString('hex');
        informes.set(token, texto);
        try { const dir = path.join(path.dirname(DATA_FILE || '/tmp/x'), 'pruebas'); fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, `${token}.md`), texto); } catch (e) { console.error('Informe:', e.message); }
        await avisarNtfy(`${resumen}\nInforme: ${BASE_URL()}/informe/${token}`, 'PuertoBox: prueba completa terminada', 'default', fetch);
      }).catch(async (e) => { console.error('Prueba completa:', e); await avisarNtfy(`La prueba completa falló: ${String(e.message).slice(0, 200)}`, 'PuertoBox: prueba completa con error', 'default', fetch); })
        .finally(() => { pruebaEnCurso = false; });
      return res.end(pag('Arrancó la prueba. Tarda unos 10 minutos: te llega un aviso con el informe.'));
    }
    if (req.method === 'GET' && url.pathname.startsWith('/informe/')) {
      const token = url.pathname.slice(9).replace(/[^0-9a-f]/g, '');
      let txt = informes.get(token);
      if (!txt && token.length === 32) { try { txt = fs.readFileSync(path.join(path.dirname(DATA_FILE || '/tmp/x'), 'pruebas', `${token}.md`), 'utf8'); } catch { /* no está */ } }
      if (!txt) { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); return res.end('Informe no encontrado.'); }
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' });
      return res.end(txt);
    }
    if (req.method === 'GET' && /^\/media\/[0-9a-f]{32}\.[a-z0-9]{1,5}$/.test(url.pathname)) {
      const archivo = path.join(DIR_MEDIA(), url.pathname.slice(7));
      if (!fs.existsSync(archivo)) { res.writeHead(404); return res.end('No encontrado'); }
      const ext = path.extname(archivo).slice(1);
      const tipo = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', pdf: 'application/pdf', ogg: 'audio/ogg', mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', amr: 'audio/amr', mp4: 'video/mp4', '3gp': 'video/3gpp' }[ext] || 'application/octet-stream';
      res.writeHead(200, { 'content-type': tipo, 'cache-control': 'private, max-age=86400', 'x-robots-tag': 'noindex', ...(tipo === 'application/octet-stream' ? { 'content-disposition': 'attachment' } : {}) });
      return fs.createReadStream(archivo).pipe(res);
    }
    // Presupuesto formal en PDF (15/11). El PDF se sirve por un código largo (lo necesita WhatsApp para descargarlo).
    if (req.method === 'GET' && /^\/presupuesto\/[0-9a-f]{32}\.pdf$/.test(url.pathname)) {
      const p = store.presupuesto(url.pathname.slice(13, 45));
      const lead = p && store.lead(p.tel);
      const datos = p && lead && require('../src/presupuesto_pdf').armarDatos({ nro: p.nro, lead, cliente: p.cliente, ahora: new Date(p.creado) });
      if (!datos) { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); return res.end('Presupuesto no encontrado.'); }
      return require('../src/presupuesto_pdf').pdf(datos).then((buf) => { res.writeHead(200, { 'content-type': 'application/pdf', 'content-disposition': `inline; filename="Presupuesto PuertoBox ${p.nro}.pdf"`, 'cache-control': 'no-store', 'x-robots-tag': 'noindex' }); res.end(buf); });
    }
    if (req.method === 'POST' && (url.pathname === '/presupuesto-ver' || url.pathname === '/presupuesto-enviar')) {
      const tel = soloDigitos(url.searchParams.get('tel') || '');
      if (!tel || !firmaOk('presu:' + tel, url.searchParams.get('t'))) { res.writeHead(401, { 'content-type': 'text/plain; charset=utf-8' }); return res.end('Link vencido o incorrecto.'); }
      let raw = ''; req.on('data', (c) => { raw += c; if (raw.length > 20000) req.destroy(); });
      return req.on('end', async () => {
        const f = new URLSearchParams(raw);
        const volver = (extra) => { res.writeHead(303, { location: `/charlas?t=${firma('charlas')}&abierto=${tel}${extra}#c-${tel}` }); res.end(); };
        // Posición corregida por Gustavo: se valida en ARCA, se recalcula y el bot la aprende (15/11).
        const corr = require('./certeza').aplicar(store, tel, f.get('pos'), require('./tools').ejecutar);
        if (corr.error) return volver('&error=' + encodeURIComponent(corr.error));
        const p = store.presupuestoDe(tel) && store.lead(tel).presupuesto && store.presupuestoDe(tel).cotizacionEn === (store.lead(tel).cotizacion || {}).en ? store.presupuestoDe(tel) : store.crearPresupuesto(tel);
        if (!p) return volver('&error=' + encodeURIComponent('ese cliente todavía no tiene una cotización completa'));
        store.actualizarPresupuesto(p.token, { cliente: { nombre: (f.get('nombre') || '').trim(), doc: (f.get('doc') || '').trim(), dom: (f.get('dom') || '').trim(), iva: (f.get('iva') || '').trim() } });
        const link = `${BASE_URL()}/presupuesto/${p.token}.pdf`;
        if (url.pathname === '/presupuesto-ver') { res.writeHead(303, { location: `/presupuesto/${p.token}.pdf` }); return res.end(); }
        const c = store.chats().find((x) => x.telefono === tel);
        if (!c || Date.now() - (c.ultimoClienteEn || 0) > 24 * 3600e3) return volver('&error=' + encodeURIComponent('pasaron más de 24 h desde su último mensaje'));
        const texto = `Te paso el presupuesto formal N° ${p.nro}. Cualquier duda, te la respondo por acá.`;
        try { await enviarDocumento(tel, link, `Presupuesto PuertoBox ${p.nro}.pdf`, texto); } catch (e) { return volver('&error=' + encodeURIComponent(String(e.message).slice(0, 120))); }
        store.agregar(tel, 'assistant', `[Gustavo] ${texto} (PDF)`);
        store.pausar(tel, 'gustavo_respondio');
        const ahora = Date.now();
        if (store.marcar) store.marcar(tel, { gustavoRespondioEn: ahora, recordatorios: 0, presupuestoEnviadoEn: ahora, ...(c.derivadoEn ? {} : { derivadoEn: ahora - 1, derivadoMotivo: 'listo_para_cerrar', derivadoResumen: 'Le mandaste el presupuesto formal.' }) });
        store.actualizarPresupuesto(p.token, { enviado: new Date(ahora).toISOString() });
        require('./certeza').registrar(store, tel, p.token);
        return volver('&ok=1');
      });
    }
    // Gustavo le contesta a un cliente desde la página de charlas: sale por el 6773 (API) y el bot se calla en ese chat (15/11).
    if (req.method === 'POST' && url.pathname === '/responder') {
      const tel = soloDigitos(url.searchParams.get('tel') || '');
      if (!tel || !firmaOk('responder:' + tel, url.searchParams.get('t'))) { res.writeHead(401, { 'content-type': 'text/plain; charset=utf-8' }); return res.end('Link vencido o incorrecto.'); }
      // 16/11 (Gustavo: "tengo que poder adjuntar archivos"): el formulario puede traer un archivo (PDF del presupuesto, foto, Excel...).
      const TOPE = 16 * 1024 * 1024;
      const partes = []; let largo = 0; let grande = false;
      req.on('data', (c) => { largo += c.length; if (largo > TOPE) { grande = true; return; } partes.push(c); });
      return req.on('end', async () => {
        const volver = (extra) => { res.writeHead(303, { location: `/charlas?t=${firma('charlas')}&abierto=${tel}${extra}#c-${tel}` }); res.end(); };
        if (grande) return volver('&error=' + encodeURIComponent('el archivo pesa más de 16 MB'));
        const cuerpo = Buffer.concat(partes);
        const ct = String(req.headers['content-type'] || '');
        const form = /multipart\/form-data/i.test(ct) ? leerMultipart(cuerpo, ct) : { campos: Object.fromEntries(new URLSearchParams(cuerpo.toString('utf8'))), archivo: null };
        const texto = String(form.campos.texto || '').trim();
        const archivo = form.archivo;
        if (!texto && !archivo) return volver('&error=' + encodeURIComponent('el mensaje está vacío'));
        const c = store.chats().find((x) => x.telefono === tel);
        if (!c || Date.now() - (c.ultimoClienteEn || 0) > 24 * 3600e3) return volver('&error=' + encodeURIComponent('pasaron más de 24 h desde su último mensaje'));
        let marca = '';
        try {
          if (archivo) {
            const ruta = require('./adjuntos').guardar(archivo.buf, archivo.tipo, DIR_MEDIA(), archivo.nombre);
            // WhatsApp solo muestra como foto JPG o PNG de hasta 5 MB; lo demás (fotos grandes del celular, webp) va como archivo, que llega siempre.
            const esFoto = /^image\/(jpeg|png)$/.test(archivo.tipo) && archivo.buf.length <= 4.5 * 1024 * 1024;
            await enviarDocumento(tel, `${BASE_URL()}${ruta}`, archivo.nombre, texto, fetch, esFoto ? 'image' : 'document');
            marca = ` [archivo:${ruta}]`;
          } else await enviar(tel, texto, fetch, { lanzar: true });
        } catch (e) { return volver('&error=' + encodeURIComponent(String(e.message).slice(0, 120))); }
        store.agregar(tel, 'assistant', `[Gustavo] ${texto || (archivo ? `Te mando ${archivo.nombre}` : '')}${marca}`);
        store.pausar(tel, 'gustavo_respondio');
        if (store.marcarVisto) store.marcarVisto(tel);
        borrarAvisosNtfy(tel);
        // Si el cliente le contesta a Gustavo, que aparezca en pendientes y le llegue el aviso (el bot ya no lo atiende).
        const ahora = Date.now();
        if (store.marcar) store.marcar(tel, { gustavoRespondioEn: ahora, recordatorios: 0, ...(c.derivadoEn ? {} : { derivadoEn: ahora - 1, derivadoMotivo: 'pide_humano', derivadoResumen: 'Le escribiste desde la página de charlas.' }) });
        return volver('&ok=1');
      });
    }
    if (req.method === 'GET' && url.pathname === '/leads' && ADMIN_KEY && url.searchParams.get('key') === ADMIN_KEY) {
      const leads = store.leads();
      const origenes = Object.fromEntries(store.chats().map((c) => [c.telefono, c.origen || '']));
      const cols = ['telefono', 'origen', 'nombre', 'producto', 'posicion', 'kg', 'valor_usd', 'precio_usd', 'tipo', 'estado', 'notas', 'actualizado'];
      const csv = [cols.join(','), ...leads.map((l) => cols.map((c) => JSON.stringify((c === 'origen' ? origenes[l.telefono] : l[c]) ?? '')).join(','))].join('\n');
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
  // 15/11: los links vencen a los 7 días; al arrancar, si hace más de 20 h que no recibió accesos nuevos, le llegan por ntfy
  // (botones "Ver pendientes" y "Ver charlas"), así nunca se queda sin poder entrar.
  setTimeout(() => {
    if (Date.now() - (store.meta('accesosEn') || 0) < 20 * 3600e3) return;
    avisarNtfy('Accesos actualizados: Pendientes (con el botón de Prueba completa) y Charlas. Los links vencen a los 7 días; cada mañana llegan nuevos con el resumen.', 'PuertoBox: accesos', 'low')
      .then((ok) => { if (ok) store.meta('accesosEn', Date.now()); }).catch(() => {});
  }, 20e3).unref();
  // Auditoría 15/11: lo que quedó sin contestar por un reinicio (deploy) se contesta al arrancar.
  setTimeout(() => {
    for (const c of pendientesSinResponder(store)) atender(c.telefono, '', store, fetch, soloDigitos(process.env.OWNER_NUMBER || OWNER_NUMBER), true).catch((e) => console.error('Sin responder:', e.message));
  }, 15e3).unref();
  if (process.env.IG_TOKEN) { renovarTokenIG(); setInterval(renovarTokenIG, 24 * 3600e3).unref(); }
  // Asistente de pendientes: cada 15 minutos revisa clientes sin respuesta y manda avisos por ntfy (y el resumen de las 9).
  const { revisar } = require('./recordatorios');
  const tic = () => revisar({ store, owner: soloDigitos(process.env.OWNER_NUMBER || OWNER_NUMBER), avisar: (t, titulo, prioridad, tel) => avisarNtfy(t, titulo, prioridad, fetch, tel), empujar: async (p) => { const txt = await require('./agent').empujon({ telefono: p.telefono, store, horas: p.horas, cotizado: p.cotizado }); if (txt) await enviar(p.telefono, txt); return !!txt; } }).catch((e) => console.error('Recordatorios:', e.message));
  const ticDifusion = () => require('./difusion').tick({ store, esGustavo: (tel) => require('./recordatorios').esGustavo(tel, soloDigitos(process.env.OWNER_NUMBER || OWNER_NUMBER)) }).catch((e) => console.error('Difusión:', e.message));
  // Circuito de aprendizaje (15/11): a las 23 h revisa las charlas del día y sube el informe (sin datos personales) a la rama aprendizaje-bot.
  const ticAprendizaje = () => require('./aprendizaje').tick({ store, owner: soloDigitos(process.env.OWNER_NUMBER || OWNER_NUMBER), reglas: require('./agent').SYSTEM, dirLocal: path.join(path.dirname(process.env.DATA_FILE || DATA_FILE), 'aprendizaje'), avisar: (t, titulo, prioridad) => avisarNtfy(t, titulo, prioridad, fetch) }).catch((e) => console.error('Aprendizaje:', e.message));
  setInterval(ticAprendizaje, 15 * 60e3).unref();
  setTimeout(ticAprendizaje, 2 * 60e3).unref(); // 16/11: si el servidor reinició y quedó pendiente la revisión, la hace al arrancar
  // Dólar de referencia automático (antes se cambiaba a mano cada semana).
  const dol = require('../src/dolar'); dol.actualizar(); setInterval(() => dol.actualizar(), 12 * 3600e3).unref();
  // Arancel ARCA (16/11, Gustavo: "que se mantenga actualizada"): se fija una vez por día si ARCA publicó uno nuevo.
  setTimeout(ticArancel, 3 * 60e3).unref(); setInterval(ticArancel, 24 * 3600e3).unref();
  setTimeout(() => { tic(); ticDifusion(); }, 60e3).unref(); setInterval(() => { tic(); ticDifusion(); }, 15 * 60e3).unref();
}
/** Chats con un mensaje del cliente guardado y sin respuesta (por un reinicio), dentro de la ventana de 24 h y sin pausa. */
function pendientesSinResponder(st, ahora = Date.now()) {
  return st.chats().filter((c) => c.sinResponder && ahora - (c.ultimoClienteEn || c.sinResponder) < 24 * 3600e3 && !st.estaPausado(c.telefono)
    && (c.mensajes || []).length && c.mensajes[c.mensajes.length - 1].role === 'user');
}

module.exports = { cotizarAMano, esMensajeAnuncio, borrarAvisosNtfy, avisarNtfy, avisoMensajeNuevo, leerMultipart, firmaOk, pendientesSinResponder, procesar, servidor, normalizar, firmaYCloudOk, transcribirAudio, avisarGustavo, accionesNtfy, firma, intencionGustavo, ticArancel };
