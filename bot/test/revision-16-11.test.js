'use strict';
// Revisión general del 16/11/2026 (Gustavo: "hacé una revisión general de todo el sistema, bien profunda").
// Cada error encontrado queda como prueba fija.
process.env.NODE_ENV = 'test';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { ejecutar } = require('../tools');
const { crearStore } = require('../store');
const { render, datos } = require('../../src/negocio');

const base = { kg: 10, valor_factura_usd: 300, die: 20, regimen: 'comercial', cantidad_cajas: 1, largo_cm: 40, ancho_cm: 30, alto_cm: 30 };

test('sin unidades el bot no da ningún número (regla de Gustavo del 15/11 17:59, ahora en el código)', () => {
  const r = ejecutar('cotizar', base, { telefono: '1', store: crearStore(null), derivaciones: [] });
  assert.match(r.error, /unidades/);
  assert.strictEqual(r.total_puertobox_usd, undefined);
  const ok = ejecutar('cotizar', { ...base, unidades: 50 }, { telefono: '1', store: crearStore(null), derivaciones: [] });
  assert.ok(ok.total_puertobox_usd > 0);
});

test('el cotizador a mano de Gustavo sigue cotizando sin unidades', () => {
  const { cotizarAMano } = require('../server');
  const r = cotizarAMano(new URLSearchParams('kg=10&valor=300&die=20&cajas=1&largo=40&ancho=30&alto=30'));
  assert.ok(!r.error, r.error);
});

test('el lead guarda lo que de verdad se le cobra (con CUIT de PuertoBox y recargos), no solo flete + gestión base', () => {
  const st = crearStore(null);
  const r = ejecutar('cotizar', { ...base, unidades: 50, con_cuit_puertobox: true, con_bateria_litio: true }, { telefono: '7', store: st, derivaciones: [] });
  assert.strictEqual(st.lead('7').precio_usd, r.total_puertobox_usd);
  assert.ok(r.total_puertobox_usd > r.flete_puertobox_usd + 40);
});

test('/charlas no pierde mensajes: se guardan más de 30 y la IA recibe solo los últimos 30 empezando por el cliente', () => {
  const st = crearStore(null);
  for (let i = 0; i < 40; i++) { st.agregar('9', 'user', `cliente ${i}`); st.agregar('9', 'assistant', `bot ${i}`); }
  const chat = st.chats().find((c) => c.telefono === '9');
  assert.strictEqual(chat.mensajes.length, 80);
  assert.strictEqual(chat.mensajes[0].content, 'cliente 0');
  const h = st.historial('9');
  assert.ok(h.length <= 30);
  assert.strictEqual(h[0].role, 'user');
  assert.strictEqual(h[h.length - 1].content, 'bot 39');
});

test('cliente que vuelve después de 48 h: la IA arranca charla nueva, pero /charlas conserva la anterior', () => {
  const st = crearStore(null);
  const real = Date.now;
  try {
    let ahora = real();
    Date.now = () => ahora;
    st.agregar('8', 'user', 'remeras');
    st.agregar('8', 'assistant', 'presupuesto viejo');
    st.guardarLead('8', { posicion_fija: { posicion: '6109.10.00.000X' } });
    ahora += 49 * 3600e3;
    st.agregar('8', 'user', 'hola de nuevo');
  } finally { Date.now = real; }
  assert.deepStrictEqual(st.historial('8').map((m) => m.content), ['hola de nuevo']);
  assert.strictEqual(st.chats().find((c) => c.telefono === '8').mensajes.length, 3);
  assert.strictEqual(st.lead('8').posicion_fija, undefined);
});

test('chats de los anuncios de WhatsApp directo ("Hola, quiero traer de China: ...") quedan marcados como del anuncio', () => {
  const { esMensajeAnuncio } = require('../server');
  assert.ok(esMensajeAnuncio('Hola, quiero traer de China: 200 remeras'));
  assert.ok(esMensajeAnuncio('Hola, quiero cotizar un envío desde China'));
  assert.ok(!esMensajeAnuncio('Hola, vi la web y quiero cotizar un envío desde China'));
});

test('si el clasificador falla, Gustavo recibe el aviso y el bot no usa un 20% "a ojo"', async () => {
  const { clasificar } = require('../clasificador');
  const derivaciones = [];
  const fetchImpl = async () => ({ ok: false, status: 500, text: async () => 'caída' });
  const r = await clasificar({ producto_completo: 'organizador de escritorio de bambú' }, { telefono: '5', store: crearStore(null), derivaciones, fetchImpl });
  assert.ok(r.error);
  assert.doesNotMatch(r.error, /20%/);
  assert.match(r.error, /buscar_posicion/);
  assert.strictEqual(derivaciones.length, 1);
  assert.strictEqual(derivaciones[0].motivo, 'confirmar_posicion');
});

test('prompt: el kilo con gestión se promete desde kg_desde_total (40 kg), sin números viejos de ejemplo', () => {
  const p = render(fs.readFileSync(path.join(__dirname, '..', 'prompt.md'), 'utf8'));
  const d = datos();
  assert.ok(p.includes(`Hoy es USD ${d.usd_kg_total_desde} el kilo con todo desde ${d.kg_desde_total} kg`));
  assert.doesNotMatch(p, /18,87/);
  assert.doesNotMatch(p, /en vez de 20\)/); // con CUIT de PuertoBox: "en vez de la gestión normal" (es 20 o 40 según el peso)
  assert.doesNotMatch(p, /cotizá igual como envío comercial/);
  assert.match(p, /Aceptan batería de litio\?" → "Sí/);
});

test('dudas comunes y web: solo courier (sin marítimo) y depósito en Shenzhen, no Shanghai', () => {
  const d = datos();
  assert.doesNotMatch(d.faq_texto, /mar[ií]tim[ao] .*arma la cotizaci/i);
  assert.doesNotMatch(d.faq_texto, /contenedor/i);
  const web = require('../../src/paginas').servir('/', new URLSearchParams()).cuerpo;
  assert.doesNotMatch(web, /Shanghai/);
  assert.doesNotMatch(web, /Para uso propio va por pequeños envíos/);
});

test('revisión nocturna (repo público): saca el nombre que sigue a un saludo', () => {
  const { anonimizar } = require('../aprendizaje');
  assert.strictEqual(anonimizar('Hola Agustín, ¿cómo estás?'), 'Hola [nombre], ¿cómo estás?');
  assert.strictEqual(anonimizar('Hola, ¿cómo estás?'), 'Hola, ¿cómo estás?');
  assert.strictEqual(anonimizar('Gracias por escribir'), 'Gracias por escribir');
});

test('piezas de publicidad: el "desde X kg" sale de kg_desde_total, no del tramo', () => {
  const py = fs.readFileSync(path.join(__dirname, '..', '..', 'docs', 'marketing', 'piezas', 'precio_render.py'), 'utf8');
  assert.match(py, /desde:d\.kg_desde_total/);
});

test('anonimizar deja las fechas del informe (16/11: el título salía "[número]")', () => {
  const { anonimizar } = require('../aprendizaje');
  assert.strictEqual(anonimizar('# ¿Podía el bot? — 2026-11-16'), '# ¿Podía el bot? — 2026-11-16');
  assert.strictEqual(anonimizar('llamame al 221 555-1234'), 'llamame al [número]');
});
