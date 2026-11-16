'use strict';
// ¿Podía el bot? (16/11, Gustavo: "revisá los chats en los que intervine yo y mirá si lo podías haber hecho vos")
// y botón "Que lo siga el bot" en /charlas.
process.env.NODE_ENV = 'test';
const test = require('node:test');
const assert = require('node:assert');
const { crearStore } = require('../store');
const { charlasConGustavo, tick } = require('../intervenciones');
const { paginaCharlas } = require('../recordatorios');

function armar() {
  const st = crearStore(null);
  st.agregar('5491100000001', 'user', 'Hola, soy Martín, quiero traer 100 remeras');
  st.agregar('5491100000001', 'assistant', 'Hola Martín, ¿cuánto le pagás al proveedor?');
  st.agregar('5491100000001', 'assistant', '[Gustavo] Te paso mi número 221 555-1234, escribime');
  st.guardarLead('5491100000001', { nombre: 'Martín' });
  st.agregar('5491100000002', 'user', 'quiero pagar');
  st.marcar('5491100000002', { derivadoEn: Date.now(), derivadoMotivo: 'listo_para_cerrar', derivadoResumen: 'Remeras, cliente Martín' });
  st.agregar('5491100000003', 'user', 'hola'); st.agregar('5491100000003', 'assistant', 'Hola, ¿qué querés traer?'); // el bot solo: no entra
  return st;
}

test('elige solo las charlas en las que escribió Gustavo o que el bot le pasó, sin datos personales', () => {
  const ch = charlasConGustavo(armar(), '5492216982199');
  assert.strictEqual(ch.length, 2);
  const todo = ch.map((c) => c.texto + c.meta).join('\n');
  assert.match(todo, /GUSTAVO: /);
  assert.doesNotMatch(todo, /Martín|555|5491100000/);
  assert.ok(ch.some((c) => /motivo: listo_para_cerrar/.test(c.meta)));
});

test('arma el informe con la IA, lo sube a la rama del aprendizaje y no lo repite', async () => {
  const st = armar();
  const llamadas = [];
  const fetchImpl = async (url, opt = {}) => {
    llamadas.push({ url, metodo: opt.method || 'GET', body: opt.body });
    if (url.includes('anthropic')) return { ok: true, json: async () => ({ content: [{ type: 'text', text: '# ¿Podía el bot? — hoy\nCharla 1: sí podía.' }] }) };
    if (url.includes('/git/ref/heads/')) return { ok: true, status: 200, text: async () => JSON.stringify({ object: { sha: 'x' } }) };
    if ((opt.method || 'GET') === 'GET') return { ok: false, status: 404, text: async () => '{}' };
    return { ok: true, status: 201, text: async () => '{}' };
  };
  process.env.GITHUB_TOKEN = 'prueba';
  try {
    const r = await tick({ store: st, owner: '5492216982199', reglas: 'reglas', fetchImpl });
    assert.ok(r && r.ok, JSON.stringify(r));
    assert.match(r.ruta, /docs\/aprendizaje\/intervenciones-\d{4}-\d{2}-\d{2}\.md/);
    const ia = JSON.parse(llamadas.find((l) => l.url.includes('anthropic')).body);
    assert.doesNotMatch(ia.messages[0].content, /Martín|5491100000/);
    const otra = await tick({ store: st, owner: '5492216982199', reglas: 'reglas', fetchImpl });
    assert.strictEqual(otra, null);
  } finally { delete process.env.GITHUB_TOKEN; }
});

test('/charlas: con el bot callado aparece "Que lo siga el bot"; con el bot atendiendo, no', () => {
  const st = crearStore(null);
  st.agregar('5491100000010', 'user', 'hola');
  st.agregar('5491100000010', 'assistant', '[Gustavo] Hola, te atiendo yo');
  st.pausar('5491100000010', 'gustavo_respondio');
  st.agregar('5491100000011', 'user', 'hola');
  st.agregar('5491100000011', 'assistant', 'Hola, ¿qué querés traer?');
  const html = paginaCharlas(st, '5492216982199', Date.now(), 3, null, null, '', null, null, null, null, (tel) => `/seguir-bot?tel=${tel}&a=charlas`);
  const tarjeta = (tel) => html.split(`id="c-${tel}"`)[1].split('</li>')[0];
  assert.match(tarjeta('5491100000010'), /Que lo siga el bot/);
  assert.match(tarjeta('5491100000010'), /Lo atendés vos/);
  assert.doesNotMatch(tarjeta('5491100000011'), /Que lo siga el bot/);
});

test('el prompt le explica al bot cómo seguir después de Gustavo', () => {
  assert.match(require('../agent').SYSTEM, /empiezan con "\[Gustavo\]"/);
});
