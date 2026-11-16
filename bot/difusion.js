'use strict';
/**
 * Difusión (14/11, pedido de Gustavo): volver a escribirles desde el 6773 a los que consultaron en el 698
 * y quedaron sin seguir. Fuera de las 24 h, WhatsApp solo deja mandar una plantilla aprobada por Meta (de marketing,
 * ~USD 0,07 por mensaje entregado). Cuando alguien contesta, lo atiende el bot como a cualquier cliente.
 *
 * - Los números se cargan desde la página /difusion (nunca van al repo: son datos de clientes).
 * - Se manda de a poco: hasta DIARIO por día, de 10 a 20 h, LOTE por cada vuelta de 15 min.
 * - Nunca a: números de Gustavo, a quien ya habla con el bot, a quien ya recibió la difusión, a quien pidió BAJA.
 */
const YC = 'https://api.ycloud.com/v2';
const DIARIO = 50, LOTE = 10;

const PLANTILLA = {
  name: 'puertobox_retomar_consulta',
  language: 'es_AR',
  category: 'MARKETING',
  text: 'Hola, te escribimos de PuertoBox. Nos consultaste en nuestro WhatsApp 221 698-2199 por traer productos de China. Ahora te cotizamos al instante por este número: flete con precio cerrado y te decimos los impuestos antes de que compres. ¿Tenés algo para traer? Respondé este mensaje y te pasamos cuánto te cuesta puesto en tu casa. Si no querés recibir más mensajes, respondé BAJA.',
};

const soloDigitos = (s) => String(s || '').replace(/\D/g, '');
const horaAR = (t) => { const d = new Date(t - 3 * 3600e3); return { hora: d.getUTCHours(), fecha: d.toISOString().slice(0, 10) }; };

/** Lleva cualquier forma de escribir un celular argentino a 549 + área + número. Devuelve null si no parece válido. */
function normalizar(n) {
  let d = soloDigitos(n);
  if (!d) return null;
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('0')) d = '54' + d.slice(1);
  if (!d.startsWith('54')) d = '54' + d;
  if (!d.startsWith('549')) d = '549' + d.slice(2);
  d = d.replace(/^549(\d{2,4})15(\d{6,8})$/, (m, a, r) => (a.length + r.length === 10 ? `549${a}${r}` : m));
  return d.length === 13 ? d : null;
}

function estado(store) {
  const s = store.meta('difusion') || {};
  return { cola: s.cola || [], enviados: s.enviados || {}, bajas: s.bajas || [], plantilla: s.plantilla || null, wabaId: s.wabaId || null, porDia: s.porDia || {} };
}
const guardar = (store, s) => store.meta('difusion', s);

/** Carga números (texto libre, uno por línea o separados por coma). Devuelve cuántos se agregaron y cuántos se saltearon. */
function cargar(store, texto, esGustavo = () => false) {
  const s = estado(store);
  const yaHablan = new Set((store.chats ? store.chats() : []).filter((c) => (c.mensajes || []).length).map((c) => c.telefono));
  let agregados = 0, salteados = 0;
  for (const crudo of String(texto || '').split(/[\n,;]+/)) {
    if (!soloDigitos(crudo)) continue;
    const tel = normalizar(crudo);
    if (!tel || esGustavo(tel) || s.cola.includes(tel) || s.enviados[tel] || s.bajas.includes(tel) || yaHablan.has(tel)) { salteados++; continue; }
    s.cola.push(tel); agregados++;
  }
  guardar(store, s);
  return { agregados, salteados, enCola: s.cola.length };
}

async function yc(path, opciones, fetchImpl) {
  const r = await fetchImpl(YC + path, { ...opciones, headers: { 'content-type': 'application/json', 'x-api-key': process.env.YCLOUD_API_KEY, ...(opciones && opciones.headers) } });
  const txt = await r.text();
  let json = null; try { json = JSON.parse(txt); } catch { /* sin json */ }
  return { ok: r.ok, status: r.status, json, txt };
}

