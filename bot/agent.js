'use strict';
/** Agente: conversa con el cliente usando Claude + herramientas del repo. */
const fs = require('fs');
const path = require('path');
const { definiciones, ejecutar } = require('./tools');

// El prompt lee precios y datos de la base única (data/): cambiás ahí y el bot se entera solo.
const SYSTEM = require('../src/negocio').render(fs.readFileSync(path.join(__dirname, 'prompt.md'), 'utf8'));
const MODELO = process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5';

async function llamarClaude(messages, fetchImpl, intentos = 3) {
  for (let i = 1; ; i++) {
    try { return await llamarUnaVez(messages, fetchImpl); } catch (e) {
      if (i >= intentos || /\b(400|401|403)\b/.test(e.message)) throw e;
      await new Promise((r) => setTimeout(r, (process.env.NODE_ENV === 'test' ? 1 : 1500) * i));
    }
  }
}

async function llamarUnaVez(messages, fetchImpl) {
  const r = await fetchImpl('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    // cache_control: las instrucciones y herramientas (iguales en cada llamada) se cachean 5 min → cada mensaje del mismo chat sale más barato.
    body: JSON.stringify({ model: MODELO, max_tokens: 1024, system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }], tools: definiciones, messages }),
  });
  if (!r.ok) throw new Error(`Anthropic ${r.status}: ${await r.text()}`);
  return r.json();
}

// Saca las muletillas del arranque ("Perfecto, ...", "¡Genial! ...") que el modelo a veces agrega igual.
const MULETILLA = /^\s*(¡?\s*(genial|perfecto|buen[íi]simo|excelente|anotado|joya|dale|b[áa]rbaro|tranqui|listo|entendido|ok|okey|gracias)[!.,]*\s*)+/i;
function limpiar(t) {
  if (!t) return t;
  const s = t.replace(MULETILLA, '');
  if (!s.trim()) return t;
  return s.replace(/^([¿¡"'(\s]*)(\p{L})/u, (_, p, l) => p + l.toUpperCase());
}

/** Procesa un mensaje del cliente y devuelve el texto de respuesta (o null si no corresponde responder). */
async function responder({ telefono, texto, store, fetchImpl = fetch, derivaciones = [] }) {
  store.agregar(telefono, 'user', texto);
  // La API exige alternar user/assistant: se unen los mensajes seguidos del mismo rol.
  const messages = [];
  for (const m of store.historial(telefono)) {
    const last = messages[messages.length - 1];
    if (last && last.role === m.role) last.content += `\n${m.content}`;
    else messages.push({ role: m.role, content: m.content });
  }
  const ctx = { telefono, store, derivaciones };

  let pedidoTexto = false;
  for (let vuelta = 0; vuelta < 7; vuelta++) {
    const res = await llamarClaude(messages, fetchImpl);
    const contenido = (res.content || []).filter((b) => b.type === 'text' ? b.text && b.text.trim() : true);
    const usos = contenido.filter((b) => b.type === 'tool_use');
    if (usos.length) {
      // Toda herramienta pedida se ejecuta y se responde en el mensaje siguiente, pase lo que pase con stop_reason.
      messages.push({ role: 'assistant', content: contenido });
      const resultados = usos.map((b) => {
        let out;
        try { out = ejecutar(b.name, b.input || {}, ctx); } catch (e) { out = { error: e.message }; }
        return { type: 'tool_result', tool_use_id: b.id, content: JSON.stringify(out) };
      });
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

module.exports = { responder, limpiar };
