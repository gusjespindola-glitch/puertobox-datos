'use strict';
/**
 * ¿Podía el bot? (16/11/2026, Gustavo: "mi idea es que la mayoría de las charlas las lleves vos, que solo intervenga yo
 * cuando vos no puedas. Revisá los chats en los que intervine yo y mirá si lo podías haber hecho vos.")
 *
 * El servidor junta las charlas de los últimos días en las que Gustavo escribió (mensajes "[Gustavo]") o el bot le
 * pasó el chat (derivación), las anonimiza y la IA las revisa contra las reglas del bot: por qué intervino Gustavo,
 * qué hizo y si el bot lo podía hacer (y qué le falta: regla, dato o herramienta).
 * El informe se sube SIN datos personales a la rama aprendizaje-bot (docs/aprendizaje/intervenciones-AAAA-MM-DD.md),
 * igual que la revisión nocturna, y Claude lo lee desde ahí (Claude no llega a Railway).
 */
const { horaAR, esGustavo } = require('./recordatorios');
const { anonimizar, subir, pedirSinPensar } = require('./aprendizaje');

const MODELO = process.env.APRENDIZAJE_MODEL || process.env.CLASIFICADOR_MODEL || 'claude-sonnet-5-5';
const MODELO_RESPALDO = process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5';
const DIAS = 7;
const MAX_CHARLAS = 40;
const MAX_INTENTOS = 4;
const VERSION = 'v3-16-11'; // v3: sin "pensar" (v1 y v2: la IA llegaba a max_tokens sin escribir nada) // cambiar para que el servidor la vuelva a correr después de un deploy

const textoDe = (content) => (typeof content === 'string' ? content : Array.isArray(content) ? content.filter((b) => b && b.type === 'text').map((b) => b.text).join('\n') : '');

/** Charlas (de clientes) de los últimos DIAS en las que escribió Gustavo o el bot le pasó el chat. Ya anonimizadas. */
function charlasConGustavo(store, owner, ahora = Date.now(), dias = DIAS) {
  const desde = ahora - dias * 24 * 3600e3;
  return store.chats()
    .filter((c) => !esGustavo(c.telefono, owner) && !String(c.telefono).startsWith('ig:') && (c.ultimo || 0) >= desde)
    .filter((c) => (c.mensajes || []).some((m) => m.role === 'assistant' && textoDe(m.content).startsWith('[Gustavo]')) || c.derivadoEn)
    .sort((a, b) => (a.ultimo || 0) - (b.ultimo || 0))
    .slice(-MAX_CHARLAS)
    .map((c, i) => {
      const l = (store.lead && store.lead(c.telefono)) || {};
      const nombres = [l.nombre].filter(Boolean);
      const lineas = (c.mensajes || []).map((m) => {
        const t = textoDe(m.content).trim();
        if (!t) return null;
        const quien = m.role === 'user' ? 'Cliente' : t.startsWith('[Gustavo]') ? 'GUSTAVO' : 'Bot';
        return `${quien}: ${anonimizar(t.replace(/^\[Gustavo\]\s*/, ''), nombres).slice(0, 1000)}`;
      }).filter(Boolean);
      const escribio = lineas.some((x) => x.startsWith('GUSTAVO:'));
      // El resumen de la derivación no se manda: el bot ahí pone el nombre del cliente y el repo es público.
      const deriv = c.derivadoEn ? `el bot le pasó el chat a Gustavo (motivo: ${c.derivadoMotivo || '?'}${c.derivadoQuiere ? `; el cliente quería: ${anonimizar(String(c.derivadoQuiere), nombres).slice(0, 120)}` : ''})` : 'el bot no lo derivó';
      return { n: i + 1, escribio, texto: lineas.join('\n'), meta: `${deriv} · Gustavo ${escribio ? 'escribió en la charla' : 'no escribió en la charla'} · estado: ${l.estado || 'sin datos'}` };
    });
}

const INSTRUCCION = `Sos el supervisor del bot de WhatsApp de PuertoBox (courier aéreo China → Argentina; Gustavo es el despachante de aduana y dueño).
Gustavo quiere que el bot lleve la mayoría de las charlas y que él intervenga solo cuando el bot no puede. Abajo tenés las reglas del bot y las charlas de los últimos días en las que Gustavo escribió ("GUSTAVO:") o en las que el bot le pasó el chat. Ya no tienen datos personales.

Para cada charla decidí si el bot podía haberla llevado sin Gustavo. Lo que SOLO puede hacer Gustavo: confirmar un pago o pasar los datos de la cuenta para pagar, aceptar un cliente o un pedido fuera de las reglas, validar una posición arancelaria dudosa o un permiso (ENACOM, ANMAT, marca), resolver un reclamo de un envío ya pagado, coordinar con el forwarder (Howard) y decidir precios o excepciones. Todo lo demás (explicar, cotizar, pedir datos, contestar dudas comunes, seguir la charla) lo tiene que poder hacer el bot.

Escribí un informe en castellano, en Markdown, con este formato exacto:

# ¿Podía el bot? — {{fecha}}
Charlas revisadas: N · Gustavo escribió en: N · El bot podía solo: N · Podía con un cambio: N · Necesitaban a Gustavo: N

## Resumen en 3 líneas
Lo más importante para Gustavo, en simple.

## Charla por charla
"### Charla X — <título corto del producto o tema>" y abajo, en una línea cada uno:
- **Por qué intervino Gustavo:** (el bot derivó / el bot contestó mal / Gustavo se metió solo / otro)
- **Qué hizo Gustavo:** (1 línea; si citás una frase, máximo 20 palabras)
- **¿Podía el bot?:** Sí / Sí, con un cambio / No, necesitaba a Gustavo
- **Qué le falta al bot:** la regla, el dato (por ejemplo datos de pago, dirección del depósito) o la herramienta concreta; "nada" si podía
- **Después de Gustavo:** si el bot podía retomar la charla y en qué momento

## Cambios para que el bot lleve más charlas
Lista ordenada por cuántas charlas resuelve cada cambio, con qué cambiar (prompt, dato en negocio.json, herramienta) y en cuántas charlas pasó.

## Lo que sí tiene que seguir siendo de Gustavo
Lista corta.

Reglas del informe: nunca escribas teléfonos, nombres, mails, links, CUIT ni direcciones. No inventes: si no se puede saber, decilo. Precios, normas aduaneras y posiciones: "a validar por Gustavo".`;

