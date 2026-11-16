'use strict';
/**
 * Arancel ARCA que se actualiza solo (16/11, Gustavo: "quiero tener mi Tarifar o PCRAM... y que se mantenga actualizada").
 *
 * Fuente oficial: ARCA, "Archivos del Arancel Integrado, Código AFIP y Sufijos de Valor":
 *   https://serviciosweb.afip.gob.ar/aduana/arancelintegrado/archivos/arancel.zip
 * Trae capitulo_DDMMAAAA.txt, nomenclador_DDMMAAAA.txt y sufijos_DDMMAAAA.txt (diseño de registro con arrobas).
 *
 * El servidor lo baja una vez por día. Si la fecha del nomenclador es más nueva que la que está en uso:
 *  - rearma sim.json, notas.json y sufijos.json igual que ncm/build_sim.py + ncm/build_nomenclador.py (hay test que lo compara),
 *  - los guarda en el volumen (/data/arancel/), que pasa a mandar sobre los del repo (nomenclador, bot y web),
 *  - compara con la versión anterior (derechos, descripciones, posiciones nuevas o dadas de baja) y devuelve el resumen para avisarle a Gustavo.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const URL_ARANCEL = 'https://serviciosweb.afip.gob.ar/aduana/arancelintegrado/archivos/arancel.zip';
const RAIZ = path.join(__dirname, '..');
const REPO_DATA = path.join(RAIZ, 'web', 'nomenclador', 'data');
const ACTUALIZABLES = ['sim.json', 'notas.json', 'sufijos.json'];

const dir = () => process.env.ARANCEL_DIR || path.join(path.dirname(process.env.DATA_FILE || '/data/data.json'), 'arancel');

/** Archivo de datos del nomenclador: el bajado de ARCA si existe, si no el del repo. */
function ruta(nombre) {
  if (ACTUALIZABLES.includes(nombre)) {
    const p = path.join(dir(), nombre);
    try { if (fs.statSync(p).size > 0) return p; } catch (_) { /* no hay versión bajada */ }
  }
  return path.join(REPO_DATA, nombre);
}
/** Cambia cada vez que se instala un arancel nuevo: los motores en memoria se rearman. */
function version() {
  try { return fs.statSync(path.join(dir(), 'sim.json')).mtimeMs; } catch (_) { return 0; }
}
const leer = (nombre) => JSON.parse(fs.readFileSync(ruta(nombre), 'utf8'));

// ---------- ZIP (sin dependencias) ----------
function leerZip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('El archivo de ARCA no es un zip válido');
  const n = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = {};
  for (let k = 0; k < n; k++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('Zip de ARCA dañado');
    const metodo = buf.readUInt16LE(p + 10);
    const comp = buf.readUInt32LE(p + 20);
    const lNombre = buf.readUInt16LE(p + 28), lExtra = buf.readUInt16LE(p + 30), lCom = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const nombre = buf.slice(p + 46, p + 46 + lNombre).toString('latin1');
    const ini = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const datos = buf.slice(ini, ini + comp);
    if (!nombre.endsWith('/')) out[path.basename(nombre)] = metodo === 0 ? datos : metodo === 8 ? zlib.inflateRawSync(datos) : null;
    p += 46 + lNombre + lExtra + lCom;
  }
  return out;
}

// ---------- Armado (igual que ncm/build_sim.py + ncm/build_nomenclador.py) ----------
const LINEAS = /\r\n|[\n\r\v\f\x1c\x1d\x1e\x85\u2028\u2029]/;
const ESPACIO = /^[\s\x1c-\x1f\x85]+|[\s\x1c-\x1f\x85]+$/g;
const strip = (s) => String(s).replace(ESPACIO, '');
function texto(buf) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (_) { return buf.toString('latin1'); }
}
function clean(s) {
  s = s.split('dem?s').join('demás').split('Dem?s').join('Demás').split('DEM?S').join('DEMÁS').split('todav?a').join('todavía');
  return strip(s.replace(/«/g, '"').replace(/»/g, '"').replace(/[\s\x1c-\x1f\x85]+/g, ' '));
}
const num = (v) => { const t = strip(v); if (t === '' || !/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(t)) return null; return parseFloat(t); };
// Python escribe los float en el CSV como "0.0", "12.5": el campo DIEM se guarda como texto en ese formato.
const pyFloat = (n) => (n === null ? '' : Number.isInteger(n) ? `${n}.0` : String(n));

