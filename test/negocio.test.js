'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const negocio = require('../src/negocio');
const paginas = require('../src/paginas');
const { presupuesto } = require('../src/flete_directo');
const RAIZ = path.join(__dirname, '..');

test('base única: los valores derivados salen de los precios', () => {
  const d = negocio.datos();
  assert.strictEqual(d.envio_minimo_usd, presupuesto({ kg: 1, valorFactura: 100 }).flete_puertobox_usd + d.gestion_usd);
  const p20 = presupuesto({ kg: d.kg_desde, valorFactura: 100 });
  assert.strictEqual(d.usd_kg_total_desde, Math.round((p20.flete_puertobox_usd + p20.handling_puertobox_usd) / d.kg_desde));
});

test('render: nunca deja {{...}} y falla si falta un dato', () => {
  assert.throws(() => negocio.render('{{no_existe}}'));
  const prompt = negocio.render(fs.readFileSync(path.join(RAIZ, 'bot', 'prompt.md'), 'utf8'));
  assert.ok(!prompt.includes('{{'));
  const web = paginas.home();
  assert.ok(!web.includes('{{'));
  assert.ok(web.includes(negocio.datos().whatsapp_bot));
});

test('plantillas sin precios ni teléfonos escritos a mano (todo viene de data/)', () => {
  const d = negocio.datos();
  for (const f of ['bot/prompt.md', 'web/sitio/index.html']) {
    const t = fs.readFileSync(path.join(RAIZ, f), 'utf8');
    assert.ok(!t.includes(d.whatsapp_bot), `${f} tiene el WhatsApp escrito a mano`);
    assert.ok(!new RegExp(`USD ${d.gestion_usd} de gestión|Gestión PuertoBox:\\* USD ${d.gestion_usd}`).test(t), `${f} tiene la gestión a mano`);
    assert.ok(!/USD 45 total/.test(t), `${f} tiene la tabla de precios a mano`);
  }
});

test('páginas públicas: buscador, posición, producto, sitemap', () => {
  const q = new URLSearchParams('q=zapatillas');
  const b = paginas.servir('/buscador', q).cuerpo;
  assert.ok(b.includes('/ncm/6404.'));
  const n = paginas.servir('/ncm/6404.19.00', new URLSearchParams()).cuerpo;
  assert.ok(n.includes('Derecho (DIE): 20%'));
  assert.ok(n.includes(`USD ${negocio.datos().envio_minimo_usd}`));
  assert.strictEqual(paginas.servir('/ncm/9999.99.99', new URLSearchParams()), null);
  assert.ok(paginas.servir('/importar/zapatillas', new URLSearchParams()).cuerpo.includes('Importar zapatillas'));
  const sm = paginas.sitemap();
  assert.ok(sm.includes('/ncm/6404.19.00') && sm.includes('/importar/zapatillas'));
  assert.ok(!paginas.buscador('<script>').includes('<script>alert'));
  assert.ok(paginas.buscador('<b>x</b>').includes('&lt;b&gt;'));
});