/** Busca el WABA del número del bot, crea la plantilla si falta y devuelve su estado (APPROVED, PENDING, REJECTED...). */
async function asegurarPlantilla(store, fetchImpl = fetch, numeroBot = process.env.BUSINESS_NUMBER, ahora = Date.now()) {
  const s = estado(store);
  if (!s.wabaId) {
    const r = await yc('/whatsapp/phoneNumbers?limit=100', { method: 'GET' }, fetchImpl);
    const items = (r.json && (r.json.items || r.json.data)) || [];
    const mio = items.find((p) => soloDigitos(p.phoneNumber || p.displayPhoneNumber).endsWith(soloDigitos(numeroBot).slice(-10))) || items[0];
    if (!mio || !mio.wabaId) throw new Error('No encontré la cuenta de WhatsApp en YCloud: ' + r.txt.slice(0, 200));
    s.wabaId = mio.wabaId;
  }
  const ruta = `/whatsapp/templates/${encodeURIComponent(s.wabaId)}/${PLANTILLA.name}/${PLANTILLA.language}`;
  let r = await yc(ruta, { method: 'GET' }, fetchImpl);
  if (r.status === 404 || (!r.ok && /not.?found/i.test(r.txt))) {
    r = await yc('/whatsapp/templates', { method: 'POST', body: JSON.stringify({ wabaId: s.wabaId, name: PLANTILLA.name, language: PLANTILLA.language, category: PLANTILLA.category, components: [{ type: 'BODY', text: PLANTILLA.text }] }) }, fetchImpl);
    if (!r.ok) throw new Error('YCloud no aceptó la plantilla: ' + r.txt.slice(0, 300));
  } else if (!r.ok) throw new Error('No pude leer la plantilla en YCloud: ' + r.txt.slice(0, 300));
  s.plantilla = { estado: (r.json && r.json.status) || 'PENDING', motivo: r.json && (r.json.reason || r.json.rejectedReason) || null, revisada: ahora };
  guardar(store, s);
  return s.plantilla;
}

async function enviarPlantilla(tel, fetchImpl = fetch, numeroBot = process.env.BUSINESS_NUMBER) {
  const r = await yc('/whatsapp/messages/sendDirectly', { method: 'POST', body: JSON.stringify({ from: `+${soloDigitos(numeroBot)}`, to: `+${tel}`, type: 'template', template: { name: PLANTILLA.name, language: { code: PLANTILLA.language } } }) }, fetchImpl);
  if (!r.ok) throw new Error(`YCloud ${r.status}: ${r.txt.slice(0, 200)}`);
  return r.json;
}

/** Cada 15 min: si la plantilla está aprobada y es horario, manda el próximo lote. */
async function tick({ store, ahora = Date.now(), fetchImpl = fetch, esGustavo = () => false, revisarPlantilla = true }) {
  const s = estado(store);
  if (!s.cola.length) return [];
  if (revisarPlantilla && (!s.plantilla || (s.plantilla.estado !== 'APPROVED' && ahora - (s.plantilla.revisada || 0) > 14 * 60e3))) {
    try { await asegurarPlantilla(store, fetchImpl, undefined, ahora); } catch (e) { console.error('Difusión:', e.message); return []; }
  }
  const s2 = estado(store);
  if (!s2.plantilla || s2.plantilla.estado !== 'APPROVED') return [];
  const { hora, fecha } = horaAR(ahora);
  if (hora < 10 || hora >= 20) return [];
  const hoy = s2.porDia[fecha] || 0;
  const cupo = Math.min(LOTE, DIARIO - hoy);
  const enviados = [];
  const hablan = new Set((store.chats ? store.chats() : []).filter((c) => (c.mensajes || []).length).map((c) => c.telefono));
  while (enviados.length < cupo && s2.cola.length) {
    const tel = s2.cola.shift();
    if (esGustavo(tel) || s2.bajas.includes(tel) || s2.enviados[tel] || hablan.has(tel)) continue;
    try {
      await enviarPlantilla(tel, fetchImpl);
      s2.enviados[tel] = ahora; enviados.push(tel);
      if (store.marcar) store.marcar(tel, { difusionEn: ahora });
    } catch (e) { console.error('Difusión, no salió a', tel, e.message); s2.enviados[tel] = -ahora; }
  }
  s2.porDia[fecha] = hoy + enviados.length;
  guardar(store, s2);
  return enviados;
}

