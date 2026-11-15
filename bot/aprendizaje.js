'use strict';
/**
 * Circuito de aprendizaje del bot (15/11/2026, aprobado por Gustavo: "para que vaya mejorando").
 *
 * 1. Correcciones de Gustavo: en /charlas cada cliente tiene "Corregir al bot". Lo que escribe se guarda
 *    y el bot lo tiene en cuenta desde el próximo mensaje (últimas 20, en sus instrucciones).
 * 2. Revisión nocturna (23 h): la IA lee las charlas del día contra las reglas del bot y arma un informe
 *    SIN teléfonos, nombres, mails, links ni números de documento. Se sube al repo en la rama
 *    `aprendizaje-bot` (docs/aprendizaje/AAAA-MM-DD.md), que no dispara deploy. Necesita GITHUB_TOKEN en Railway.
 * 3. A la mañana, una tarea programada de Claude lee el informe, corrige el bot, corre las pruebas,
 *    mergea y le manda a Gustavo un resumen corto.
 *
 * El repo es público: todo lo que sale de acá pasa por anonimizar() dos veces (antes y después de la IA).
 */
const fs = require('fs');
const path = require('path');
const { horaAR, esGustavo } = require('./recordatorios');

const MODELO = process.env.APRENDIZAJE_MODEL || process.env.CLASIFICADOR_MODEL || 'claude-sonnet-5-5';
const REPO = process.env.GITHUB_REPO || 'gusjespindola-glitch/puertobox-datos';
const RAMA = process.env.APRENDIZAJE_RAMA || 'aprendizaje-bot';
const HORA = Number(process.env.APRENDIZAJE_HORA || 23);
const MAX_CORRECCIONES = 20;
const MAX_CHARLAS = 40;

