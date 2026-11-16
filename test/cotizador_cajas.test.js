'use strict';
// Cotizador del nomenclador con cajas de distintos tamaños (16/11, Gustavo).
const test = require('node:test');
const assert = require('node:assert');
test('el cotizador a mano suma cada tamaño de caja', async () => {
  process.env.ADMIN_KEY = 'clave-cajas';
  delete require.cache[require.resolve('../bot/server')];
  const s = require('../bot/server').servidor().listen(0); await new Promise((r) => s.once('listening', r));
  const u = `http://127.0.0.1:${s.address().port}/nomenclador/api/cotizar?key=clave-cajas&valor=83&kg=3.9&die=16&regimen=comercial&cajas=1&largo=26&ancho=20&alto=11.5&bultos=`;
  try {
    const r = await (await fetch(u + encodeURIComponent('1x26x20x11.5;1x22x14.5x11;1x34x34x20'))).json();
    assert.strictEqual(r.kg_presupuestado, 7);
    assert.strictEqual(r.peso_volumetrico_kg, 6.52);
    assert.strictEqual(r.total_puertobox_usd, 195);
    const una = await (await fetch(u)).json();
    assert.strictEqual(una.kg_presupuestado, 4); // sin los otros tamaños: solo la primera caja (1,2 kg vol) vs 3,9 real
  } finally { s.close(); }
});
