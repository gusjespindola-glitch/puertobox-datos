'use strict';
/**
 * Bibliografía del curso de despachante (17/11/2026, Gustavo: "quiero que haga como NotebookLM, que se basa en la bibliografía").
 * Vademécum (módulos 1 a 5), Manual de Clasificación Arancelaria (1.ª y 2.ª parte), anexo con las RGI y sus Notas Explicativas
 * y los apuntes de Gustavo. NO va al repo (es público y es material del curso): el servidor la baja una vez de su Drive
 * (BIBLIO_URL) y la guarda en el disco de datos. Búsqueda por palabras (BM25) que devuelve los fragmentos con fuente y página.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ID_DRIVE = '1zCeB95qOp8dru3fgChUNX8dTW1Sgky92';
const URL_DEF = `https://drive.usercontent.google.com/download?id=${ID_DRIVE}&export=download&confirm=t`;
const VACIAS = new Set('a al ante bajo con contra de del desde durante en entre hacia hasta mediante para por segun sin sobre tras el la los las lo un una unos unas y o u e ni que se su sus es son ser como mas pero si no ya le les this the of and or to in for con'.split(' '));
const normalizar = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñ.]+/g, ' ');
const palabras = (t) => normalizar(t).split(' ').map((w) => w.replace(/^\.+|\.+$/g, '')).filter((w) => w.length > 1 && !VACIAS.has(w));
// Raíz simple para que "paragolpes/paragolpe", "juguetes/juguete" coincidan.
const raiz = (w) => (/^\d/.test(w) ? w : w.replace(/s$/, '').replace(/e$/, '').slice(0, 9));

let indice = null;
let tarifar = null; let tarifarVersion = -1;

/**
 * El "Tarifar" de Gustavo (17/11): lo que tiene el nomenclador y se actualiza solo. Criterios de clasificación de ARCA,
 * intervenciones, regímenes courier, impuestos internos y novedades del Boletín Oficial. Se arma desde los archivos vivos,
 * así cada actualización entra sola al buscador.
 */
