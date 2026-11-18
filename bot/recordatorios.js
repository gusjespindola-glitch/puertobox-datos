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
const MOTIVOS_GUSTAVO = ['listo_para_cerrar', 'pide_humano', 'mayorista', 'reclamo', 'caso_dificil'];
const NOMBRE_MOTIVO = { listo_para_cerrar: 'quiere avanzar/pagar', pide_humano: 'pidió hablar con vos', mayorista: 'pedido grande/mayorista', reclamo: 'reclamo', duda: 'duda para confirmar', caso_dificil: 'caso difícil para vos' };

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
/**
 * Charla archivada por Gustavo (17/11: "una opción para poner que ya desistió o que no le voy a dar seguimiento").
 * Deja de estar archivada sola si el cliente vuelve a escribir después de archivarla.
 */
const MOTIVOS_ARCHIVO = { desistio: 'Desistió', no_interesa: 'No me interesa seguirlo', no_sirve: 'No es cliente / no sirve' };
function archivada(c) {
  if (!c || !c.archivadoEn) return false;
  return !(c.mensajes || []).some((m) => m.role === 'user' && (m.en || 0) > c.archivadoEn);
}

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
    if (!c.telefono || esGustavo(c.telefono, owner) || archivada(c)) continue;
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
    // 15/11 21:44 (Gustavo: "no puedo sacar ese mensaje de Nusse"): "Ya lo atendí" no lo sacaba de esta lista. Ahora sí:
    // si Gustavo lo marcó después del último mensaje del cliente, no aparece (vuelve si el cliente escribe de nuevo).
    if (lead?.estado === 'cotizado' && ultimoCliente && respondio < ultimoCliente && ahora - ultimoCliente > 24 * H && ahora - ultimoCliente < 7 * 24 * H) {
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
    if (!c.telefono || String(c.telefono).startsWith('ig:') || esGustavo(c.telefono, owner) || archivada(c)) continue;
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
<style>body{font-family:system-ui,sans-serif;margin:0;padding:16px;background:#f5f5f5;color:#111}h1{font-size:20px}h2{font-size:16px;margin-top:24px}ul{list-style:none;padding:0}li{background:#fff;border-radius:12px;padding:14px;margin-bottom:10px;display:flex;flex-direction:column;gap:10px}p{margin:6px 0 0;font-size:14px;color:#444}small{color:#666}button{width:100%;padding:12px;font-size:16px;border:0;border-radius:10px;background:#1a7f37;color:#fff}button.bot{background:#1a5fb4}.wa{display:inline-block;margin-top:8px;font-size:14px}button.cotizar{background:#1f4e79;color:#fff;font-weight:700}.marcada{background:#eef5ff;border-left:4px solid #1f4e79;padding:8px 10px;border-radius:8px;margin:8px 0;font-weight:600}</style></head>
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

/**
 * Lo que mandó el cliente, como lo ve Gustavo en /charlas (15/11 21:33, Gustavo: "si manda el archivo, dejá el archivo,
 * no escribas arriba"): solo el archivo (foto, PDF, audio) con su nombre y lo que escribió el cliente.
 * La lectura de la IA y las instrucciones para el bot quedan guardadas para el bot, pero no se muestran.
 */
function vistaCliente(t) {
  const v = String(t || '');
  if (!/^\[El cliente mandó /.test(v)) return v;
  const archivo = (v.match(/\[archivo:\/media\/[0-9a-f]{32}\.[a-z0-9]{1,5}\]/) || [])[0] || '';
  const noBajado = /\[no se pudo bajar el archivo[^\]]*\]/.test(v);
  const que = (v.match(/^\[El cliente mandó (una imagen|un archivo|un video|un audio|un sticker)/) || [])[1] || '';
  const nombre = (v.match(/^\[El cliente mandó [a-z ]+? \(([^)]+)\)/) || [])[1] || '';
  const escribio = (v.match(/Escribió: "([^"]*)"/) || [])[1] || '';
  const icono = que === 'una imagen' ? '📷' : que === 'un audio' ? '🎧' : que === 'un video' ? '🎬' : '📎';
  const titulo = `${icono} ${nombre || (que ? que.replace(/^un[a]? /, '').replace(/^./, (l) => l.toUpperCase()) : 'Archivo')}`;
  return [titulo, archivo, noBajado ? '[no se pudo bajar el archivo: pedíselo de nuevo]' : '', escribio && escribio !== nombre ? escribio : ''].filter(Boolean).join('\n');
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
function paginaCharlas(store, owner, ahora = Date.now(), dias = 3, linkResponder = null, abierto = null, aviso = '', linkPresu = null, linkCorregir = null, linkVisto = null, linkMarcarPresu = null, linkSeguirBot = null, linkArchivar = null, linkMarcarCotizar = null) {
  const desde = ahora - dias * 24 * 3600e3;
  // Mensajes nuevos (15/11 21:40, Gustavo: "no me doy cuenta cuando mandan un mensaje nuevo, lo tengo que estar buscando"):
  // lo que escribió el cliente después de la última vez que Gustavo abrió esa charla va en rojo y arriba de todo.
  let base = store.meta ? store.meta('vistoBase') : 0;
  if (store.meta && !base) { base = ahora; store.meta('vistoBase', ahora); }
  const vistoDe = (c) => Math.max(c.vistoEn || 0, base || 0);
  const nuevosDe = (c) => (c.mensajes || []).filter((m) => m.role === 'user' && (m.en || 0) > vistoDe(c)).length;
  const chats = (store.chats ? store.chats() : [])
    .filter((c) => !esGustavo(c.telefono, owner) && (c.ultimo || 0) >= desde && (c.mensajes || []).length)
    .map((c) => ({ ...c, nuevos: nuevosDe(c) }))
    .sort((a, b) => (b.nuevos ? 1 : 0) - (a.nuevos ? 1 : 0) || (b.ultimo || 0) - (a.ultimo || 0));
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
    const visto = vistoDe(c);
    const msgs = c.mensajes.map((m) => {
      const txt = textoMensaje(m.content).trim();
      if (m.role !== 'user' && txt.startsWith('[Gustavo] ')) return { quien: 'vos', txt: txt.slice(10), noEntregado: !!m.noEntregado };
      return { quien: m.role === 'user' ? 'cliente' : 'bot', txt: m.role === 'user' ? vistaCliente(txt) : txt, noEntregado: !!m.noEntregado, nuevo: m.role === 'user' && (m.en || 0) > visto };
    }).filter((m) => m.txt);
    // Responder desde el 6773 (15/11: Gustavo no tiene WhatsApp en ese número y el Inbox de YCloud no muestra los chats del bot).
    const quedanH = 24 - (ahora - (c.ultimoClienteEn || 0)) / 3600e3;
    const caja = !linkResponder ? '' : quedanH > 0
      ? `<form class="resp" method="post" enctype="multipart/form-data" action="${esc(linkResponder(c.telefono))}"><textarea name="texto" rows="4" placeholder="Escribile al cliente… (si adjuntás un archivo, este texto va con el archivo)"></textarea><label class="adj">📎 Adjuntar archivo (PDF, foto, Excel, audio…) <input type="file" name="archivo" accept=".pdf,.jpg,.jpeg,.png,.webp,.xlsx,.xls,.docx,.doc,.csv,.txt,.zip,.mp3,.m4a,.aac,.ogg,.opus,.amr,audio/*"></label><div class="mic"><button type="button" class="grabar">🎤 Grabar audio</button><span class="crono"></span><audio class="prev" controls hidden></audio><button type="button" class="mandar" hidden>Enviar audio</button><button type="button" class="borrar" hidden>Descartar</button></div><button>Enviar desde el 6773</button><small>Le llega desde el número del bot. El bot se calla en este chat. ${esc(textoVentana(quedanH).replace(/^./, (l) => l.toUpperCase()))}.</small></form>`
      : '<p class="vencida">Pasaron más de 24 h desde su último mensaje: WhatsApp no deja escribirle libre (solo con una plantilla paga).</p>';
    // Circuito de aprendizaje (15/11): Gustavo escribe cómo tenía que contestar el bot y queda aprendido.
    const corregir = linkCorregir && msgs.some((m) => m.quien === 'bot') ? `<details class="corr"><summary>✏️ Corregir al bot</summary><form class="resp" method="post" action="${esc(linkCorregir(c.telefono))}"><textarea name="texto" rows="4" required placeholder="¿Qué contestó mal y cómo tenía que ser? Escribilo como se lo dirías a un empleado."></textarea><button>Guardar corrección</button><small>No le llega al cliente. El bot lo aplica desde su próximo mensaje con todos los clientes.</small></form></details>` : '';
    const ultimoCliente = [...msgs].reverse().find((m) => m.quien === 'cliente');
    const cabecera = [c.origen === 'anuncio' ? '📣 Del anuncio' : c.origen === '698' ? '📲 Del 698' : '', l.estado ? ESTADO[l.estado] || l.estado : 'Sin datos todavía', hace(ahora - c.ultimo)].filter(Boolean).join(' · ');
    // Presupuesto pasado (16/11, Gustavo: "quiero poder marcar cuando ya pasé presupuesto, que aparezca con otro color").
    // Lo marca él con un botón; también cuenta si mandó el PDF formal. Si lo cotizó el bot, se ve aparte.
    const pasoPresu = c.presupuestoPasadoEn || c.presupuestoEnviadoEn || null;
    const botCotizo = !pasoPresu && l.estado === 'cotizado';
    const marcaPresu = pasoPresu ? `<span class="badge pasado">✅ Le pasaste presupuesto · ${esc(hace(ahora - pasoPresu))}</span><br>` : botCotizo ? '<span class="badge bot">📄 El bot le pasó presupuesto</span><br>' : '';
    // 17/11 21:32 (Gustavo): marca la charla que quiere presupuestar; en el cotizador (otra pestaña) "Mandar" va a esa.
    const marcadaCot = !!(store.meta && (store.meta('aPresupuestar') || {}).tel === c.telefono);
    const botonCotizar = !linkMarcarCotizar ? '' : marcadaCot
      ? `<form class="marcar" method="post" action="${esc(linkMarcarCotizar(c.telefono, '0'))}"><div class="marcada">🎯 Marcada para presupuestar: en el cotizador, "Mandar" va a este chat.</div><button class="no">Sacar la marca</button></form>`
      : `<form class="marcar" method="post" action="${esc(linkMarcarCotizar(c.telefono, '1'))}"><button class="cotizar">🎯 Marcar para presupuestar</button></form>`;
    const botonPresu = linkMarcarPresu ? `<form class="marcar" method="post" action="${esc(linkMarcarPresu(c.telefono, pasoPresu ? 0 : 1))}"><button class="${pasoPresu ? 'no' : 'si'}">${pasoPresu ? 'Sacar la marca de presupuesto' : '✅ Ya le pasé presupuesto'}</button></form>` : '';
    // 16/11 (Gustavo: "si intervengo, quiero poner una opción para que la sigas vos"): con el bot callado en el chat
    // (porque contestó Gustavo o porque el bot se lo pasó), un botón lo devuelve al bot.
    const pausado = (c.pausadoHasta || 0) > ahora;
    const botonBot = linkSeguirBot && pausado ? `<form class="marcar" method="post" action="${esc(linkSeguirBot(c.telefono))}"><button class="bot">🤖 Que lo siga el bot</button><small>El bot retoma la charla desde acá${c.ultimoClienteEn && (c.mensajes || []).slice(-1)[0]?.role === 'user' ? ' y le contesta ya su último mensaje' : ''}.</small></form>` : '';
    const estadoBot = pausado ? `<span class="badge vos">🙋 Lo atendés vos · el bot está callado</span><br>` : '';
    // Archivar (17/11, Gustavo): desistió / no le interesa / no sirve → baja a "Archivadas", gris, sin empujón ni recordatorios.
    const arch = archivada(c);
    const volvio = !arch && c.archivadoEn ? `<span class="badge vos">↩️ Lo habías archivado (${esc(MOTIVOS_ARCHIVO[c.archivoMotivo] || 'archivada')}) y volvió a escribir</span><br>` : '';
    const botonArchivar = !linkArchivar ? '' : arch
      ? `<form class="marcar" method="post" action="${esc(linkArchivar(c.telefono, '0'))}"><button class="no">↩️ Sacar de archivadas</button></form>`
      : `<details class="arch"><summary>🗄️ Archivar (desistió, no me interesa…)</summary><div class="archbt">${Object.entries(MOTIVOS_ARCHIVO).map(([k, t]) => `<form method="post" action="${esc(linkArchivar(c.telefono, k))}"><button>${esc(t)}</button></form>`).join('')}</div><small>Baja a "Archivadas", el bot no le manda empujón y no te aparece en los recordatorios. Si vuelve a escribir, sube solo.</small></details>`;
    const etiquetaArch = arch ? `<span class="badge arch">🗄️ ${esc(MOTIVOS_ARCHIVO[c.archivoMotivo] || 'Archivada')} · ${esc(hace(ahora - c.archivadoEn))}</span><br>` : '';
    const marca = etiquetaArch + volvio + (c.nuevos ? `<span class="badge">🔴 ${c.nuevos === 1 ? '1 mensaje nuevo' : `${c.nuevos} mensajes nuevos`}</span><br>` : '') + marcaPresu + estadoBot;
    return `<li id="c-${esc(c.telefono)}"${c.nuevos ? ' class="nuevo"' : arch ? ' class="archivada"' : pasoPresu ? ' class="pasado"' : ''}${linkVisto ? ` data-visto="${esc(linkVisto(c.telefono))}"` : ''}><details${abierto === c.telefono ? ' open' : ''}><summary>${marca}<b>+${esc(c.telefono)}${l.nombre ? ' · ' + esc(l.nombre) : ''}</b>${l.producto ? '<br>' + esc(l.producto) : ''}<br><small>${esc(cabecera)}</small>${ultimoCliente ? `<p>“${esc(resumenVista(ultimoCliente.txt))}”</p>` : ''}<span class="ver">Ver charla ▾</span></summary>
<div class="chat">${msgs.map((m) => `<div class="m ${m.quien}${m.nuevo ? ' nuevo' : ''}">${m.quien === 'vos' ? '<b>Vos:</b> ' : ''}${conArchivos(esc(m.txt)).replace(/\n/g, '<br>')}${m.noEntregado ? '<br><b style="color:#c8102e">⚠️ No se entregó: reenvialo.</b>' : ''}</div>`).join('')}</div>${caja}${botonCotizar}${botonBot}${botonPresu}${corregir}${presu(c, l)}${botonArchivar}</details></li>`;
  };
  const delAnuncio = chats.filter((c) => c.origen === 'anuncio').length;
  const activas = chats.filter((c) => !archivada(c)); const archivadas = chats.filter((c) => archivada(c));
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${chats.some((c) => c.nuevos) ? `(${chats.filter((c) => c.nuevos).length}) ` : ''}Charlas PuertoBox</title><link rel="manifest" href="/app/manifest.json"><link rel="apple-touch-icon" href="/app/icono-180.png"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="PuertoBox"><meta name="theme-color" content="#1a7f37">
<style>.mic{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.mic button{padding:12px 14px;border-radius:10px;border:0;font-size:16px;font-weight:600}.mic .grabar{background:#0b4f8a;color:#fff}.mic .grabar.on{background:#c8102e}.mic .mandar{background:#1a7f37;color:#fff}.mic .borrar{background:#eee;color:#333}.mic audio{width:100%}.mic .crono{font-weight:700;color:#c8102e}li.archivada{background:#f0f0f0;opacity:.85}.badge.arch{background:#777!important;color:#fff}details.arch{margin-top:12px}details.arch summary{color:#555;font-size:15px;padding:8px 0}.archbt{display:flex;flex-direction:column;gap:6px;margin:6px 0}.archbt button{width:100%;padding:12px;border-radius:10px;border:1px solid #bbb;background:#fafafa;font-size:16px;color:#333}details.archivadas{margin-top:16px}details.archivadas>summary{background:#e6e6e6;padding:12px;border-radius:10px;font-weight:600;color:#444}details.archivadas ul{margin-top:10px}form.marcar button.bot{background:#6f42c1;color:#fff}form.marcar small{display:block;color:#555;margin-bottom:6px}.badge.vos{background:#f1eafc!important;color:#4b2a86}li.pasado{border:3px solid #1a7f37;background:#f2fbf4}.badge.pasado{background:#1a7f37!important;color:#fff}.badge.bot{background:#e8eef6!important;color:#1f4e79}form.marcar button{width:100%;padding:12px;border-radius:10px;border:0;font-size:16px;font-weight:600;margin:6px 0}form.marcar button.si{background:#1a7f37;color:#fff}form.marcar button.no{background:#eee;color:#333}label.adj{display:block;margin:8px 0;padding:10px;border:1.5px dashed #0b4f8a;border-radius:10px;color:#0b4f8a;font-weight:600;font-size:15px;cursor:pointer}label.adj input{display:block;margin-top:6px;font-weight:400;max-width:100%}body{font-family:system-ui,sans-serif;margin:0;padding:16px;background:#f5f5f5;color:#111}h1{font-size:20px;margin:0 0 4px}.sub{color:#555;font-size:14px;margin:0 0 16px}ul{list-style:none;padding:0;margin:0}li{background:#fff;border-radius:12px;padding:14px;margin-bottom:10px}summary{list-style:none;cursor:pointer}summary::-webkit-details-marker{display:none}p{margin:6px 0 0;font-size:14px;color:#444}small{color:#666}.ver{display:block;margin-top:8px;color:#1a5fb4;font-size:14px}.chat{margin-top:12px;display:flex;flex-direction:column;gap:6px}.m{max-width:85%;padding:8px 10px;border-radius:10px;font-size:14px;line-height:1.35}.cliente{background:#eee;align-self:flex-start}.bot{background:#dcf8c6;align-self:flex-end}.vos{background:#cfe3ff;align-self:flex-end}.resp{margin-top:12px;display:flex;flex-direction:column;gap:8px}.resp textarea{width:100%;box-sizing:border-box;font:16px system-ui,sans-serif;padding:10px;border:1px solid #ccc;border-radius:10px}.resp button{padding:12px;font-size:16px;border:0;border-radius:10px;background:#1a7f37;color:#fff}.vencida{color:#a40000}.aviso{background:#fff;border-left:4px solid #1a7f37;padding:10px;border-radius:8px;margin-bottom:12px}.presu{margin-top:14px;padding-top:12px;border-top:1px solid #ddd;display:flex;flex-direction:column;gap:8px}.presu label{display:flex;flex-direction:column;gap:4px;font-size:14px;color:#333}.presu input,.presu select{font:16px system-ui,sans-serif;padding:9px;border:1px solid #ccc;border-radius:10px}.presu .bt{display:flex;gap:8px}.presu button{flex:1;padding:12px;font-size:16px;border:0;border-radius:10px;background:#0b4f8a;color:#fff}.presu button.sec{background:#e8eef5;color:#0b4f8a}.nuevo{border:2px solid #c8102e}li.nuevo{border-left:6px solid #c8102e}.m.nuevo{border:2px solid #c8102e;background:#fff0f0}.badge{display:inline-block;background:#c8102e;color:#fff;font-weight:700;font-size:14px;padding:3px 8px;border-radius:8px;margin-bottom:6px}.corr{margin-top:12px}.corr summary{color:#1a5fb4;font-size:15px}.acot{display:block;margin-top:12px;padding:12px;text-align:center;border-radius:10px;background:#e8eef5;color:#0b4f8a;font-size:16px;text-decoration:none;font-weight:600}</style></head>
<body><h1>Charlas con el bot</h1><p><a href="/nomenclador/" target="_blank" style="display:inline-block;padding:10px 14px;background:#1f4e79;color:#fff;border-radius:10px;text-decoration:none;font-weight:600">🧮 Abrir cotizador (otra pestaña)</a></p>${(() => { const m = store.meta && store.meta('aPresupuestar'); if (!m || !m.tel) return ''; const l = (store.lead ? store.lead(m.tel) : null) || {}; return `<p class="aviso" style="border-left-color:#1f4e79">🎯 Marcada para presupuestar: <a href="#c-${esc(m.tel)}"><b>${esc(l.nombre || '+' + m.tel)}</b></a>. En el cotizador, "Mandar" le manda el PDF a esa charla.</p>`; })()}${aviso ? `<p class="aviso">${esc(aviso)}</p>` : ''}${chats.some((c) => c.nuevos) ? `<p class="aviso" style="border-left-color:#c8102e"><b>🔴 ${chats.filter((c) => c.nuevos).length === 1 ? '1 cliente te escribió' : `${chats.filter((c) => c.nuevos).length} clientes te escribieron`} y no lo viste.</b> Están arriba de todo.</p>` : ''}<p class="sub">Últimos ${dias} días · ${activas.length} clientes${archivadas.length ? ` (+${archivadas.length} archivadas abajo)` : ''}${delAnuncio ? ` · ${delAnuncio} del anuncio` : ''}. Tus números no aparecen. Tocá un cliente para ver la charla.</p>
${activas.length ? `<ul>${activas.map(tarjeta).join('')}</ul>` : '<p>Ningún cliente para atender en estos días.</p>'}${archivadas.length ? `<details class="archivadas"${archivadas.some((c) => c.telefono === abierto) ? ' open' : ''}><summary>🗄️ Archivadas (${archivadas.length}) · tocá para verlas</summary><ul>${archivadas.map(tarjeta).join('')}</ul></details>` : ''}
<script>
// 16/11 (Gustavo: "cómo sé cuál es nueva sin atender, que se note tipo WhatsApp"): la lista se actualiza sola cada 20 s
// mientras no haya una charla abierta ni algo escrito; las charlas sin leer quedan en el título y en el ícono de la app.
setInterval(function(){if(document.hidden||document.querySelector('details[open]'))return;var t=[].some.call(document.querySelectorAll('textarea'),function(i){return i.value;});if(!t)location.reload();},20000);
try{var n=document.querySelectorAll('li.nuevo').length;if(navigator.setAppBadge){n?navigator.setAppBadge(n):navigator.clearAppBadge();}}catch(e){}
</script><script>document.querySelectorAll('li[data-visto] details').forEach(function(d){d.addEventListener('toggle',function(){if(!d.open)return;var li=d.parentNode;if(!li.classList.contains('nuevo'))return;try{fetch(li.getAttribute('data-visto'),{method:'POST'});}catch(e){}li.classList.remove('nuevo');var b=li.querySelector('.badge');if(b)b.remove();});});</script><script>
// 17/11 (Gustavo: "muchas veces me mandan audios"): grabar y mandar un audio desde la charla. En iPhone sale en M4A, que WhatsApp acepta.
document.querySelectorAll('form.resp .mic').forEach(function(box){
  var form=box.closest('form'),bG=box.querySelector('.grabar'),bM=box.querySelector('.mandar'),bB=box.querySelector('.borrar'),prev=box.querySelector('.prev'),crono=box.querySelector('.crono');
  var rec=null,partes=[],blob=null,t0=0,timer=null,tipo='';
  function elegir(){var o=['audio/mp4','audio/aac','audio/ogg;codecs=opus','audio/ogg'];if(!window.MediaRecorder)return null;for(var i=0;i<o.length;i++){if(MediaRecorder.isTypeSupported&&MediaRecorder.isTypeSupported(o[i]))return o[i];}return null;}
  function limpiar(){blob=null;prev.hidden=true;prev.removeAttribute('src');bM.hidden=true;bB.hidden=true;crono.textContent='';bG.textContent='🎤 Grabar audio';}
  bG.addEventListener('click',function(){
    if(rec&&rec.state==='recording'){rec.stop();return;}
    tipo=elegir();
    if(!tipo){alert('Este navegador no graba en un formato que acepte WhatsApp. Grabalo desde el iPhone o adjuntá un audio MP3/M4A.');return;}
    navigator.mediaDevices.getUserMedia({audio:true}).then(function(st){
      limpiar();partes=[];rec=new MediaRecorder(st,{mimeType:tipo});
      rec.ondataavailable=function(e){if(e.data&&e.data.size)partes.push(e.data);};
      rec.onstop=function(){st.getTracks().forEach(function(x){x.stop();});clearInterval(timer);bG.classList.remove('on');bG.textContent='🎤 Grabar de nuevo';
        blob=new Blob(partes,{type:tipo.split(';')[0]});prev.src=URL.createObjectURL(blob);prev.hidden=false;bM.hidden=false;bB.hidden=false;};
      rec.start();t0=Date.now();bG.classList.add('on');bG.textContent='⏹️ Terminar';
      timer=setInterval(function(){var s=Math.round((Date.now()-t0)/1000);crono.textContent='● '+Math.floor(s/60)+':'+String(s%60).padStart(2,'0');if(s>=300)rec.stop();},500);
    }).catch(function(){alert('Necesito permiso para usar el micrófono.');});
  });
  bB.addEventListener('click',limpiar);
  bM.addEventListener('click',function(){
    if(!blob)return;bM.disabled=true;bM.textContent='Enviando…';
    var fd=new FormData();var tx=form.querySelector('textarea');fd.append('texto',tx?tx.value:'');
    var ext=/mp4|aac/.test(blob.type)?'m4a':'ogg';fd.append('archivo',blob,'audio.'+ext);
    fetch(form.action,{method:'POST',body:fd}).then(function(r){location.href=r.url;}).catch(function(){bM.disabled=false;bM.textContent='Enviar audio';alert('No se pudo enviar. Probá de nuevo.');});
  });
});
</script></body></html>`;
}

module.exports = { archivada, MOTIVOS_ARCHIVO, paraEmpujar, esGustavo, pendientes, textoPendientes, revisar, silencio, horaAR, paginaPendientes, paginaCharlas, embudo, vistaCliente, resumenVista };