// ---------- Anonimizar ----------
/** Saca todo lo que identifica a una persona. `nombres`: nombres conocidos del cliente (del lead). */
function anonimizar(texto, nombres = []) {
  let s = String(texto ?? '');
  s = s.replace(/\[archivo:[^\]]*\]/g, '[archivo]');
  s = s.replace(/https?:\/\/\S+|www\.\S+|wa\.me\/\S+/gi, '[link]');
  s = s.replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[mail]');
  s = s.replace(/\+?\d[\d\s().-]{6,}\d/g, '[número]'); // teléfonos, CUIT, DNI, CBU
  s = s.replace(/\b(me llamo|mi nombre es|soy)\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)?)/g, '$1 [nombre]');
  for (const n of nombres) {
    for (const parte of String(n || '').split(/\s+/).filter((p) => p.length >= 3)) {
      s = s.replace(new RegExp(`\\b${parte.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'), '[nombre]');
    }
  }
  return s;
}

const texto = (content) => (typeof content === 'string' ? content : Array.isArray(content) ? content.filter((b) => b && b.type === 'text').map((b) => b.text).join('\n') : '');

// ---------- Correcciones de Gustavo ----------
function correcciones(store) { return store.meta('correcciones') || []; }

/** Guarda una corrección de Gustavo para un chat. Devuelve la corrección guardada. */
function agregarCorreccion(store, tel, indicacion, ahora = Date.now()) {
  const ind = String(indicacion || '').trim().slice(0, 1500);
  if (!ind) return null;
  const msgs = store.historial(tel) || [];
  const ultimoBot = [...msgs].reverse().find((m) => m.role === 'assistant' && !texto(m.content).startsWith('[Gustavo]'));
  const ultimoCliente = [...msgs].reverse().find((m) => m.role === 'user');
  const l = (store.lead && store.lead(tel)) || {};
  const nombres = [l.nombre].filter(Boolean);
  const c = {
    en: new Date(ahora).toISOString(),
    indicacion: anonimizar(ind, nombres),
    bot_dijo: ultimoBot ? anonimizar(texto(ultimoBot.content), nombres).slice(0, 600) : '',
    cliente_dijo: ultimoCliente ? anonimizar(texto(ultimoCliente.content), nombres).slice(0, 400) : '',
  };
  const lista = [...correcciones(store), c].slice(-100);
  store.meta('correcciones', lista);
  return c;
}

/** Bloque para las instrucciones del bot: las últimas correcciones, para aplicarlas ya. */
function textoCorrecciones(store) {
  const ult = correcciones(store).slice(-MAX_CORRECCIONES);
  if (!ult.length) return '';
  return `Correcciones de nuestro despachante sobre charlas anteriores. Valen como reglas: si una contradice algo de arriba, manda la corrección.\n${ult.map((c, i) => `${i + 1}. ${c.cliente_dijo ? `Cliente: "${c.cliente_dijo.slice(0, 200)}". ` : ''}${c.bot_dijo ? `El bot contestó: "${c.bot_dijo.slice(0, 300)}". ` : ''}Tenía que ser: ${c.indicacion}`).join('\n')}`;
}

// ---------- Revisión nocturna ----------
/** Charlas con mensajes de clientes en las últimas 24 h, anonimizadas (Cliente 1, Cliente 2…). */
function charlasDelDia(store, owner, ahora = Date.now()) {
  const desde = ahora - 24 * 3600e3;
  return store.chats()
    .filter((c) => !esGustavo(c.telefono, owner) && (c.ultimo || 0) >= desde && (c.mensajes || []).some((m) => m.role === 'user'))
    .sort((a, b) => (a.ultimo || 0) - (b.ultimo || 0))
    .slice(-MAX_CHARLAS)
    .map((c, i) => {
      const l = (store.lead && store.lead(c.telefono)) || {};
      const nombres = [l.nombre].filter(Boolean);
      const lineas = c.mensajes.map((m) => {
        const t = texto(m.content).trim();
        if (!t) return null;
        const quien = m.role === 'user' ? 'Cliente' : t.startsWith('[Gustavo]') ? 'Despachante' : 'Bot';
        return `${quien}: ${anonimizar(t.replace(/^\[Gustavo\]\s*/, ''), nombres).slice(0, 1200)}`;
      }).filter(Boolean);
      return { n: i + 1, origen: c.origen || '', estado: l.estado || '', texto: lineas.join('\n') };
    });
}

const INSTRUCCION = `Sos el supervisor de calidad del bot de WhatsApp de PuertoBox (courier China → Argentina). Abajo tenés las reglas del bot y las charlas de hoy (ya sin datos personales). Revisá cada charla contra las reglas y contra lo que esperaría un cliente argentino que no sabe de importación.

Escribí un informe en castellano, en Markdown, con este formato exacto:

# Revisión del bot — {{fecha}}
Charlas revisadas: N · Con errores: N · Llegaron a presupuesto: N

## Errores
Para cada error (solo errores reales, no gustos): "### Charla X — <título corto>", y abajo: **Qué pasó** (1-2 líneas, con la frase del bot entre comillas, máximo 25 palabras), **Regla** (cuál rompe o "falta regla"), **Cómo tenía que ser** (la respuesta correcta, corta) y **Arreglo propuesto** (qué cambiar en el prompt o en el código, concreto).

## Correcciones de Gustavo de hoy
Las que haya, con el arreglo permanente propuesto para cada una. Si no hay, "Ninguna".

## Patrones
Lo que se repite en varias charlas (abandonos, preguntas que no sabe contestar, productos que no traemos).

## Nada que tocar
Una línea por charla que estuvo bien.

Reglas del informe: nunca escribas teléfonos, nombres, mails, links, CUIT ni direcciones. No inventes: si no estás seguro de que algo es un error, ponelo en Patrones como duda. Precios, normas aduaneras y posiciones arancelarias: marcalos "a validar por Gustavo".`;

async function revisarDia({ store, owner, fetchImpl = fetch, ahora = Date.now(), reglas }) {
  const { fecha } = horaAR(ahora);
  const charlas = charlasDelDia(store, owner, ahora);
  const desde = ahora - 24 * 3600e3;
  const corr = correcciones(store).filter((c) => Date.parse(c.en) >= desde);
  if (!charlas.length && !corr.length) return { fecha, contenido: `# Revisión del bot — ${fecha}\n\nHoy no hubo charlas de clientes ni correcciones.\n`, charlas: 0 };
  const cuerpo = [
    `## Reglas del bot\n${reglas}`,
    `## Correcciones de Gustavo de hoy\n${corr.length ? corr.map((c, i) => `${i + 1}. Cliente: "${c.cliente_dijo}" · Bot: "${c.bot_dijo}" · Tenía que ser: ${c.indicacion}`).join('\n') : 'Ninguna'}`,
    `## Charlas de hoy\n${charlas.map((c) => `### Charla ${c.n}${c.origen ? ` (llegó por: ${c.origen})` : ''}${c.estado ? ` · estado: ${c.estado}` : ''}\n${c.texto}`).join('\n\n')}`,
  ].join('\n\n');
  const r = await fetchImpl('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODELO, max_tokens: 4000, system: INSTRUCCION.replace('{{fecha}}', fecha), messages: [{ role: 'user', content: cuerpo }] }),
  });
  if (!r.ok) throw new Error(`Anthropic ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  const informe = (j.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
  if (!informe) throw new Error('La IA no devolvió el informe');
  const pie = `\n\n---\nGenerado a las ${HORA} h por el servidor del bot (bot/aprendizaje.js) con ${MODELO}. ${charlas.length} charlas, ${corr.length} correcciones. Sin datos personales.\n`;
  return { fecha, contenido: anonimizar(informe) + pie, charlas: charlas.length };
}

// ---------- Subir a GitHub ----------
async function gh(fetchImpl, token, metodo, ruta, body) {
  const r = await fetchImpl(`https://api.github.com/repos/${REPO}${ruta}`, {
    method: metodo,
    headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'user-agent': 'puertobox-bot', 'x-github-api-version': '2022-11-28', ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const txt = await r.text();
  return { status: r.status, ok: r.ok, json: txt ? JSON.parse(txt) : null };
}

/** Sube (o reemplaza) docs/aprendizaje/<fecha>.md en la rama del aprendizaje. Crea la rama si no existe. */
async function subir({ fecha, contenido, token = process.env.GITHUB_TOKEN, fetchImpl = fetch }) {
  if (!token) return { ok: false, motivo: 'falta GITHUB_TOKEN' };
  const ref = await gh(fetchImpl, token, 'GET', `/git/ref/heads/${RAMA}`);
  if (ref.status === 404) {
    const main = await gh(fetchImpl, token, 'GET', '/git/ref/heads/main');
    if (!main.ok) throw new Error(`GitHub main ${main.status}`);
    const nueva = await gh(fetchImpl, token, 'POST', '/git/refs', { ref: `refs/heads/${RAMA}`, sha: main.json.object.sha });
    if (!nueva.ok) throw new Error(`GitHub crear rama ${nueva.status}`);
  } else if (!ref.ok) throw new Error(`GitHub rama ${ref.status}`);
  const ruta = `docs/aprendizaje/${fecha}.md`;
  const previo = await gh(fetchImpl, token, 'GET', `/contents/${ruta}?ref=${RAMA}`);
  const put = await gh(fetchImpl, token, 'PUT', `/contents/${ruta}`, {
    message: `Revisión del bot ${fecha} (automática, sin datos personales)`,
    content: Buffer.from(contenido, 'utf8').toString('base64'),
    branch: RAMA,
    ...(previo.ok && previo.json && previo.json.sha ? { sha: previo.json.sha } : {}),
  });
  if (!put.ok) throw new Error(`GitHub subir ${put.status}: ${JSON.stringify(put.json).slice(0, 200)}`);
  return { ok: true, ruta, rama: RAMA };
}

// ---------- Programación ----------
/** Corre en el ciclo de 15 min del servidor: una vez por día, a partir de las 23 h (Argentina). */
async function tick({ store, owner, reglas, fetchImpl = fetch, ahora = Date.now(), dirLocal = null, avisar = null }) {
  const { hora, fecha } = horaAR(ahora);
  if (hora < HORA || store.meta('aprendizajeDia') === fecha) return null;
  store.meta('aprendizajeDia', fecha); // primero se marca: si algo falla, no se repite en loop (y no gasta de más)
  try {
    const inf = await revisarDia({ store, owner, fetchImpl, ahora, reglas });
    if (dirLocal) { try { fs.mkdirSync(dirLocal, { recursive: true }); fs.writeFileSync(path.join(dirLocal, `${fecha}.md`), inf.contenido); } catch (e) { console.error('Aprendizaje (local):', e.message); } }
    const sub = await subir({ fecha, contenido: inf.contenido, fetchImpl });
    store.meta('aprendizajeUltimo', { fecha, charlas: inf.charlas, subido: sub.ok, motivo: sub.motivo || null });
    if (!sub.ok) console.error('Aprendizaje: no se subió al repo:', sub.motivo);
    return { ...inf, ...sub };
  } catch (e) {
    console.error('Aprendizaje:', e.message);
    store.meta('aprendizajeUltimo', { fecha, error: String(e.message).slice(0, 200) });
    if (avisar) await avisar(`No se pudo armar la revisión nocturna del bot: ${String(e.message).slice(0, 120)}`, 'PuertoBox: revisión del bot', 'low').catch(() => {});
    return { error: e.message };
  }
}

module.exports = { anonimizar, agregarCorreccion, textoCorrecciones, correcciones, charlasDelDia, revisarDia, subir, tick, RAMA };
