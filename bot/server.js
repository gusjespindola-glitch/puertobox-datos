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

async function enviar(to, body, fetchImpl = fetch) {
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
    ev.push({ tipo: 'mensaje', id: m.wamid || m.id, from: soloDigitos(m.from), type: m.type, text: m.text, image: m.image });
  }
  if ((payload.type === 'whatsapp.echo_message.created') && payload.whatsappMessage) {
    const m = payload.whatsappMessage;
    ev.push({ tipo: 'eco', to: soloDigitos(m.to), text: m.text });
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

async function procesar(payload, deps = {}) {
  const fetchImpl = deps.fetchImpl || fetch;
  const st = deps.store || store;
  const owner = soloDigitos(process.env.OWNER_NUMBER || OWNER_NUMBER);
  const salidas = [];
  for (const e of normalizar(payload)) {
    if (e.tipo === 'eco') {
      // Gustavo respondió desde la app o la bandeja → pausar el bot en ese chat
      const txt = e.text?.body?.trim().toLowerCase();
      if (txt === '#bot') st.reanudar(e.to); else st.pausar(e.to, 'gustavo_respondio');
      if (e.text?.body && txt !== '#bot') st.agregar(e.to, 'assistant', `[Gustavo] ${e.text.body}`);
      continue;
    }
    if (st.yaVisto(e.id)) continue;
    const tel = e.from;
    // Comandos de Gustavo desde su número personal: "#pausa 549..." o "#bot 549..."
    if (owner && tel === owner && e.type === 'text' && e.text.body.trim().startsWith('#')) {
      const [cmd, num] = e.text.body.trim().split(/\s+/);
      const cliente = soloDigitos(num);
      let r = 'Comandos: #pausa 549XXXXXXXXXX (callar el bot en ese chat) · #bot 549XXXXXXXXXX (reactivarlo)';
      if (cmd.toLowerCase() === '#pausa' && cliente) { st.pausar(cliente, 'manual'); r = `Bot pausado con +${cliente}.`; }
      if (cmd.toLowerCase() === '#bot' && cliente) { st.reanudar(cliente); r = `Bot reactivado con +${cliente}.`; }
      await enviar(owner, r, fetchImpl); salidas.push({ to: owner, body: r });
      continue;
    }
    const texto = e.type === 'text' ? e.text.body
      : `[El cliente mandó un ${e.type}${e.image?.caption ? `: ${e.image.caption}` : ''}. Pedile que lo describa por texto o derivá si hace falta.]`;
    if (st.estaPausado(tel)) { st.agregar(tel, 'user', texto); continue; }
    const derivaciones = [];
    const resp = await responder({ telefono: tel, texto, store: st, fetchImpl, derivaciones });
    if (resp) { await enviar(tel, resp, fetchImpl); salidas.push({ to: tel, body: resp }); }
    for (const d of derivaciones) {
      const aviso = `🔔 PuertoBox: ${d.motivo.replace(/_/g, ' ')}\nCliente: +${d.telefono}\n${d.resumen}\n(El bot quedó pausado en ese chat. Para reactivarlo mandá: #bot ${d.telefono})`;
      if (owner) await enviar(owner, aviso, fetchImpl);
      salidas.push({ to: owner, body: aviso });
    }
  }
  return salidas;
}

function servidor() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    if (req.method === 'GET' && url.pathname === '/webhook') {
      const ok = url.searchParams.get('hub.mode') === 'subscribe' && url.searchParams.get('hub.verify_token') === VERIFY_TOKEN;
      res.writeHead(ok ? 200 : 403); return res.end(ok ? url.searchParams.get('hub.challenge') : 'forbidden');
    }
    if (req.method === 'POST' && url.pathname === '/webhook') {
      let raw = ''; req.on('data', (c) => (raw += c));
      req.on('end', () => {
        res.writeHead(200); res.end('ok'); // Meta pide responder rápido
        procesar(JSON.parse(raw || '{}')).catch((e) => console.error(e));
      });
      return;
    }
    if (req.method === 'GET' && url.pathname === '/leads' && ADMIN_KEY && url.searchParams.get('key') === ADMIN_KEY) {
      const leads = store.leads();
      const cols = ['telefono', 'nombre', 'producto', 'posicion', 'kg', 'valor_usd', 'precio_usd', 'tipo', 'estado', 'notas', 'actualizado'];
      const csv = [cols.join(','), ...leads.map((l) => cols.map((c) => JSON.stringify(l[c] ?? '')).join(','))].join('\n');
      res.writeHead(200, { 'content-type': 'text/csv; charset=utf-8' }); return res.end(csv);
    }
    res.writeHead(200); res.end('PuertoBox bot ok');
  });
}

if (require.main === module) servidor().listen(PORT, () => console.log(`Bot escuchando en :${PORT}`));
module.exports = { procesar, servidor, normalizar };
