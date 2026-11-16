'use strict';
/**
 * Imágenes y archivos que manda el cliente (15/11/2026, Gustavo: "tengo este problema cuando me manda imágenes o archivos").
 * Antes el bot decía "no se puede abrir el archivo". Ahora:
 *  1. Se baja el archivo de YCloud y se guarda (Gustavo lo ve en /charlas con un link).
 *  2. Si es imagen o PDF, la IA lo lee y saca lo que sirve para cotizar (producto, cantidades, precios, pesos, medidas).
 *  3. Eso le llega al bot como texto, y queda en la charla para el presupuestador y el control cruzado.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MODELO = process.env.MODELO_ADJUNTOS || process.env.CLASIFICADOR_MODEL || 'claude-sonnet-5-5';
const MAX_BYTES = 15 * 1024 * 1024;
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'application/pdf': 'pdf', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/aac': 'aac', 'audio/amr': 'amr', 'video/mp4': 'mp4', 'video/3gpp': '3gp' };
const LEGIBLE = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv', 'text/plain']);
const NOMBRE = { image: 'una imagen', document: 'un archivo', video: 'un video', sticker: 'un sticker' };

const INSTRUCCIONES = `Sos el asistente de PuertoBox (importación courier desde China a Argentina). Un cliente mandó esta imagen o documento por WhatsApp.
Escribí en castellano, en texto plano y en hasta 12 líneas, todo lo que sirva para cotizar la importación: qué producto es (modelo, materiales, si tiene batería o marca visible), cantidades, precio unitario y total (con moneda), peso por unidad y total, medidas del producto y de la caja de envío, cantidad de cajas, proveedor.
Si es una proforma, factura o captura de Alibaba/1688, pasá los ítems con cantidad y precio. Si es la sección "Empaque y entrega" / "Packaging & delivery" de Alibaba, copiá tal cual "Unidades de venta", "Tamaño del paquete" y "Peso bruto" y aclará que son por unidad de venta. Si es la parte del precio, copiá los escalones de precio y el pedido mínimo. Si es la foto de un producto, describilo para poder clasificarlo.
No inventes datos que no se vean. Si no se lee bien, decilo.`;

function tipoMime(media) {
  const m = String(media.mime_type || media.mimeType || '').split(';')[0].trim().toLowerCase();
  if (m && m !== 'application/octet-stream') return m; // 16/11: algunos celulares mandan el Excel como octet-stream: se mira el nombre
  const n = String(media.filename || '').toLowerCase();
  if (n.endsWith('.pdf')) return 'application/pdf';
  if (/\.(jpe?g)$/.test(n)) return 'image/jpeg';
  if (n.endsWith('.png')) return 'image/png';
  if (n.endsWith('.xlsx')) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (n.endsWith('.csv')) return 'text/csv';
  return '';
}

async function descargar(media, fetchImpl, apiKey) {
  if (!media || !media.link) throw new Error('sin link');
  const headers = /ycloud\.com/.test(media.link) ? { 'X-API-Key': apiKey } : {};
  const r = await fetchImpl(media.link, { headers });
  if (!r.ok) throw new Error(`descarga ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length > MAX_BYTES) throw new Error('archivo muy grande');
  return buf;
}

// ---------- Excel (16/11: las proformas y packing lists en .xlsx de los clientes no se leían y Gustavo tenía que entrar) ----------
const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const desXml = (t) => String(t).replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
/** Pasa un .xlsx a texto plano: una línea por fila, celdas separadas por " | ". Sin dependencias (usa el lector de zip del arancel). */
function xlsxATexto(buf, maxCaracteres = 12000) {
  const arch = require('../src/arancel').leerZip(buf);
  const comp = (n) => (arch[n] ? arch[n].toString('utf8') : '');
  const compartidas = [...comp('sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => desXml([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join('')));
  const hojas = Object.keys(arch).filter((n) => /^sheet\d+\.xml$/.test(n)).sort((a, b) => parseInt(a.slice(5), 10) - parseInt(b.slice(5), 10));
  const lineas = [];
  for (const h of hojas) {
    if (hojas.length > 1) lineas.push(`# Hoja ${h.replace(/\D/g, '')}`);
    for (const fila of comp(h).matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      const celdas = [...fila[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)].map((c) => {
        const attrs = c[1] || ''; const cuerpo = c[2] || '';
        const v = (cuerpo.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
        if (/t="s"/.test(attrs)) return compartidas[Number(v)] ?? '';
        if (/t="inlineStr"/.test(attrs)) return desXml((cuerpo.match(/<t[^>]*>([\s\S]*?)<\/t>/) || [])[1] || '');
        return v !== undefined ? desXml(v) : '';
      }).map((x) => String(x).trim());
      if (celdas.some(Boolean)) lineas.push(celdas.join(' | ').replace(/(\s\|\s)+$/, ''));
    }
  }
  return lineas.join('\n').slice(0, maxCaracteres);
}

/** Llamada a la IA para leer archivos. 16/11: si se gasta el lugar "pensando" (max_tokens sin texto), se reintenta con más lugar y sin pensar. */
async function pedirIA(content, fetchImpl) {
  const intentos = [{ max_tokens: 2000 }, { max_tokens: 6000, thinking: { type: 'disabled' } }, { max_tokens: 6000 }];
  let ultimo = '';
  for (const extra of intentos) {
    const r = await fetchImpl('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODELO, ...extra, system: INSTRUCCIONES, messages: [{ role: 'user', content }] }),
    });
    if (!r.ok) { ultimo = `IA ${r.status}`; if (r.status === 400 && extra.thinking) continue; throw new Error(ultimo); }
    const j = await r.json();
    const texto = (j.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
    if (texto) return texto;
    ultimo = `sin texto (stop_reason=${j.stop_reason || '?'})`;
  }
  throw new Error(ultimo);
}

async function leerConIA(buf, mime, fetchImpl) {
  if (mime === MIME_XLSX) {
    const tabla = xlsxATexto(buf);
    if (!tabla) throw new Error('Excel vacío');
    return pedirIA([{ type: 'text', text: `Planilla de Excel que mandó el cliente (una fila por línea, celdas separadas por |):\n${tabla}\n\nLeé esta planilla del cliente.` }], fetchImpl);
  }
  if (/^text\/(csv|plain)$/.test(mime)) {
    return pedirIA([{ type: 'text', text: `Archivo de texto que mandó el cliente:\n${buf.toString('utf8').slice(0, 12000)}\n\nLeé este archivo del cliente.` }], fetchImpl);
  }
  const fuente = { type: 'base64', media_type: mime, data: buf.toString('base64') };
  const bloque = mime === 'application/pdf' ? { type: 'document', source: fuente } : { type: 'image', source: fuente };
  return pedirIA([bloque, { type: 'text', text: 'Leé este archivo del cliente.' }], fetchImpl);
}

/** Guarda el archivo con un nombre largo al azar (se sirve en /media/<nombre>) y devuelve la ruta pública. */
function guardar(buf, mime, dir, filename) {
  fs.mkdirSync(dir, { recursive: true });
  const ext = EXT[mime] || (path.extname(String(filename || '')).slice(1).replace(/[^a-z0-9]/gi, '').slice(0, 5).toLowerCase()) || 'bin';
  const nombre = `${crypto.randomBytes(16).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(dir, nombre), buf);
  return `/media/${nombre}`;
}

/**
 * Convierte el adjunto en el texto que se guarda en la charla.
 * Lleva la marca [archivo:/media/...] para que /charlas muestre el link, y el contenido leído para el bot.
 */
async function procesar(e, { fetchImpl = fetch, dir, apiKey, puedeLeer = true } = {}) {
  const media = e.image || e.document || e.video || e.sticker || null;
  const que = NOMBRE[e.type] || 'un archivo';
  const caption = media && media.caption ? ` Escribió: "${media.caption}".` : '';
  if (!media) return `[El cliente mandó ${que}.${caption} Pedile los datos por texto sin decir que no se abre.]`;
  const mime = tipoMime(media);
  let ruta = '';
  let buf = null;
  try { buf = await descargar(media, fetchImpl, apiKey); ruta = guardar(buf, mime, dir, media.filename); } catch (err) { console.error('Adjunto: no se pudo bajar', err.message); }
  const marca = ruta ? ` [archivo:${ruta}]` : ' [no se pudo bajar el archivo: pedíselo de nuevo]';
  const nombreArch = media.filename ? ` (${media.filename})` : '';
  if (buf && LEGIBLE.has(mime) && puedeLeer) {
    try {
      const leido = await leerConIA(buf, mime, fetchImpl);
      if (leido) return `[El cliente mandó ${que}${nombreArch}, leído automáticamente.${caption}${marca}]\n${leido}`;
    } catch (err) { console.error('Adjunto: no se pudo leer', err.message); }
  }
  return `[El cliente mandó ${que}${nombreArch} que no se pudo leer automáticamente.${caption}${marca} Nuestro despachante lo puede ver. Pedile por texto los datos que falten (precio al proveedor, peso, medidas) sin decir que no se abre.]`;
}

/** Guarda el audio original para que Gustavo lo pueda escuchar (el bot usa la transcripción). Devuelve la marca o ''. */
async function guardarAudio(audio, { fetchImpl = fetch, dir, apiKey } = {}) {
  try { const buf = await descargar(audio, fetchImpl, apiKey); return ` [archivo:${guardar(buf, tipoMime(audio) || 'audio/ogg', dir)}]`; } catch (e) { console.error('Audio: no se pudo guardar', e.message); return ''; }
}

module.exports = { xlsxATexto, guardarAudio, procesar, tipoMime, leerConIA, descargar, guardar, INSTRUCCIONES };