async function revisar({ store, owner, reglas, fetchImpl = fetch, ahora = Date.now() }) {
  const { fecha } = horaAR(ahora);
  const charlas = charlasConGustavo(store, owner, ahora);
  if (!charlas.length) return { fecha, charlas: 0, contenido: `# ¿Podía el bot? — ${fecha}\n\nEn los últimos ${DIAS} días no hubo charlas en las que Gustavo escribiera ni derivaciones.\n` };
  const cuerpo = `## Reglas del bot\n${reglas}\n\n## Charlas\n${charlas.map((c) => `### Charla ${c.n} (${c.meta})\n${c.texto}`).join('\n\n')}`;
  const fallas = [];
  for (const model of [...new Set([MODELO, MODELO_RESPALDO])]) {
    // 16/11: sin pensar y con más lugar; si el modelo no acepta "sin pensar", se repite sin ese parámetro (pedirSinPensar).
    const r = await pedirSinPensar(fetchImpl, { model, max_tokens: 16000, system: INSTRUCCION.replace('{{fecha}}', fecha), messages: [{ role: 'user', content: cuerpo }] }, AbortSignal.timeout(480e3));
    if (!r.ok) { fallas.push(`${model}: Anthropic ${r.status} ${(await r.text()).slice(0, 150)}`); continue; }
    const j = await r.json();
    const informe = (j.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
    if (informe) {
      const pie = `\n\n---\nGenerado por el servidor del bot (bot/intervenciones.js) con ${model}${fallas.length ? ` (antes falló: ${fallas.join(' | ').slice(0, 300)})` : ''}. ${charlas.length} charlas de los últimos ${DIAS} días (${charlas.filter((c) => c.escribio).length} con mensajes de Gustavo). Sin datos personales.\n`;
      return { fecha, charlas: charlas.length, contenido: anonimizar(informe) + pie };
    }
    fallas.push(`${model}: sin texto (stop_reason=${j.stop_reason || '?'})`);
  }
  throw new Error(`La IA no devolvió el informe. ${fallas.join(' | ')}`);
}

let corriendo = false;
/** Corre una vez por VERSION (después del deploy), con reintentos en el ciclo de 15 min. Avisa a Gustavo cuando está. */
async function tick({ store, owner, reglas, fetchImpl = fetch, ahora = Date.now(), avisar = null }) {
  const est = store.meta('intervenciones') || {};
  const e = est.version === VERSION ? est : { version: VERSION, ok: false, intentos: 0 };
  if (e.ok || e.intentos >= MAX_INTENTOS || corriendo) return null;
  corriendo = true;
  e.intentos += 1;
  store.meta('intervenciones', { ...e });
  try {
    const inf = await revisar({ store, owner, reglas, fetchImpl, ahora });
    const sub = await subir({ fecha: `intervenciones-${inf.fecha}`, contenido: inf.contenido, fetchImpl });
    if (!sub.ok) throw new Error(sub.motivo);
    store.meta('intervenciones', { version: VERSION, ok: true, intentos: e.intentos, charlas: inf.charlas, ruta: sub.ruta });
    if (avisar) await avisar(`Listo el análisis "¿Podía el bot?" de ${inf.charlas} charlas en las que interviniste. Claude lo lee y te pasa las conclusiones.`, 'PuertoBox: ¿podía el bot?', 'low').catch(() => {});
    return { ...inf, ...sub };
  } catch (err) {
    store.meta('intervenciones', { ...e, error: String(err.message).slice(0, 300) });
    console.error(`Intervenciones (intento ${e.intentos}/${MAX_INTENTOS}):`, err.message);
    // 16/11: la primera versión falló sin que se supiera por qué (Claude no ve los registros de Railway): cada intento fallido sube el motivo.
    await subir({ fecha: `intervenciones-${horaAR(ahora).fecha}-error`, contenido: `# ¿Podía el bot? — intento ${e.intentos} de ${MAX_INTENTOS} falló\n\nMotivo: ${anonimizar(String(err.message)).slice(0, 600)}\n`, fetchImpl }).catch((x) => console.error('Intervenciones (subir error):', x.message));
    return { error: err.message };
  } finally { corriendo = false; }
}

module.exports = { charlasConGustavo, revisar, tick, INSTRUCCION, VERSION };
