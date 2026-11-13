'use strict';
/**
 * Servidor del bot de WhatsApp (Cloud API + Coexistence).
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
  DATA_FILE = path.join(__dirname, 'data.json'), ADMIN_KEY,
} = process.env;
const GRAPH = 'https://graph.facebook.com/v21.0';
const store = crearStore(DATA_FILE);

async function enviar(to, body, fetchImpl = fetch) {
  const r = await fetchImpl(`${GRAPH}/${PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${WHATSAPP_TOKEN}` },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body } }),
  });
  if (!r.ok) console.error('WhatsApp error', r.status, await r.text());
}

async function procesar(payload, deps = {}) {
  const fetchImpl = deps.fetchImpl || fetch;
  const st = deps.store || store;
  const salidas = [];
  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      const v = change.value || {};
      // Gustavo respondió desde la app → pausar el bot en ese chat
      for (const eco of v.message_echoes || []) {
        const cliente = eco.to;
        const txt = eco.text?.body?.trim().toLowerCase();
        if (txt === '#bot') st.reanudar(cliente); else st.pausar(cliente, 'gustavo_respondio');
        if (eco.text?.body && txt !== '#bot') st.agregar(cliente, 'assistant', `[Gustavo] ${eco.text.body}`);
      }
      // Mensajes de clientes
      for (const msg of v.messages || []) {
        if (st.yaVisto(msg.id)) continue;
        const tel = msg.from;
        const texto = msg.type === 'text' ? msg.text.body
          : `[El cliente mandó un ${msg.type}${msg.image?.caption ? `: ${msg.image.caption}` : ''}. Pedile que lo describa por texto o derivá si hace falta.]`;
        if (st.estaPausado(tel)) { st.agregar(tel, 'user', texto); continue; }
        const derivaciones = [];
        const resp = await responder({ telefono: tel, texto, store: st, fetchImpl, derivaciones });
        if (resp) { await enviar(tel, resp, fetchImpl); salidas.push({ to: tel, body: resp }); }
        for (const d of derivaciones) {
          const aviso = `🔔 PuertoBox: ${d.motivo.replace(/_/g, ' ')}\nCliente: +${d.telefono}\n${d.resumen}\n(El bot quedó pausado en ese chat. Escribí "#bot" ahí para reactivarlo.)`;
          if (OWNER_NUMBER) await enviar(OWNER_NUMBER, aviso, fetchImpl);
          salidas.push({ to: OWNER_NUMBER, body: aviso });
        }
      }
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
module.exports = { procesar, servidor };
