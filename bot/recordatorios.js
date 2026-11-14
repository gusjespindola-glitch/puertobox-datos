'use strict';
/**
 * Asistente de pendientes de Gustavo (pedido del 14/11/2026).
 * - Cliente derivado (quiere pagar, pide persona, mayorista, reclamo) sin respuesta de Gustavo:
 *   aviso por ntfy a la hora y después cada 3 horas (máximo 4 avisos por espera). Importantes primero.
 * - Resumen diario a las 9 (hora argentina): esperando respuesta, presupuestos sin respuesta del cliente, dudas por confirmar.
 * - Nada de avisos entre las 22 y las 8 (se juntan para el resumen).
 * - "#pendientes" desde el número de Gustavo devuelve la lista en el momento.
 */
const H = 3600e3;
const PRIMER_AVISO_MIN = Number(process.env.RECORDATORIO_MIN || 60);
const CADA_HORAS = 3;
const MAX_AVISOS = 4;
const HORA_RESUMEN = 9;
const MOTIVOS_GUSTAVO = ['listo_para_cerrar', 'pide_humano', 'mayorista', 'reclamo'];
const NOMBRE_MOTIVO = { listo_para_cerrar: 'quiere avanzar/pagar', pide_humano: 'pidió hablar con vos', mayorista: 'pedido grande/mayorista', reclamo: 'reclamo', duda: 'duda para confirmar' };

/** Hora y fecha en Argentina (UTC-3, sin horario de verano). */
function horaAR(ahora) {
  const d = new Date(ahora - 3 * H);
  return { hora: d.getUTCHours(), fecha: d.toISOString().slice(0, 10) };
}
const silencio = (ahora) => { const { hora } = horaAR(ahora); return hora >= 22 || hora < 8; };

/**
 * WhatsApp deja contestar gratis y con texto libre solo dentro de las 24 h desde el último mensaje del cliente.
 * Después hace falta una plantilla aprobada. Devuelve las horas que quedan (0 si ya venció).
 */
const ventana = (ultimoCliente, ahora) => (ultimoCliente ? Math.max(0, 24 - (ahora - ultimoCliente) / H) : 0);
const textoVentana = (q) => (q <= 0 ? 'ya pasaron 24 h: por WhatsApp solo con plantilla' : q < 1 ? 'te queda menos de 1 h para contestarle por WhatsApp' : `te quedan ${Math.floor(q)} h para contestarle por WhatsApp`);

function hace(ms) {
  const min = Math.round(ms / 60e3);
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  return h < 48 ? `hace ${h} h` : `hace ${Math.round(h / 24)} días`;
}

/** Un cliente es importante si quiere pagar, es mayorista o el pedido es de USD 1.000 o más. */
function esImportante(c, lead) {
  return c.derivadoMotivo === 'listo_para_cerrar' || c.derivadoMotivo === 'mayorista' || Number(lead?.valor_usd) >= 1000;
}

function describir(c, lead, ahora) {
  const quien = lead?.nombre ? `${lead.nombre} (+${c.telefono})` : `+${c.telefono}`;
  const que = [lead?.producto, lead?.valor_usd ? `USD ${lead.valor_usd}` : null, lead?.kg ? `${lead.kg} kg` : null].filter(Boolean).join(' · ');
  return `${quien}${que ? ` — ${que}` : ''}`;
}

/** Clasifica todos los chats. Devuelve { esperando, seguimiento, dudas } ordenados (importantes y más viejos primero). */
function pendientes(store, owner, ahora = Date.now()) {
  const esperando = []; const seguimiento = []; const dudas = [];
  for (const c of store.chats()) {
    if (!c.telefono || c.telefono === owner) continue;
    const lead = store.lead ? store.lead(c.telefono) : null;
    const respondio = c.gustavoRespondioEn || 0;
    const ultimoCliente = c.ultimoClienteEn || 0;
    if (c.derivadoEn && MOTIVOS_GUSTAVO.includes(c.derivadoMotivo)) {
      // Espera respuesta si Gustavo no contestó desde la derivación o el cliente volvió a escribir después.
      // Si el cliente volvió a escribir después de que Gustavo contestó, solo cuenta si el bot sigue pausado
      // (si la pausa venció, lo está atendiendo el bot y no hay que molestar a Gustavo).
      const pausado = (c.pausadoHasta || 0) > ahora;
      const sinRespuesta = respondio < c.derivadoEn;
      const volvio = respondio >= c.derivadoEn && respondio < ultimoCliente && pausado;
      if (sinRespuesta || volvio) {
        const desde = volvio ? ultimoCliente : c.derivadoEn;
        esperando.push({ c, lead, desde, importante: esImportante(c, lead), quedanH: ventana(ultimoCliente, ahora) });
        continue;
      }
    }
    if (c.derivadoEn && c.derivadoMotivo === 'duda' && respondio < c.derivadoEn && ahora - c.derivadoEn < 7 * 24 * H) {
      dudas.push({ c, lead, desde: c.derivadoEn });
      continue;
    }
    // Presupuesto mandado y el cliente no volvió a escribir en más de 24 h (hasta 7 días): para hacer seguimiento.
    if (lead?.estado === 'cotizado' && ultimoCliente && ahora - ultimoCliente > 24 * H && ahora - ultimoCliente < 7 * 24 * H) {
      seguimiento.push({ c, lead, desde: ultimoCliente, importante: esImportante(c, lead) });
    }
  }
  const orden = (a, b) => (b.importante ? 1 : 0) - (a.importante ? 1 : 0) || a.desde - b.desde;
  return { esperando: esperando.sort(orden), seguimiento: seguimiento.sort(orden), dudas: dudas.sort(orden) };
}