function construir({ nomenclador, sufijos, capitulo, nombreNomenclador }) {
  const mods = JSON.parse(fs.readFileSync(path.join(RAIZ, 'ncm', 'modificaciones.json'), 'utf8'));
  const m = /(\d{8})/.exec(nombreNomenclador || '');
  if (!m) throw new Error('No encontré la fecha en el nombre del nomenclador de ARCA');
  const fecha = `${m[1].slice(4)}-${m[1].slice(2, 4)}-${m[1].slice(0, 2)}`;

  const lineas = [];
  for (const line of texto(nomenclador).split(LINEAS)) {
    const p = line.split('@');
    if (p.length < 11 || p[0] !== '2') continue;
    const code = strip(p[1]);
    const v = p.slice(2, 8).map(strip);
    lineas.push({ code, digits: code.replace(/[^0-9]/g, ''), control: code && /\p{L}/u.test(code.slice(-1)) ? code.slice(-1) : '',
      de: v[0], re: v[1], die: v[2], ri: v[3], dii: v[4], diem: v[5], unidad: strip(p[8]), unidad_esp: strip(p[9]), desc: clean(p[10]) });
  }
  const porDigitos = new Map();
  for (const l of lineas) if (!l.control && !porDigitos.has(l.digits)) porDigitos.set(l.digits, l);

  // Textos deduplicados y filas como en web/nomenclador/data/sim.json
  const textos = []; const idx = new Map();
  const tid = (s) => { if (!idx.has(s)) { idx.set(s, textos.length); textos.push(s); } return idx.get(s); };
  const filas = [];
  for (const l of lineas) {
    if (!l.control) continue;
    const d = l.digits; const padres = [];
    for (let n = 2; n < d.length; n++) {
      const a = porDigitos.get(d.slice(0, n));
      if (a && a.desc && !padres.includes(a.desc)) padres.push(a.desc);
    }
    let internos = 0;
    for (const ii of mods.impuestos_internos || []) if (ii.prefijos.some((pf) => d.startsWith(pf.replace(/\./g, '')))) internos = ii.alicuota;
    const desc = [...padres, l.desc].join(' > ');
    const ids = desc.split(' > ').map((x) => tid(strip(x)));
    const n0 = (x) => num(x) ?? 0;
    filas.push([l.code, n0(l.die), n0(l.dii), n0(l.de), n0(l.re), n0(l.ri), pyFloat(num(l.diem)), l.unidad_esp, l.unidad, Math.round(internos * 1e4) / 1e4, ids]);
  }

  // Caracteres rotos de ARCA ("n?mero" -> "número") con el vocabulario del propio arancel
  const vocab = new Set();
  for (const t of textos) for (const w of t.match(/\p{L}+/gu) || []) vocab.add(w.toLowerCase());
  const CAND = 'áéíóúñüÁÉÍÓÚÑÜ';
  const esMayus = (w) => w === w.toUpperCase() && w !== w.toLowerCase();
  const reparar = (w) => {
    if ((w.match(/\?/g) || []).length > 2) return w;
    let op = [''];
    for (const ch of w) op = op.flatMap((o) => (ch === '?' ? [...CAND].map((c) => o + c) : [o + ch]));
    for (const o of op) if (vocab.has(o.toLowerCase())) return esMayus(w) ? o.toUpperCase() : o;
    if (/ci\?n/i.test(w)) return w.replace(/\?/g, 'ó');
    return w;
  };
  const textosOk = textos.map((t) => t.replace(/[\p{L}\p{N}_]*\?[\p{L}\p{N}_]+/gu, reparar));

  // Sufijos de valor
  const suf = {};
  for (const line of texto(sufijos).split(LINEAS)) {
    const p = line.split('@');
    if (p.length < 5 || p[0] !== '3') continue;
    const clave = p[1].replace(/[^0-9]/g, '');
    (suf[clave] = suf[clave] || []).push({ s: strip(p[2]), norma: strip(p[3]), t: clean(p[4]) });
  }

  // Notas de sección y capítulo
  const notas = {};
  for (const line of Buffer.from(capitulo).toString('latin1').split(LINEAS)) {
    const i1 = line.indexOf('@'); if (i1 < 0) continue;
    const i2 = line.indexOf('@', i1 + 1); if (i2 < 0) continue;
    if (line.slice(0, i1) !== '1') continue;
    let t = line.slice(i2 + 1).replace(/ARANCEL INTEGRADO ADUANERO[\s\x1c-\x1f\x85]*=+/g, '');
    notas[strip(line.slice(i1 + 1, i2))] = strip(t.replace(/ {2,}/g, '\n'));
  }

  const meta = { fuente: 'ARCA - Arancel Integrado y Sufijos de Valor', fecha_archivos: fecha, posiciones_sim: filas.length, claves_con_sufijos: Object.keys(suf).length };
  return { sim: { meta, t: textosOk, p: filas }, notas, sufijos: suf };
}