function trozosTarifar() {
  const raizRepo = path.join(__dirname, '..');
  const leer = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
  let arancel = null; try { arancel = require('../src/arancel'); } catch { arancel = null; }
  const datoNomenclador = (f) => leer(arancel ? arancel.ruta(f) : path.join(raizRepo, 'web/nomenclador/data', f)) || leer(path.join(raizRepo, 'ncm', f));
  const out = [];
  const crit = datoNomenclador('criterios.json');
  if (crit && Array.isArray(crit.criterios)) {
    for (const c of crit.criterios) out.push({ f: `Tarifar – Criterio de clasificación ARCA ${c.criterio || ''} (${c.norma || ''})`.trim(), p: null, t: `Posición ${c.pos}: ${c.desc}. Criterio ${c.criterio || ''}, expediente ${c.expediente || ''}, ${c.norma || ''}.` });
  }
  const inter = datoNomenclador('intervenciones.json');
  if (inter) {
    for (const [org, txt] of Object.entries(inter.organismos || {})) out.push({ f: `Tarifar – Intervenciones: ${org}`, p: null, t: `${org}: ${txt}` });
    for (const r of inter.reglas || []) out.push({ f: 'Tarifar – Intervenciones por posición', p: null, t: JSON.stringify(r) });
  }
  const reg = leer(path.join(raizRepo, 'data/regimenes.json'));
  if (reg) for (const [k, v] of Object.entries(reg)) if (k !== '_meta') out.push({ f: `Tarifar – Régimen ${k.replace(/_/g, ' ')} (${((reg._meta || {}).normativa || []).join(', ')})`, p: null, t: JSON.stringify(v) });
  const mod = leer(path.join(raizRepo, 'ncm/modificaciones.json'));
  if (mod) for (const ii of mod.impuestos_internos || []) out.push({ f: `Tarifar – Impuestos internos (${ii.norma})`, p: null, t: JSON.stringify(ii) });
  const dirNov = path.join(raizRepo, 'docs/novedades');
  try {
    for (const f of fs.readdirSync(dirNov).filter((x) => /^\d{4}-\d\d-\d\d\.md$/.test(x))) {
      for (const sec of fs.readFileSync(path.join(dirNov, f), 'utf8').split(/\n(?=##+ )/)) out.push({ f: `Tarifar – Novedades normativas ${f.replace('.md', '')}`, p: null, t: sec.slice(0, 1800) });
    }
  } catch { /* sin novedades */ }
  return out.filter((x) => x.t && x.t.length > 30);
}
function indiceTarifar() {
  let v = 0; try { v = require('../src/arancel').version(); } catch { v = 0; }
  if (!tarifar || v !== tarifarVersion) { tarifar = construir(trozosTarifar()); tarifarVersion = v; }
  return tarifar;
}
function construir(trozos) {
  const df = new Map(); const docs = [];
  for (const t of trozos) {
    const tf = new Map();
    for (const w of palabras(t.t)) { const r = raiz(w); tf.set(r, (tf.get(r) || 0) + 1); }
    for (const r of tf.keys()) df.set(r, (df.get(r) || 0) + 1);
    docs.push({ ...t, tf, largo: [...tf.values()].reduce((a, b) => a + b, 0) });
  }
  const prom = docs.reduce((a, d) => a + d.largo, 0) / (docs.length || 1);
  return { docs, df, prom, n: docs.length };
}

function ruta() { return path.join(path.dirname(process.env.DATA_FILE || path.join(__dirname, 'data.json')), 'bibliografia.json.gz'); }

/** Carga la bibliografía: disco de datos → si no está, la baja del Drive de Gustavo (una sola vez). */
async function cargar(fetchImpl = (...a) => fetch(...a)) {
  if (indice) return indice;
  let buf = null;
  try { buf = fs.readFileSync(ruta()); } catch { buf = null; }
  if (!buf) {
    const r = await fetchImpl(process.env.BIBLIO_URL || URL_DEF);
    if (!r.ok) throw new Error(`no se pudo bajar la bibliografía (${r.status})`);
    buf = Buffer.from(await r.arrayBuffer());
    if (buf[0] !== 0x1f || buf[1] !== 0x8b) throw new Error('la bibliografía del Drive no está compartida con "cualquiera con el enlace"');
    try { fs.mkdirSync(path.dirname(ruta()), { recursive: true }); fs.writeFileSync(ruta(), buf); } catch { /* sin disco: queda en memoria */ }
  }
  indice = construir(JSON.parse(zlib.gunzipSync(buf).toString('utf8')));
  return indice;
}

/** Los fragmentos más relevantes (BM25), con fuente y página. */
function buscar(idx, consulta, max = 6, cobertura = 0) {
  const q = [...new Set(palabras(consulta).map(raiz))];
  if (!q.length) return [];
  const k1 = 1.4; const b = 0.75;
  const res = [];
  for (const d of idx.docs) {
    let s = 0; let tocadas = 0;
    for (const r of q) {
      const f = d.tf.get(r); if (!f) continue; tocadas++;
      const idf = Math.log(1 + (idx.n - idx.df.get(r) + 0.5) / (idx.df.get(r) + 0.5));
      s += idf * (f * (k1 + 1)) / (f + k1 * (1 - b + b * d.largo / idx.prom));
    }
    if (s > 0 && tocadas >= Math.ceil(q.length * cobertura)) res.push({ s, d });
  }
  res.sort((a, c) => c.s - a.s);
  const out = []; const vistos = new Set();
  for (const { d } of res) {
    const k = d.f + '|' + d.p + '|' + d.t.slice(0, 60);
    if (vistos.has(k)) continue; vistos.add(k);
    out.push({ fuente: d.p ? `${d.f}, pág. ${d.p}` : d.f, texto: d.t.slice(0, 1600) });
    if (out.length >= max) break;
  }
  return out;
}

/** Lista para usar ya (en memoria o en el disco de datos). Si no, el clasificador sigue con ARCA solo. */
function disponible() { if (indice) return true; try { return fs.statSync(ruta()).size > 1000; } catch { return false; } }

/** Al arrancar el servidor: la baja del Drive en segundo plano; si falla, avisa en el log y se reintenta en el próximo arranque. */
function precargar() { return cargar().then((i) => console.log(`📚 bibliografía cargada: ${i.n} fragmentos`)).catch((e) => console.log('📚 bibliografía no disponible:', e.message)); }

/** Busca en el Tarifar (siempre) y en la bibliografía del curso (si ya está cargada). Lo vigente del Tarifar va primero. */
async function consultar(consulta) {
  const deTarifar = buscar(indiceTarifar(), consulta, 3, 1 / 3); // del Tarifar, solo lo que coincide en serio
  let deLibros = []; let aviso;
  try { deLibros = buscar(await cargar(), consulta, 6); } catch (e) { aviso = 'Bibliografía del curso no disponible ahora (' + e.message + '): respondé con el Tarifar, las notas y ARCA.'; }
  const fragmentos = [...deTarifar, ...deLibros];
  if (!fragmentos.length) aviso = aviso || 'No hay nada sobre eso: probá con otras palabras (nombre técnico, partida, nota).';
  return aviso ? { fragmentos, aviso } : { fragmentos };
}

module.exports = { consultar, trozosTarifar, cargar, buscar, construir, palabras, disponible, precargar, _usar: (trozos) => { indice = trozos ? construir(trozos) : null; } };