function darDeBaja(store, tel) {
  const s = estado(store);
  if (!s.bajas.includes(tel)) s.bajas.push(tel);
  s.cola = s.cola.filter((t) => t !== tel);
  guardar(store, s);
}
const esBaja = (texto) => /^\s*(baja|dar de baja|no me escriban m[aá]s|stop)\s*[.!]*\s*$/i.test(String(texto || ''));

const esc = (x) => String(x ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const NOMBRE_ESTADO = { APPROVED: '✅ Aprobada por Meta: se está mandando', PENDING: '⏳ Esperando que Meta la apruebe (minutos u horas)', REJECTED: '❌ Meta la rechazó', IN_APPEAL: '⏳ En revisión' };

function pagina(store, accion, mensaje = '') {
  const s = estado(store);
  const total = Object.keys(s.enviados).length;
  const ok = Object.values(s.enviados).filter((t) => t > 0).length;
  const contestaron = (store.chats ? store.chats() : []).filter((c) => c.difusionEn && (c.ultimoClienteEn || 0) > c.difusionEn).length;
  const pl = s.plantilla ? `${NOMBRE_ESTADO[s.plantilla.estado] || s.plantilla.estado}${s.plantilla.motivo ? ` (${esc(s.plantilla.motivo)})` : ''}` : 'Todavía no se pidió a Meta: se pide sola al cargar los números.';
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Difusión PuertoBox</title>
<style>body{font-family:system-ui,sans-serif;margin:0;padding:16px;background:#f5f5f5;color:#111}h1{font-size:20px}.card{background:#fff;border-radius:12px;padding:14px;margin-bottom:12px}textarea{width:100%;box-sizing:border-box;min-height:160px;font-size:15px;padding:10px;border-radius:10px;border:1px solid #ccc}button{width:100%;padding:14px;font-size:16px;border:0;border-radius:10px;background:#1a7f37;color:#fff;margin-top:10px}.n{font-size:28px;font-weight:700}.ok{background:#e6f4ea;color:#1a7f37;padding:10px;border-radius:10px}p{margin:6px 0}small{color:#666}</style></head>
<body><h1>Mensaje a clientes anteriores</h1>${mensaje ? `<p class="ok">${esc(mensaje)}</p>` : ''}
<div class="card"><b>Mensaje:</b> ${pl}<p><small>${esc(PLANTILLA.text)}</small></p></div>
<div class="card"><p>Para mandar: <span class="n">${s.cola.length}</span></p><p>Enviados: <b>${ok}</b>${total - ok ? ` · no salieron: ${total - ok}` : ''} · Contestaron: <b>${contestaron}</b> · Pidieron BAJA: <b>${s.bajas.length}</b></p><p><small>Sale de a ${DIARIO} por día, de 10 a 20 h. Los que contestan los atiende el bot (los ves en Charlas).</small></p></div>
<div class="card"><form method="post" action="${esc(accion)}"><b>Agregar números</b><p><small>Pegá los números, uno por renglón. Los repetidos, los tuyos y los que ya hablan con el bot se saltean solos.</small></p><textarea name="numeros" placeholder="+54 9 11 1234-5678"></textarea><button>Cargar y mandar</button></form></div></body></html>`;
}

module.exports = { PLANTILLA, normalizar, cargar, asegurarPlantilla, enviarPlantilla, tick, darDeBaja, esBaja, pagina, estado, DIARIO };