// ---------- Comparación entre versiones ----------
const CAMPOS = [['die', 1, 'DIE'], ['dii', 2, 'DII'], ['de', 3, 'DE'], ['re', 4, 'Reintegro'], ['ri', 5, 'RI'], ['diem', 6, 'DIE mínimo']];
function comparar(viejo, nuevo) {
  const desc = (s, f) => f[10].map((i) => s.t[i]).join(' > ');
  const mapa = (s) => new Map(s.p.map((f) => [f[0], f]));
  const a = mapa(viejo), b = mapa(nuevo);
  const cambios = [], altas = [], bajas = [];
  for (const [c, f] of b) {
    const g = a.get(c);
    if (!g) { altas.push({ c, d: desc(nuevo, f) }); continue; }
    const dif = CAMPOS.filter(([, i]) => String(g[i]) !== String(f[i])).map(([, i, nom]) => ({ campo: nom, antes: g[i], ahora: f[i] }));
    const dv = desc(viejo, g), dn = desc(nuevo, f);
    if (dv !== dn) dif.push({ campo: 'Descripción', antes: dv.split(' > ').pop(), ahora: dn.split(' > ').pop() });
    if (dif.length) cambios.push({ c, dif });
  }
  for (const [c, g] of a) if (!b.has(c)) bajas.push({ c, d: desc(viejo, g) });
  return { desde: viejo.meta && viejo.meta.fecha_archivos, hasta: nuevo.meta.fecha_archivos, cambios, altas, bajas };
}

function resumen(r) {
  const lin = [`📚 Arancel ARCA actualizado: archivos del ${r.hasta} (antes ${r.desde}).`];
  if (!r.cambios.length && !r.altas.length && !r.bajas.length) { lin.push('Sin cambios en derechos ni descripciones.'); return lin.join('\n'); }
  if (r.cambios.length) {
    lin.push(`${r.cambios.length} posiciones cambiaron:`);
    for (const x of r.cambios.slice(0, 8)) lin.push(`• ${x.c}: ${x.dif.map((d) => (d.campo === 'Descripción' ? 'descripción' : `${d.campo} ${d.antes} → ${d.ahora}`)).join(', ')}`);
    if (r.cambios.length > 8) lin.push(`… y ${r.cambios.length - 8} más (en el nomenclador, "Cambios del arancel").`);
  }
  if (r.altas.length) lin.push(`${r.altas.length} posiciones nuevas.`);
  if (r.bajas.length) lin.push(`${r.bajas.length} posiciones dadas de baja.`);
  return lin.join('\n');
}

function escribir(nombre, obj) {
  fs.mkdirSync(dir(), { recursive: true });
  const p = path.join(dir(), nombre);
  fs.writeFileSync(p + '.tmp', JSON.stringify(obj));
  fs.renameSync(p + '.tmp', p);
}
/** Historial de cambios (los últimos 30 arancel nuevos), para la página. */
function historial() {
  try { return JSON.parse(fs.readFileSync(path.join(dir(), 'cambios.json'), 'utf8')); } catch (_) { return []; }
}

/**
 * Baja el zip de ARCA y, si es más nuevo que el que está en uso, lo instala.
 * Devuelve { nuevo: false } o { nuevo: true, comparacion, texto }. Nunca deja el nomenclador roto: si algo falla, sigue el anterior.
 */
async function actualizar(fetchImpl = fetch, { forzar = false } = {}) {
  const r = await fetchImpl(URL_ARANCEL, { headers: { 'user-agent': 'Mozilla/5.0 (PuertoBox nomenclador)' } });
  if (!r.ok) throw new Error(`ARCA respondió ${r.status} al bajar el arancel`);
  const archivos = leerZip(Buffer.from(await r.arrayBuffer()));
  const nombre = (pre) => Object.keys(archivos).filter((k) => k.toLowerCase().startsWith(pre) && k.toLowerCase().endsWith('.txt')).sort().pop();
  const nNom = nombre('nomenclador_'), nSuf = nombre('sufijos_'), nCap = nombre('capitulo_');
  if (!nNom || !nSuf || !nCap) throw new Error(`El zip de ARCA no trae los 3 archivos (trae: ${Object.keys(archivos).join(', ')})`);
  const actual = leer('sim.json');
  const nuevo = construir({ nomenclador: archivos[nNom], sufijos: archivos[nSuf], capitulo: archivos[nCap], nombreNomenclador: nNom });
  if (!forzar && nuevo.sim.meta.fecha_archivos <= ((actual.meta && actual.meta.fecha_archivos) || '')) return { nuevo: false, fecha: nuevo.sim.meta.fecha_archivos };
  // Control: un archivo cortado o vacío no reemplaza al bueno.
  if (nuevo.sim.p.length < 0.9 * actual.p.length) throw new Error(`El arancel bajado trae ${nuevo.sim.p.length} posiciones (el actual ${actual.p.length}): no lo instalo`);
  const comparacion = comparar(actual, nuevo.sim);
  escribir('notas.json', nuevo.notas);
  escribir('sufijos.json', nuevo.sufijos);
  escribir('sim.json', nuevo.sim); // último: su fecha marca la versión
  const h = historial();
  h.unshift({ en: new Date().toISOString(), ...comparacion, cambios: comparacion.cambios.slice(0, 500), altas: comparacion.altas.slice(0, 300), bajas: comparacion.bajas.slice(0, 300) });
  escribir('cambios.json', h.slice(0, 30));
  return { nuevo: true, comparacion, texto: resumen(comparacion) };
}

module.exports = { URL_ARANCEL, ruta, version, leer, leerZip, construir, comparar, resumen, actualizar, historial, dir };
