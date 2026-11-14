'use strict';
// Audios de WhatsApp: se pasan a texto con Groq (Whisper). Sin clave o con error, el bot pide que lo escriba.
const test = require('node:test');
const assert = require('node:assert');
const { transcribirAudio, normalizar } = require('../bot/server');

const audio = { link: 'https://api.ycloud.com/v2/whatsapp/media/download/123?sig=x', mime_type: 'audio/ogg; codecs=opus' };

function fetchFalso(respuestaGroq = { ok: true, json: async () => ({ text: ' Hola, quiero traer remeras, 300 dólares, 5 kilos ' }) }) {
  const llamadas = [];
  const f = async (url, opt = {}) => {
    llamadas.push({ url, opt });
    if (url.includes('ycloud')) return { ok: true, arrayBuffer: async () => new ArrayBuffer(2048) };
    return respuestaGroq;
  };
  f.llamadas = llamadas;
  return f;
}

test('audio: baja el archivo de YCloud con la clave y lo transcribe en español', async () => {
  process.env.GROQ_API_KEY = 'gsk_prueba'; process.env.YCLOUD_API_KEY = 'yc_prueba';
  const f = fetchFalso();
  assert.strictEqual(await transcribirAudio(audio, f), 'Hola, quiero traer remeras, 300 dólares, 5 kilos');
  assert.strictEqual(f.llamadas[0].opt.headers['X-API-Key'], 'yc_prueba');
  assert.match(f.llamadas[1].url, /api\.groq\.com\/openai\/v1\/audio\/transcriptions/);
  assert.strictEqual(f.llamadas[1].opt.body.get('model'), 'whisper-large-v3-turbo');
  assert.strictEqual(f.llamadas[1].opt.body.get('language'), 'es');
});

test('audio: sin clave o con error devuelve null (el bot pide que lo escriba)', async () => {
  delete process.env.GROQ_API_KEY;
  assert.strictEqual(await transcribirAudio(audio, fetchFalso()), null);
  process.env.GROQ_API_KEY = 'gsk_prueba';
  assert.strictEqual(await transcribirAudio(audio, fetchFalso({ ok: false, status: 429, text: async () => 'limite' })), null);
  assert.strictEqual(await transcribirAudio(audio, async () => { throw new Error('sin red'); }), null);
  assert.strictEqual(await transcribirAudio({}, fetchFalso()), null);
});

test('audio: el webhook de YCloud trae el link del audio', () => {
  const [e] = normalizar({ type: 'whatsapp.inbound_message.received', whatsappInboundMessage: { id: 'a1', from: '+5491111111111', type: 'audio', audio } });
  assert.strictEqual(e.audio.link, audio.link);
});
