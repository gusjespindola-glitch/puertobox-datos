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
