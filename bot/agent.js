'use strict';
/** Agente: conversa con el cliente usando Claude + herramientas del repo. */
const fs = require('fs');
const path = require('path');
const { definiciones, ejecutar } = require('./tools');

const SYSTEM = fs.readFileSync(path.join(__dirname, 'prompt.md'), 'utf8');
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
    body: JSON.stringify({ model: MODELO, max_tokens: 600, system: SYSTEM, tools: definiciones, messages }),
  });
  if (!r.ok) throw new Error(`Anthropic ${r.status}: ${await r.text()}`);
  return r.json();
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

  for (let vuelta = 0; vuelta < 6; vuelta++) {
    const res = await llamarClaude(messages, fetchImpl);
    messages.push({ role: 'assistant', content: res.content });
    if (res.stop_reason !== 'tool_use') {
      const respuesta = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
      if (respuesta) store.agregar(telefono, 'assistant', respuesta);
      return respuesta || null;
    }
    const resultados = res.content.filter((b) => b.type === 'tool_use').map((b) => ({
      type: 'tool_result', tool_use_id: b.id, content: JSON.stringify(ejecutar(b.name, b.input, ctx)),
    }));
    messages.push({ role: 'user', content: resultados });
  }
  return 'Dame un segundo que lo reviso con Gustavo y te escribimos.';
}

module.exports = { responder };
