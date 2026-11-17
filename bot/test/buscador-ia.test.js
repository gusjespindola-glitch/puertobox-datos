'use strict';
// 17/11/2026 (Gustavo): en el nomenclador pega lo que pidió el cliente y la IA devuelve la posición exacta de ARCA.
const test = require('node:test');
const assert = require('node:assert');

const respuesta = (content, stop = 'end_turn') => ({ ok: true, json: async () => ({ stop_reason: stop, content }) });

test('buscador con IA: lee notas, devuelve posición exacta de ARCA con DIE de ARCA, marcha y alternativas', async () => {
  process.env.ADMIN_KEY = 'clave-prueba';
  const { servidor, servirNomenclador } = require('../server');
  const pedidos = [];
  servirNomenclador.fetchImpl = async (url, opt) => {
    const body = JSON.parse(opt.body); pedidos.push(body);
    if (pedidos.length === 1) return respuesta([{ type: 'tool_use', id: 'n', name: 'ver_notas', input: { capitulo: '85' } }], 'tool_use');
    if (pedidos.length === 2) return respuesta([{ type: 'tool_use', id: 'c', name: 'buscar_codigo', input: { codigo: '8507.60' } }], 'tool_use');
    return respuesta([{ type: 'text', text: '{"posicion":"8507.60.00.990V","die":35,"nombre_tecnico":"Batería de litio","por_que":"Acumulador de iones de litio","marcha":"XVI → 85 → 85.07 → 8507.60","rgi_aplicadas":"RGI 1 y 6","notas_revisadas":"Sección XVI y Cap. 85","confianza":"alta","alternativas":[{"posicion":"8506.50","por_que":"si fuera pila no recargable"}],"fuentes":["https://ejemplo.com"]}' }]);
  };
  const srv = servidor().listen(0);
  const port = srv.address().port;
  try {
    const r = await fetch(`http://localhost:${port}/nomenclador/api/clasificar`, { method: 'POST', headers: { cookie: 'pbk=clave-prueba', 'content-type': 'application/json' }, body: JSON.stringify({ texto: 'power bank 10000 mAh de litio para celular' }) }).then((x) => x.json());
    assert.strictEqual(r.posicion, '8507.60.00.990V');
    assert.strictEqual(r.die, 18); // el derecho sale de ARCA, no de la IA
    assert.strictEqual(r.marcha, 'XVI → 85 → 85.07 → 8507.60');
    assert.strictEqual(r.confianza, 'alta');
    assert.ok(pedidos[0].tools.some((t) => t.name === 'ver_notas'));
    assert.match(pedidos[0].messages[0].content, /power bank/);
    // El mismo pedido no se vuelve a pagar.
    const r2 = await fetch(`http://localhost:${port}/nomenclador/api/clasificar`, { method: 'POST', headers: { cookie: 'pbk=clave-prueba', 'content-type': 'application/json' }, body: JSON.stringify({ texto: 'power bank 10000 mAh de litio para celular' }) }).then((x) => x.json());
    assert.strictEqual(r2.de_cache, true);
    assert.strictEqual(pedidos.length, 3);
    // Sin la clave no entra.
    const sin = await fetch(`http://localhost:${port}/nomenclador/api/clasificar`, { method: 'POST', body: '{"texto":"x"}' });
    assert.strictEqual(sin.status, 401);
  } finally { srv.close(); delete servirNomenclador.fetchImpl; }
});

