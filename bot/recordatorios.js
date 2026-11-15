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
/** ¿Es un número de Gustavo? (OWNER_NUMBER y negocio.json → numeros_gustavo): sus pruebas no cuentan como clientes. */
function esGustavo(tel, owner) {
  if (!tel) return false;
  if (tel === owner) return true;
  if (['447974905090', '447480784000', '16505434800', '13105850000'].includes(String(tel))) return true; // números de Meta (códigos de verificación): no son clientes
  let propios = [];
  try { propios = require('../src/negocio').datos().numeros_gustavo || []; } catch { /* sin datos */ }
  return propios.includes(String(tel));
}

function pendientes(store, owner, ahora = Date.now()) {
  const esperando = []; const seguimiento = []; const dudas = [];
  for (const c of store.chats()) {
    if (!c.telefono || esGustavo(c.telefono, owner)) continue;
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
  const leads = (store.leads ? store.leads() : []).filter((l) => !esGustavo(l.telefono, owner) && Date.parse(l.creado || 0) >= desde);
  const cotizados = leads.filter((l) => ['cotizado', 'listo_para_cerrar'].includes(l.estado) || l.precio_usd).length;
  const pagar = leads.filter((l) => l.estado === 'listo_para_cerrar').length;
  // Del anuncio de Meta: chats que entraron por el link del anuncio (aunque el bot todavía no haya guardado datos).
  const chatsAnuncio = (store.chats ? store.chats() : []).filter((c) => c.origen === 'anuncio' && !esGustavo(c.telefono, owner) && (c.origenEn || 0) >= desde);
  const leadAnuncio = (tel) => (store.lead ? store.lead(tel) : null) || {};
  const anuncio = {
    chats: chatsAnuncio.length,
    cotizados: chatsAnuncio.filter((c) => { const l = leadAnuncio(c.telefono); return ['cotizado', 'listo_para_cerrar'].includes(l.estado) || l.precio_usd; }).length,
    pagar: chatsAnuncio.filter((c) => leadAnuncio(c.telefono).estado === 'listo_para_cerrar').length,
  };
  const del698 = (store.chats ? store.chats() : []).filter((c) => c.origen === '698' && !esGustavo(c.telefono, owner) && (c.origenEn || 0) >= desde).length;
  const texto698 = del698 ? `\nDesde el 698 (link del automático): ${del698} llegaron al bot.` : '';
  const textoAnuncio = anuncio.chats ? `\nDel anuncio de Meta: ${anuncio.chats} escribieron · ${anuncio.cotizados} con presupuesto · ${anuncio.pagar} quieren pagar.` : '';
  return { consultas: leads.length, cotizados, pagar, anuncio, del698, texto: `Últimas 24 h: ${leads.length} consultas nuevas · ${cotizados} con presupuesto · ${pagar} quieren pagar.${textoAnuncio}${texto698}` };
}

/**
 * Empujones (seguimiento automático por WhatsApp, 14/11): clientes que dejaron de contestar después de un mensaje del bot.
 * Uno solo por silencio, entre 4 y 22 h después del último mensaje del cliente (dentro de las 24 h gratis de WhatsApp),
 * de 9 a 21 h. No a los números de Gustavo, ni a chats pausados o derivados que esperan a Gustavo, ni a Instagram.
 */
const EMPUJON_DESDE_H = 4, EMPUJON_HASTA_H = 22;
function paraEmpujar(store, owner, ahora = Date.now()) {
  const { hora } = horaAR(ahora);
  if (hora < 9 || hora >= 21) return [];
  const out = [];
  for (const c of store.chats()) {
    if (!c.telefono || String(c.telefono).startsWith('ig:') || esGustavo(c.telefono, owner)) continue;
    const ult = c.ultimoClienteEn || 0;
    const pasaron = (ahora - ult) / H;
    if (!ult || pasaron < EMPUJON_DESDE_H || pasaron > EMPUJON_HASTA_H) continue;
    if ((c.pausadoHasta || 0) > ahora) continue;
    if ((c.empujonEn || 0) > ult) continue;
    const msgs = c.mensajes || [];
    if (!msgs.length || msgs[msgs.length - 1].role !== 'assistant') continue;
    const lead = store.lead ? store.lead(c.telefono) : null;
    // 15/11: al que dijo "no gracias" (rechazado) no se le vuelve a escribir.
    if (lead && ['listo_para_cerrar', 'derivado', 'rechazado'].includes(lead.estado)) continue;
    const ultCliente = [...msgs].reverse().find((m) => m.role === 'user');
    if (ultCliente && /\bno,?\s*grac+ia+s+\b|\bno me interesa|\blo dejo\b|\bno por ahora\b/i.test(ultCliente.content || '')) continue;
    out.push({ telefono: c.telefono, horas: Math.round(pasaron), cotizado: lead?.estado === 'cotizado' });
  }
  return out;
}

/** Corre cada 15 minutos: avisos de clientes esperando y resumen diario. */
async function revisar({ store, owner, avisar, empujar, ahora = Date.now() }) {
  const enviados = [];
  if (empujar) {
    for (const p of paraEmpujar(store, owner, ahora)) {
      store.marcar(p.telefono, { empujonEn: ahora }); // primero se marca: si falla el envío, no se reintenta en loop
      try { if (await empujar(p)) enviados.push('empujon:' + p.telefono); } catch (e) { console.error('Empujón:', e.message); }
    }
  }
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
      // 15/11: corto, lo importante arriba (qué quiere y qué tenés que hacer).
      const texto = [`${p.importante ? '⭐ ' : ''}${describir(p.c, p.lead, ahora)}`, p.c.derivadoQuiere ? `Quiere: ${p.c.derivadoQuiere}` : `Motivo: ${NOMBRE_MOTIVO[p.c.derivadoMotivo] || p.c.derivadoMotivo}`, p.c.derivadoParaVos ? `Vos: ${p.c.derivadoParaVos}` : (p.c.derivadoResumen ? String(p.c.derivadoResumen).slice(0, 160) : ''), `⏳ Espera hace ${hace(espera).replace(/^hace /, '')} · ${textoVentana(p.quedanH)}`].filter(Boolean).join('\n');
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
function paginaPendientes(store, owner, linkAtendido, ahora = Date.now(), linkBot = null, linkCharla = null) {
  const { esperando, seguimiento, dudas } = pendientes(store, owner, ahora);
  const fila = (p, conBoton) => `<li><div><b>${p.importante ? '⭐ ' : ''}${esc(describir(p.c, p.lead, ahora))}</b><br><small>${esc(NOMBRE_MOTIVO[p.c.derivadoMotivo] || '')}${p.c.derivadoMotivo ? ' · ' : ''}${esc(hace(ahora - p.desde))}</small>${p.c.derivadoQuiere ? `<p><b>Quiere:</b> ${esc(p.c.derivadoQuiere)}</p>${p.c.derivadoParaVos ? `<p><b>Vos:</b> ${esc(p.c.derivadoParaVos)}</p>` : ''}` : p.c.derivadoResumen ? `<p>${esc(String(p.c.derivadoResumen).slice(0, 300))}</p>` : ''}${linkCharla ? `<a class="wa" href="${esc(linkCharla(p.c.telefono))}">Ver la charla y contestarle →</a>` : ''}</div>${conBoton ? `<form method="post" action="${esc(linkAtendido(p.c.telefono))}"><button>Ya lo atendí</button></form>` : ''}${conBoton && linkBot && (p.c.pausadoHasta || 0) > ahora ? `<form method="post" action="${esc(linkBot(p.c.telefono))}"><button class="bot">Que lo siga el bot</button></form>` : ''}</li>`;
  const bloque = (titulo, lista, conBoton) => lista.length ? `<h2>${titulo} (${lista.length})</h2><ul>${lista.map((p) => fila(p, conBoton)).join('')}</ul>` : '';
  const cuerpo = bloque('Esperan tu respuesta', esperando, true) + bloque('Dudas para confirmar', dudas, true) + bloque('Presupuesto enviado, no volvieron a escribir', seguimiento, true);
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Pendientes PuertoBox</title>
<style>body{font-family:system-ui,sans-serif;margin:0;padding:16px;background:#f5f5f5;color:#111}h1{font-size:20px}h2{font-size:16px;margin-top:24px}ul{list-style:none;padding:0}li{background:#fff;border-radius:12px;padding:14px;margin-bottom:10px;display:flex;flex-direction:column;gap:10px}p{margin:6px 0 0;font-size:14px;color:#444}small{color:#666}button{width:100%;padding:12px;font-size:16px;border:0;border-radius:10px;background:#1a7f37;color:#fff}button.bot{background:#1a5fb4}.wa{display:inline-block;margin-top:8px;font-size:14px}</style></head>
<body><h1>Pendientes PuertoBox</h1>${cuerpo || '<p>No tenés clientes pendientes. Todo al día.</p>'}</body></html>`;
}

/** Texto legible de un mensaje guardado (string o bloques de la IA); deja afuera las herramientas internas. */
/** Archivos del cliente (15/11): la marca [archivo:/media/...] se muestra como foto o link para abrirlo. */
function conArchivos(html) {
  return html.replace(/\s?\[archivo:(\/media\/[0-9a-f]{32}\.([a-z0-9]{1,5}))\]/g, (_, ruta, ext) => /^(jpg|png|webp|gif)$/.test(ext)
    ? `<a href="${ruta}" target="_blank"><img src="${ruta}" alt="Imagen del cliente" style="display:block;max-width:100%;border-radius:10px;margin:6px 0"></a>`
    : /^(ogg|mp3|m4a|aac|amr)$/.test(ext)
      ? `<audio controls preload="none" src="${ruta}" style="display:block;width:100%;margin:6px 0"></audio><a href="${ruta}" target="_blank">🎧 Abrir el audio</a>`
      : /^(mp4|3gp)$/.test(ext)
        ? `<video controls preload="none" src="${ruta}" style="display:block;max-width:100%;border-radius:10px;margin:6px 0"></video>`
        : `<a href="${ruta}" target="_blank" style="display:block;margin:6px 0;font-weight:600">📎 Abrir el archivo (${ext.toUpperCase()})</a>`)
    .replace(/\[no se pudo bajar el archivo: pedíselo de nuevo\]/g, '<b style="color:#c8102e">⚠️ No se pudo bajar el archivo: pedíselo de nuevo.</b>');
}

/** Vista previa de la tarjeta: sin el código del archivo. "📷 Foto: …", "📎 Archivo: …", "🎧 Audio: …". */
function resumenVista(t) {
  let v = String(t);
  const icono = /^\[El cliente mandó una imagen/.test(v) ? '📷 Foto' : /^\[El cliente mandó (un archivo|un video)/.test(v) ? '📎 Archivo' : /^\[(Audio del cliente|El cliente mandó un audio)/.test(v) ? '🎧 Audio' : '';
  v = v.replace(/\s?\[archivo:[^\]]*\]/g, '').replace(/\s?\[no se pudo bajar el archivo[^\]]*\]/g, '');
  if (icono) v = icono + ': ' + v.replace(/^\[[^\]]*\]\s*/, '').trim();
  return v.length > 120 ? v.slice(0, 118) + '…' : v;
}

function textoMensaje(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.filter((b) => b && b.type === 'text').map((b) => b.text).join('\n');
}

/**
 * Página "Charlas": lo que hablaron los clientes con el bot en los últimos días (pedido del 14/11:
 * Gustavo no tiene la app de WhatsApp del 6773, que está conectado a la API). Sin sus propios números.
 */
function paginaCharlas(store, owner, ahora = Date.now(), dias = 3, linkResponder = null, abierto = null, aviso = '', linkPresu = null) {
  const desde = ahora - dias * 24 * 3600e3;
  const chats = (store.chats ? store.chats() : [])
    .filter((c) => !esGustavo(c.telefono, owner) && (c.ultimo || 0) >= desde && (c.mensajes || []).length)
    .sort((a, b) => (b.ultimo || 0) - (a.ultimo || 0));
  const ESTADO = { nuevo: 'Consultó', cotizado: 'Tiene presupuesto', derivado: 'Derivado a vos', listo_para_cerrar: 'Quiere pagar' };
  // Presupuesto formal en PDF (15/11): se arma solo con la última cotización; lo manda Gustavo con un botón.
  // Botón al cotizador del nomenclador con los datos del cliente ya cargados (15/11: chats sin cotización guardada o para retocarla).
  const presu = (c, l) => {
    if (!linkPresu || !l.cotizacion || !l.cotizacion.r) return '';
    const q = linkPresu(c.telefono);
    const p = l.presupuesto && store.presupuesto ? store.presupuesto(l.presupuesto) : null;
    const cli = (p && p.cliente) || {};
    const estado = p && p.enviado ? `Enviado ${hace(ahora - Date.parse(p.enviado))}.` : p ? `N° ${esc(p.nro)} listo para enviar.` : 'Se arma con la última cotización del bot.';
    // Posición: Gustavo la ve y la puede corregir; el marcador dice cuántas acertó el bot a la primera (15/11).
    const fija = l.posicion_fija || {};
    const m = store.meta ? require('./certeza').marcador(store) : null;
    const conf = fija.confirmada ? (fija.bot_propuso ? `Corregida por vos (el bot había puesto ${esc(fija.bot_propuso)})` : 'Confirmada por vos antes') : `Elegida por el bot, confianza ${esc(fija.confianza || '-')}`;
    const pos = `<label>Posición arancelaria <input name="pos" value="${esc(fija.posicion || '')}" placeholder="Ej.: 8507.60.00"></label>
<small>${fija.posicion ? `${conf}. ${esc(fija.nombre_tecnico || fija.descripcion_arancel || '')} · DIE ${esc(fija.die)}%.` : '⚠️ El bot no eligió posición: escribila.'} Si está mal, escribí la correcta: se recalcula el presupuesto y el bot la aprende para ese producto.</small>
${m && m.total ? `<small>✅ De los presupuestos que mandaste, en ${m.bien} de ${m.total} no tuviste que cambiar la posición.${m.listo ? ' Los últimos 20 salieron bien: ya se podrían mandar solos.' : ''}</small>` : ''}`;
    return `<form class="presu" method="post"><b>📄 Presupuesto formal (PDF)</b><small>${estado} Total a PuertoBox USD ${esc(l.cotizacion.r.total_puertobox_usd)}.</small>
${pos}
<input name="nombre" placeholder="Nombre y apellido" value="${esc(cli.nombre || l.nombre || '')}"><input name="doc" placeholder="CUIT / DNI (opcional)" value="${esc(cli.doc || '')}"><input name="dom" placeholder="Domicilio (opcional)" value="${esc(cli.dom || '')}">
<select name="iva">${['', 'Consumidor final', 'Monotributista', 'Responsable inscripto'].map((o) => `<option${(cli.iva || '') === o ? ' selected' : ''}>${o}</option>`).join('')}</select>
<div class="bt"><button formaction="/presupuesto-ver${q}" class="sec">Ver PDF</button><button formaction="/presupuesto-enviar${q}">Enviar presupuesto</button></div></form>`;
  };
  const tarjeta = (c) => {
    const l = (store.lead ? store.lead(c.telefono) : null) || {};
    const msgs = c.mensajes.map((m) => {
      const txt = textoMensaje(m.content).trim();
      if (m.role !== 'user' && txt.startsWith('[Gustavo] ')) return { quien: 'vos', txt: txt.slice(10), noEntregado: !!m.noEntregado };
      return { quien: m.role === 'user' ? 'cliente' : 'bot', txt, noEntregado: !!m.noEntregado };
    }).filter((m) => m.txt);
    // Responder desde el 6773 (15/11: Gustavo no tiene WhatsApp en ese número y el Inbox de YCloud no muestra los chats del bot).
    const quedanH = 24 - (ahora - (c.ultimoClienteEn || 0)) / 3600e3;
    const caja = !linkResponder ? '' : quedanH > 0
      ? `<form class="resp" method="post" action="${esc(linkResponder(c.telefono))}"><textarea name="texto" rows="4" required placeholder="Escribile al cliente…"></textarea><button>Enviar desde el 6773</button><small>Le llega desde el número del bot. El bot se calla en este chat. ${esc(textoVentana(quedanH).replace(/^./, (l) => l.toUpperCase()))}.</small></form>`
      : '<p class="vencida">Pasaron más de 24 h desde su último mensaje: WhatsApp no deja escribirle libre (solo con una plantilla paga).</p>';
    const ultimoCliente = [...msgs].reverse().find((m) => m.quien === 'cliente');
    const cabecera = [c.origen === 'anuncio' ? '📣 Del anuncio' : c.origen === '698' ? '📲 Del 698' : '', l.estado ? ESTADO[l.estado] || l.estado : 'Sin datos todavía', hace(ahora - c.ultimo)].filter(Boolean).join(' · ');
    return `<li id="c-${esc(c.telefono)}"><details${abierto === c.telefono ? ' open' : ''}><summary><b>+${esc(c.telefono)}${l.nombre ? ' · ' + esc(l.nombre) : ''}</b>${l.producto ? '<br>' + esc(l.producto) : ''}<br><small>${esc(cabecera)}</small>${ultimoCliente ? `<p>“${esc(resumenVista(ultimoCliente.txt))}”</p>` : ''}<span class="ver">Ver charla ▾</span></summary>
<div class="chat">${msgs.map((m) => `<div class="m ${m.quien}">${m.quien === 'vos' ? '<b>Vos:</b> ' : ''}${conArchivos(esc(m.txt)).replace(/\n/g, '<br>')}${m.noEntregado ? '<br><b style="color:#c8102e">⚠️ No se entregó: reenvialo.</b>' : ''}</div>`).join('')}</div>${caja}${presu(c, l)}</details></li>`;
  };
  const delAnuncio = chats.filter((c) => c.origen === 'anuncio').length;
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Charlas PuertoBox</title>
<style>body{font-family:system-ui,sans-serif;margin:0;padding:16px;background:#f5f5f5;color:#111}h1{font-size:20px;margin:0 0 4px}.sub{color:#555;font-size:14px;margin:0 0 16px}ul{list-style:none;padding:0;margin:0}li{background:#fff;border-radius:12px;padding:14px;margin-bottom:10px}summary{list-style:none;cursor:pointer}summary::-webkit-details-marker{display:none}p{margin:6px 0 0;font-size:14px;color:#444}small{color:#666}.ver{display:block;margin-top:8px;color:#1a5fb4;font-size:14px}.chat{margin-top:12px;display:flex;flex-direction:column;gap:6px}.m{max-width:85%;padding:8px 10px;border-radius:10px;font-size:14px;line-height:1.35}.cliente{background:#eee;align-self:flex-start}.bot{background:#dcf8c6;align-self:flex-end}.vos{background:#cfe3ff;align-self:flex-end}.resp{margin-top:12px;display:flex;flex-direction:column;gap:8px}.resp textarea{width:100%;box-sizing:border-box;font:16px system-ui,sans-serif;padding:10px;border:1px solid #ccc;border-radius:10px}.resp button{padding:12px;font-size:16px;border:0;border-radius:10px;background:#1a7f37;color:#fff}.vencida{color:#a40000}.aviso{background:#fff;border-left:4px solid #1a7f37;padding:10px;border-radius:8px;margin-bottom:12px}.presu{margin-top:14px;padding-top:12px;border-top:1px solid #ddd;display:flex;flex-direction:column;gap:8px}.presu label{display:flex;flex-direction:column;gap:4px;font-size:14px;color:#333}.presu input,.presu select{font:16px system-ui,sans-serif;padding:9px;border:1px solid #ccc;border-radius:10px}.presu .bt{display:flex;gap:8px}.presu button{flex:1;padding:12px;font-size:16px;border:0;border-radius:10px;background:#0b4f8a;color:#fff}.presu button.sec{background:#e8eef5;color:#0b4f8a}.acot{display:block;margin-top:12px;padding:12px;text-align:center;border-radius:10px;background:#e8eef5;color:#0b4f8a;font-size:16px;text-decoration:none;font-weight:600}</style></head>
<body><h1>Charlas con el bot</h1>${aviso ? `<p class="aviso">${esc(aviso)}</p>` : ''}<p class="sub">Últimos ${dias} días · ${chats.length} clientes${delAnuncio ? ` · ${delAnuncio} del anuncio` : ''}. Tus números no aparecen. Tocá un cliente para ver la charla.</p>
${chats.length ? `<ul>${chats.map(tarjeta).join('')}</ul>` : '<p>Ningún cliente le escribió al bot en estos días.</p>'}</body></html>`;
}

module.exports = { paraEmpujar, esGustavo, pendientes, textoPendientes, revisar, silencio, horaAR, paginaPendientes, paginaCharlas, embudo };
