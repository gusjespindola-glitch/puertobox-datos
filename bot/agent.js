'use strict';
/** Agente: conversa con el cliente usando Claude + herramientas del repo. */
const fs = require('fs');
const path = require('path');
const { definiciones, ejecutar } = require('./tools');

// El prompt lee precios y datos de la base única (data/): cambiás ahí y el bot se entera solo.
const SYSTEM = require('../src/negocio').render(fs.readFileSync(path.join(__dirname, 'prompt.md'), 'utf8'));
const MODELO = process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5';

async function llamarClaude(messages, fetchImpl, intentos = 3, sinHerramientas = false) {
  for (let i = 1; ; i++) {
    try { return await llamarUnaVez(messages, fetchImpl, sinHerramientas); } catch (e) {
      if (i >= intentos || /\b(400|401|403)\b/.test(e.message)) throw e;
      await new Promise((r) => setTimeout(r, (process.env.NODE_ENV === 'test' ? 1 : 1500) * i));
    }
  }
}

async function llamarUnaVez(messages, fetchImpl, sinHerramientas = false) {
  const r = await fetchImpl('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    // cache_control: las instrucciones y herramientas (iguales en cada llamada) se cachean 5 min → cada mensaje del mismo chat sale más barato.
    body: JSON.stringify({ model: MODELO, max_tokens: 1024, system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }], tools: definiciones, ...(sinHerramientas ? { tool_choice: { type: 'none' } } : {}), messages }),
  });
  if (!r.ok) throw new Error(`Anthropic ${r.status}: ${await r.text()}`);
  return r.json();
}