test('buscador con IA estilo NotebookLM: consulta la bibliografía, cita la fuente y la posición/DIE salen de ARCA (paragolpes, 17/11)', async () => {
  process.env.ADMIN_KEY = 'clave-prueba';
  const B = require('../bibliografia');
  B._usar([
    { f: 'Vademécum – Módulo 4', p: 802, t: '87.08 Partes y accesorios de vehículos automóviles de las partidas 87.01 a 87.05. 8708.10.00 - Parachoques (paragolpes, defensas) y sus partes 18 5,50' },
    { f: 'Vademécum – Módulo 4', p: 14, t: 'REGLA Nro.3 Cuando una mercancía pudiera clasificarse en dos o más partidas, la partida más específica tendrá prioridad.' },
    { f: 'Apuntes de Gustavo – Resumen del curso', p: null, t: 'Mercadería a granel y perecederos van DAP.' },
  ]);
  const { servidor, servirNomenclador } = require('../server');
  const pedidos = [];
  servirNomenclador.fetchImpl = async (url, opt) => {
    const body = JSON.parse(opt.body); pedidos.push(body);
    if (pedidos.length === 1) return respuesta([{ type: 'tool_use', id: 'b', name: 'consultar_bibliografia', input: { consulta: 'paragolpes parachoques partes vehículos' } }], 'tool_use');
    if (pedidos.length === 2) return respuesta([{ type: 'tool_use', id: 'n', name: 'ver_notas', input: { capitulo: '87' } }, { type: 'tool_use', id: 'c', name: 'buscar_codigo', input: { codigo: '8708.10' } }], 'tool_use');
    return respuesta([{ type: 'text', text: '{"posicion":"8708.10.00.000C","die":5.5,"nombre_tecnico":"Paragolpes","por_que":"Parte de vehículo automóvil","informe":"Es una parte de carrocería [Vademécum – Módulo 4, pág. 802].","marcha":"XVII → 87 → 87.08 → 8708.10","rgi_aplicadas":"RGI 1 y 6","notas_revisadas":"Sección XVII y Cap. 87","confianza":"alta","alternativas":[]}' }]);
  };
  const srv = servidor().listen(0);
  try {
    const r = await fetch(`http://localhost:${srv.address().port}/nomenclador/api/clasificar`, { method: 'POST', headers: { cookie: 'pbk=clave-prueba', 'content-type': 'application/json' }, body: JSON.stringify({ texto: 'paragolpe delantero de auto' }) }).then((x) => x.json());
    assert.ok(pedidos[0].tools.some((t) => t.name === 'consultar_bibliografia'));
    const resultado = JSON.parse(pedidos[1].messages[pedidos[1].messages.length - 1].content[0].content);
    assert.ok(resultado.fragmentos.some((f) => f.fuente === 'Vademécum – Módulo 4, pág. 802' && /Parachoques/.test(f.texto)));
    assert.strictEqual(r.posicion, '8708.10.00.000C');
    assert.strictEqual(r.die, 18); // el 5,50 de la tabla del libro no es el DIE: manda ARCA
    assert.match(r.informe, /\[Vademécum – Módulo 4, pág\. 802\]/);
  } finally { srv.close(); delete servirNomenclador.fetchImpl; B._usar(null); }
});

test('bibliografía: búsqueda por palabras con raíz (paragolpe ≈ paragolpes) y fuente con página', () => {
  const B = require('../bibliografia');
  const idx = B.construir([{ f: 'A', p: 3, t: 'juguetes de plástico para niños' }, { f: 'B', p: null, t: 'parachoques (paragolpes) y sus partes' }]);
  const r = B.buscar(idx, 'paragolpe');
  assert.strictEqual(r.length, 1);
  assert.strictEqual(r[0].fuente, 'B');
  assert.strictEqual(B.buscar(idx, 'juguete')[0].fuente, 'A, pág. 3');
});

test('consultar_bibliografia también busca en el Tarifar (criterios de ARCA, intervenciones, novedades), que se actualiza solo', async () => {
  const B = require('../bibliografia');
  B._usar([{ f: 'Vademécum – Módulo 4', p: 1, t: 'texto sin relación' }]);
  try {
    const r = await B.consultar('libro con rompecabezas de cartón');
    assert.match(r.fragmentos[0].fuente, /^Tarifar – Criterio de clasificación ARCA/);
    assert.match(r.fragmentos[0].texto, /4901\.99\.00/);
    const u = await B.consultar('ropa usada');
    assert.ok(u.fragmentos.some((f) => /Res\. 461\/2026/.test(f.fuente + f.texto)));
  } finally { B._usar(null); }
});
