'use strict';
/**
 * Medidor y tope de gasto de IA (22/11/2026, Gustavo: "se me está gastando todo el saldo y no me gusta").
 *
 * Envuelve fetch: cada llamada a la API de Anthropic suma lo que costó (según los tokens que devuelve la API) en
 * store.meta('gastoIA'), por día (hora argentina) y por parte del sistema. Así se ve en /pendientes cuánto se gasta y en qué.
 *
 * Tope diario (GASTO_IA_TOPE_DIA, USD, 0,40 por defecto): pasado el tope, las charlas con clientes siguen igual (Haiku,
 * son baratas), pero todo lo demás (clasificador, lectura de archivos y links, revisiones) pasa a Haiku y sin búsqueda
 * web. Llega un solo aviso por día.
 */

// USD por millón de tokens (platform.claude.com/docs/en/about-claude/pricing, 22/11/2026).
const PRECIOS = {
  'claude-haiku-5-5': { in: 0.10, w: 0.125, r: 0.01, out: 0.50, largo: { in: 0.50, w: 0.625, r: 0.05, out: 2.50 } },
  'claude-sonnet-5-5': { in: 2, w: 2.5, r: 0.10, out: 10 },
  'claude-opus-5-5': { in: 4, w: 5, r: 0.20, out: 20 },
};
const USD_BUSQUEDA_WEB = 0.01;
const MODELO_BARATO = 'claude-haiku-5-5';
const URL_API = 'https://api.anthropic.com/v1/messages';

const NOMBRES = {
  charlas: 'charlas con clientes',
  clasificador: 'clasificador de posiciones',
  archivos: 'lectura de fotos y archivos',
  links: 'lectura de links',
  revision: 'revisión nocturna',
  intervenciones: 'análisis de intervenciones',
  otros: 'otros (pruebas, simulador)',
};

function tope() {
  const n = Number(String(process.env.GASTO_IA_TOPE_DIA || '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : 0.40;
}

function diaAR(ahora = Date.now()) { return new Date(ahora - 3 * 3600e3).toISOString().slice(0, 10); }

function costo(model, u = {}) {
  const base = PRECIOS[model] || PRECIOS['claude-sonnet-5-5']; // modelo desconocido: se cuenta caro, para no quedarse corto
  const total = (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
  const p = base.largo && total > 100000 ? base.largo : base;
  const tokens = ((u.input_tokens || 0) * p.in + (u.cache_creation_input_tokens || 0) * p.w + (u.cache_read_input_tokens || 0) * p.r + (u.output_tokens || 0) * p.out) / 1e6;
  const busquedas = ((u.server_tool_use && u.server_tool_use.web_search_requests) || 0) * USD_BUSQUEDA_WEB;
  return tokens + busquedas;
}

/** Qué parte del sistema hace la llamada (por las herramientas y las instrucciones que manda). */
function parte(body = {}) {
  const tools = (body.tools || []).map((t) => t.name || t.type || '');
  const sys = Array.isArray(body.system) ? body.system.map((b) => b.text || '').join('\n') : String(body.system || '');
  if (tools.includes('cotizar')) return 'charlas';
  if (tools.includes('consultar_bibliografia')) return 'clasificador';
  if (/Un cliente mandó esta imagen o documento/.test(sys)) return 'archivos';
  if (tools.includes('web_fetch') || /^Te paso el texto de la publicación/.test(sys)) return 'links';
  if (/^Sos el supervisor de calidad del bot/.test(sys)) return 'revision';
  if (/^Sos el supervisor del bot/.test(sys)) return 'intervenciones';
  return 'otros';
}

function datos(store) { return (store && store.meta && store.meta('gastoIA')) || {}; }

function delDia(store, dia = diaAR()) { return datos(store)[dia] || { total: 0, partes: {}, llamadas: 0 }; }

function registrar(store, { model, usage, parte: p, dia = diaAR() }) {
  if (!store || !store.meta) return 0;
  const usd = costo(model, usage);
  const todo = datos(store);
  const d = todo[dia] || { total: 0, partes: {}, llamadas: 0 };
  d.total = Math.round((d.total + usd) * 1e6) / 1e6;
  d.partes[p] = Math.round(((d.partes[p] || 0) + usd) * 1e6) / 1e6;
  d.llamadas += 1;
  todo[dia] = d;
  for (const k of Object.keys(todo).sort().slice(0, -30)) delete todo[k]; // se guardan los últimos 30 días
  store.meta('gastoIA', todo);
  return usd;
}

/** Cambia el pedido cuando ya se pasó el tope: modelo barato y sin búsqueda web (las charlas no se tocan). */
function abaratar(body) {
  const b = { ...body, model: MODELO_BARATO };
  if (b.tools) b.tools = b.tools.filter((t) => t.type !== 'web_search_20250305' && t.name !== 'web_search');
  if (b.tools && !b.tools.length) delete b.tools;
  return b;
}

/** Envuelve fetch. Devuelve la función envuelta (también la instala en globalThis si instalar=true). */
function envolver({ store, avisar = null, fetchBase = globalThis.fetch, instalar = false, ahora = () => Date.now() }) {
  const envuelto = async (url, opts = {}) => {
    if (String(url) !== URL_API || !opts || typeof opts.body !== 'string') return fetchBase(url, opts);
    let body; try { body = JSON.parse(opts.body); } catch { return fetchBase(url, opts); }
    const p = parte(body);
    const dia = diaAR(ahora());
    const pasado = delDia(store, dia).total >= tope();
    if (pasado && p !== 'charlas' && body.model !== MODELO_BARATO) {
      body = abaratar(body);
      opts = { ...opts, body: JSON.stringify(body) };
    }
    const r = await fetchBase(url, opts);
    try {
      if (r && r.ok && typeof r.clone === 'function') {
        const j = await r.clone().json();
        if (j && j.usage) {
          const antes = delDia(store, dia).total;
          registrar(store, { model: j.model || body.model, usage: j.usage, parte: p, dia });
          const despues = delDia(store, dia).total;
          if (antes < tope() && despues >= tope() && avisar) {
            avisar(`La IA ya gastó USD ${despues.toFixed(2)} hoy (tope USD ${tope().toFixed(2)}). Hasta mañana el clasificador y la lectura de archivos usan el modelo barato y sin búsqueda web. Las charlas siguen igual.`, 'PuertoBox: tope de gasto de IA', 'default');
          }
        }
      }
    } catch (e) { /* medir nunca rompe una respuesta */ }
    return r;
  };
  if (instalar) globalThis.fetch = envuelto;
  return envuelto;
}

const usd = (n) => `USD ${n.toFixed(2).replace('.', ',')}`;

/** Línea para el pie de /pendientes y el resumen de las 9. */
function resumen(store, ahora = Date.now()) {
  const todo = datos(store);
  const hoy = diaAR(ahora);
  const d = todo[hoy] || { total: 0, partes: {} };
  const semana = Object.entries(todo).filter(([k]) => k > diaAR(ahora - 7 * 86400e3)).reduce((s, [, v]) => s + v.total, 0);
  const partes = Object.entries(d.partes).sort((a, b) => b[1] - a[1]).filter(([, v]) => v >= 0.005).map(([k, v]) => `${NOMBRES[k] || k} ${usd(v)}`);
  return `Gasto de IA hoy: ${usd(d.total)}${partes.length ? ` (${partes.join(' · ')})` : ''} · últimos 7 días: ${usd(semana)} · tope por día: ${usd(tope())}`;
}

module.exports = { PRECIOS, costo, parte, registrar, envolver, abaratar, resumen, delDia, tope, diaAR, NOMBRES };