// Saca las muletillas del arranque ("Perfecto, ...", "¡Genial! ...") que el modelo a veces agrega igual.
// 15/11: antes se borraba solo la palabra "Gracias" de "Gracias por el dato." y al cliente le llegaba "Por el dato." (frase mocha).
// Ahora: la muletilla se saca solo si viene seguida de puntuación, y la frase de agradecimiento se saca entera.
const MULETILLA = /^\s*(¡?\s*(genial|perfecto|buen[íi]simo|excelente|anotado|joya|dale|b[áa]rbaro|tranqui|listo|entendido|comprendido|correcto|ok|okey|claro|de acuerdo)\s*[!.,]+\s*)+/i;
const AGRADECIMIENTO = /^\s*¡?\s*(muchas\s+)?gracias(\s+por\s+[^.!?\n]{0,40})?\s*[.!]+\s*/i;
const RESTO_CORTADO = /^\s*por (el|la|los|las|tu|tus|escribirnos|escribir)\b[^.!?\n,]{0,30}[.!]\s*/i;
function limpiar(t) {
  if (!t) return t;
  let s = t;
  for (let i = 0; i < 3; i++) s = s.replace(MULETILLA, '').replace(AGRADECIMIENTO, '').replace(RESTO_CORTADO, '');
  if (!s.trim()) return t;
  return s.replace(/^([¿¡"'(\s]*)(\p{L})/u, (_, p, l) => p + l.toUpperCase())
    .replace(/([?!])\.(?=\s|$)/g, '$1'); // "¿...logo?." → "¿...logo?"
}

/** Procesa un mensaje del cliente y devuelve el texto de respuesta (o null si no corresponde responder). */
async function responder({ telefono, texto, store, fetchImpl = fetch, derivaciones = [], guardado = false }) {
  if (!guardado) store.agregar(telefono, 'user', texto); // guardado: el servidor ya lo guardó al llegar (15/11)
  // La API exige alternar user/assistant: se unen los mensajes seguidos del mismo rol.
  const messages = [];
  // Si le escribimos nosotros primero (difusión a clientes del 698), la IA tiene que saber qué le dijimos.
  const datosChat = store.chats ? store.chats().find((c) => c.telefono === telefono) : null;
  if (datosChat && datosChat.difusionEn && store.historial(telefono).length === 1) {
    messages.push({ role: 'user', content: `[Contexto, no lo escribió el cliente: hace poco le mandamos este mensaje desde PuertoBox: "${require('./difusion').PLANTILLA.text}". Lo que sigue es su respuesta.]` });
  }
  for (const m of store.historial(telefono)) {
    const last = messages[messages.length - 1];
    if (last && last.role === m.role) last.content += `\n${m.content}`;
    else messages.push({ role: m.role, content: m.content });
  }
  const ctx = { telefono, store, derivaciones, fetchImpl };

  let pedidoTexto = false;
  for (let vuelta = 0; vuelta < 7; vuelta++) {
    const res = await llamarClaude(messages, fetchImpl);
    const contenido = (res.content || []).filter((b) => b.type === 'text' ? b.text && b.text.trim() : true);
    const usos = contenido.filter((b) => b.type === 'tool_use');
    if (usos.length) {
      // Toda herramienta pedida se ejecuta y se responde en el mensaje siguiente, pase lo que pase con stop_reason.
      messages.push({ role: 'assistant', content: contenido });
      const resultados = [];
      for (const b of usos) {
        let out;
        try { out = await ejecutar(b.name, b.input || {}, ctx); } catch (e) { out = { error: e.message }; }
        resultados.push({ type: 'tool_result', tool_use_id: b.id, content: JSON.stringify(out) });
      }
      messages.push({ role: 'user', content: resultados });
      continue;
    }
    const respuesta = limpiar(contenido.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim());
    if (respuesta) { store.agregar(telefono, 'assistant', respuesta); return respuesta; }
    // Nunca dejar al cliente sin respuesta: si la IA terminó sin texto, se le pide que conteste.
    if (!pedidoTexto) {
      pedidoTexto = true;
      if (contenido.length) messages.push({ role: 'assistant', content: contenido });
      const ultimo = messages[messages.length - 1];
      const aviso = { type: 'text', text: '[Sistema: respondele al cliente ahora con un mensaje de texto corto. Nunca lo dejes sin respuesta.]' };
      if (ultimo.role === 'user') ultimo.content = Array.isArray(ultimo.content) ? [...ultimo.content, aviso] : [{ type: 'text', text: ultimo.content }, aviso];
      else messages.push({ role: 'user', content: [aviso] });
      continue;
    }
    const resp = derivaciones.length ? 'Ya le pasé tu consulta a nuestro despachante de aduana. Te va a escribir a la brevedad.' : 'Disculpá, no llegué a entender tu mensaje. ¿Me lo podés repetir?';
    store.agregar(telefono, 'assistant', resp);
    return resp;
  }
  return 'Dame un segundo que lo reviso con nuestro despachante y te escribimos.';
}

/**
 * Empujón (seguimiento automático, pedido de Gustavo del 14/11): el cliente dejó de contestar y se le escribe
 * UN mensaje corto, dentro de las 24 h de WhatsApp, para retomar. La IA lo escribe con el contexto de la charla.
 */
const INSTRUCCION_EMPUJON = (horas, cotizado) => `[Sistema, no lo escribió el cliente: el cliente no contesta hace unas ${horas} horas. Escribile UN solo mensaje corto (1 o 2 líneas) para retomar la charla, como lo haría un vendedor de verdad: natural, sin presionar y sin frases de plantilla ("te escribimos de PuertoBox para retomar tu consulta", "gratis y sin compromiso", "quedamos a disposición"). Si el cliente ya dijo que no le interesa, no escribas nada (respondé vacío). ${cotizado
  ? 'Ya tiene presupuesto: no lo repitas entero. Ayudalo a decidir: recordale en una línea lo que le conviene (precio cerrado, te decimos los impuestos antes de comprar, llega a su casa; si es para revender y sabés las unidades, el costo por unidad) y preguntale si le quedó alguna duda o si quiere avanzar.'
  : 'Todavía no tiene presupuesto: retomá la última pregunta que le hiciste, simple y con otras palabras (por ejemplo: "¿Pudiste ver qué querés traer? Con eso te paso el número.").'} No digas que es un mensaje automático ni que pasaron horas. No uses herramientas.]`;

async function empujon({ telefono, store, horas, cotizado, fetchImpl = fetch }) {
  const messages = [];
  for (const m of store.historial(telefono)) {
    const last = messages[messages.length - 1];
    if (last && last.role === m.role) last.content += `\n${m.content}`;
    else messages.push({ role: m.role, content: m.content });
  }
  if (!messages.length || messages[messages.length - 1].role !== 'assistant') return null;
  messages.push({ role: 'user', content: INSTRUCCION_EMPUJON(horas, cotizado) });
  const res = await llamarClaude(messages, fetchImpl, 3, true);
  const txt = limpiar((res.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim());
  if (!txt) return null;
  store.agregar(telefono, 'assistant', txt);
  return txt;
}

module.exports = { responder, limpiar, empujon };