function linea(p, ahora, conMotivo = true) {
  const estrella = p.importante ? '⭐ ' : '';
  const motivo = conMotivo && p.c.derivadoMotivo ? ` (${NOMBRE_MOTIVO[p.c.derivadoMotivo] || p.c.derivadoMotivo})` : '';
  const v = p.quedanH !== undefined ? ` (${textoVentana(p.quedanH)})` : '';
  return `${estrella}${describir(p.c, p.lead, ahora)}${motivo}, ${hace(ahora - p.desde)}${v}`;
}

/** Texto completo de pendientes (para el resumen y el comando #pendientes). */
function textoPendientes(store, owner, ahora = Date.now()) {
  const { esperando, seguimiento, dudas } = pendientes(store, owner, ahora);
  if (!esperando.length && !seguimiento.length && !dudas.length) return 'No tenés clientes pendientes. Todo al día.';
  const partes = [];
  if (esperando.length) partes.push(`Esperan tu respuesta (${esperando.length}):\n${esperando.map((p) => '- ' + linea(p, ahora)).join('\n')}`);
  if (dudas.length) partes.push(`Dudas para confirmar (${dudas.length}):\n${dudas.map((p) => '- ' + linea(p, ahora, false) + (p.c.derivadoResumen ? `: ${String(p.c.derivadoResumen).slice(0, 120)}` : '')).join('\n')}`);
  if (seguimiento.length) partes.push(`Presupuesto enviado, no volvieron a escribir (${seguimiento.length}) — conviene un mensaje de seguimiento (pasaron más de 24 h: desde la línea del bot hace falta una plantilla de WhatsApp):\n${seguimiento.map((p) => '- ' + linea(p, ahora, false)).join('\n')}`);
  return partes.join('\n\n');
}

/** Números de las últimas 24 h para saber cómo viene la venta: consultas nuevas → presupuestos → quieren pagar. */
function embudo(store, owner, ahora = Date.now()) {
  const desde = ahora - 24 * H;
  const leads = (store.leads ? store.leads() : []).filter((l) => l.telefono !== owner && Date.parse(l.creado || 0) >= desde);
  const cotizados = leads.filter((l) => ['cotizado', 'listo_para_cerrar'].includes(l.estado) || l.precio_usd).length;
  const pagar = leads.filter((l) => l.estado === 'listo_para_cerrar').length;
  // Del anuncio de Meta: chats que entraron por el link del anuncio (aunque el bot todavía no haya guardado datos).
  const chatsAnuncio = (store.chats ? store.chats() : []).filter((c) => c.origen === 'anuncio' && c.telefono !== owner && (c.origenEn || 0) >= desde);
  const leadAnuncio = (tel) => (store.lead ? store.lead(tel) : null) || {};
  const anuncio = {
    chats: chatsAnuncio.length,
    cotizados: chatsAnuncio.filter((c) => { const l = leadAnuncio(c.telefono); return ['cotizado', 'listo_para_cerrar'].includes(l.estado) || l.precio_usd; }).length,
    pagar: chatsAnuncio.filter((c) => leadAnuncio(c.telefono).estado === 'listo_para_cerrar').length,
  };
  const textoAnuncio = anuncio.chats ? `\nDel anuncio de Meta: ${anuncio.chats} escribieron · ${anuncio.cotizados} con presupuesto · ${anuncio.pagar} quieren pagar.` : '';
  return { consultas: leads.length, cotizados, pagar, anuncio, texto: `Últimas 24 h: ${leads.length} consultas nuevas · ${cotizados} con presupuesto · ${pagar} quieren pagar.${textoAnuncio}` };
}

/** Corre cada 15 minutos: avisos de clientes esperando y resumen diario. */
async function revisar({ store, owner, avisar, ahora = Date.now() }) {
  const enviados = [];
  if (!silencio(ahora)) {
    const { esperando } = pendientes(store, owner, ahora);
    for (const p of esperando) {
      const veces = p.c.recordatorios || 0;
      const espera = ahora - p.desde;
      const toca = veces === 0 ? espera >= PRIMER_AVISO_MIN * 60e3 : ahora - (p.c.ultimoRecordatorio || 0) >= CADA_HORAS * H;
      const porVencer = p.quedanH > 0 && p.quedanH < 3 && !p.c.avisoVentana;
      if (porVencer) {
        await avisar(`⏳ Se te vence la ventana de WhatsApp con ${describir(p.c, p.lead, ahora)}: ${textoVentana(p.quedanH)}. Después solo se le puede escribir con una plantilla.`, 'PuertoBox: se vence el plazo para contestar', 'high', p.c.telefono);
        store.marcar(p.c.telefono, { avisoVentana: true, ultimoRecordatorio: ahora });
        enviados.push(p.c.telefono);
        continue;
      }
      if (!toca || veces >= MAX_AVISOS) continue;
      const texto = `${p.importante ? '⭐ IMPORTANTE. ' : ''}Cliente esperando tu respuesta ${hace(espera)} (${textoVentana(p.quedanH)}):\n${describir(p.c, p.lead, ahora)}\nMotivo: ${NOMBRE_MOTIVO[p.c.derivadoMotivo] || p.c.derivadoMotivo}${p.c.derivadoResumen ? `\n${String(p.c.derivadoResumen).slice(0, 300)}` : ''}\nSi ya lo atendiste, tocá «Ya lo atendí».`;
      await avisar(texto, p.importante ? 'PuertoBox: cliente importante esperando' : 'PuertoBox: cliente esperando', p.importante ? 'high' : 'default', p.c.telefono);
      store.marcar(p.c.telefono, { recordatorios: veces + 1, ultimoRecordatorio: ahora });
      enviados.push(p.c.telefono);
    }
  }
  const { hora, fecha } = horaAR(ahora);
  if (hora >= HORA_RESUMEN && hora < 22 && store.meta('resumenDia') !== fecha) {
    store.meta('resumenDia', fecha);
    const pend = textoPendientes(store, owner, ahora);
    const e = embudo(store, owner, ahora);
    if (pend !== 'No tenés clientes pendientes. Todo al día.' || e.consultas || e.anuncio.chats) {
      await avisar(`${e.texto}\n\n${pend}`, 'PuertoBox: resumen del dia', 'default');
      enviados.push('resumen');
    }
  }
  return enviados;
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Página para el celular: lista de pendientes con un botón "Ya lo atendí" por cliente. */
function paginaPendientes(store, owner, linkAtendido, ahora = Date.now()) {
  const { esperando, seguimiento, dudas } = pendientes(store, owner, ahora);
  const fila = (p, conBoton) => `<li><div><b>${p.importante ? '⭐ ' : ''}${esc(describir(p.c, p.lead, ahora))}</b><br><small>${esc(NOMBRE_MOTIVO[p.c.derivadoMotivo] || '')}${p.c.derivadoMotivo ? ' · ' : ''}${esc(hace(ahora - p.desde))}</small>${p.c.derivadoResumen ? `<p>${esc(String(p.c.derivadoResumen).slice(0, 300))}</p>` : ''}</div>${conBoton ? `<form method="post" action="${esc(linkAtendido(p.c.telefono))}"><button>Ya lo atendí</button></form>` : ''}</li>`;
  const bloque = (titulo, lista, conBoton) => lista.length ? `<h2>${titulo} (${lista.length})</h2><ul>${lista.map((p) => fila(p, conBoton)).join('')}</ul>` : '';
  const cuerpo = bloque('Esperan tu respuesta', esperando, true) + bloque('Dudas para confirmar', dudas, true) + bloque('Presupuesto enviado, no volvieron a escribir', seguimiento, true);
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Pendientes PuertoBox</title>
<style>body{font-family:system-ui,sans-serif;margin:0;padding:16px;background:#f5f5f5;color:#111}h1{font-size:20px}h2{font-size:16px;margin-top:24px}ul{list-style:none;padding:0}li{background:#fff;border-radius:12px;padding:14px;margin-bottom:10px;display:flex;flex-direction:column;gap:10px}p{margin:6px 0 0;font-size:14px;color:#444}small{color:#666}button{width:100%;padding:12px;font-size:16px;border:0;border-radius:10px;background:#1a7f37;color:#fff}.wa{display:inline-block;margin-top:8px;font-size:14px}</style></head>
<body><h1>Pendientes PuertoBox</h1>${cuerpo || '<p>No tenés clientes pendientes. Todo al día.</p>'}</body></html>`;
}

module.exports = { pendientes, textoPendientes, revisar, silencio, horaAR, paginaPendientes, embudo };
