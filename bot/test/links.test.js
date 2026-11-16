'use strict';
// Leer el link del producto (16/11, Gustavo: "¿no hay manera de entrar a ver el enlace?").
process.env.NODE_ENV = 'test';
const test = require('node:test');
const assert = require('node:assert');
const { candidatas, leer, tieneDatos, textoDeHtml } = require('../links');

const LINK = 'https://www.alibaba.com/product-detail/12V-Car-Jump-Starter-With-Air_1601952873179.html?spm=a2700.image-text-search&priceId=2583';
const HTML_FR = `<html><head><script>var x=1</script></head><body><h1>12V Car Jump Starter With Air Compressor 6000-12000mAh 300A</h1>
${'<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt.</p>'.repeat(20)}
<div>6 - 499 pieces US$26.33</div><div>500 - 999 pieces US$26</div><div>Selling units: Single item</div><div>Single package size: 24X12X45 cm</div><div>Single gross weight: 2.000 kg</div></body></html>`;
const VACIA = '<html><head><meta name="viewport"></head><body></body></html>';
const JSON_IA = { titulo: '12V Car Jump Starter With Air Compressor', precios: [{ desde: 6, hasta: 499, usd: 26.33 }], pedido_minimo: 6, unidades_de_venta: 'Artículo individual', tamano_paquete_cm: '24x12x45', peso_bruto_kg: 2, paquete_coherente: true };

test('alibaba.com → primero los espejos que sí se leen (.fr, .co.uk), sin parámetros de seguimiento', () => {
  const c = candidatas(LINK);
  assert.strictEqual(c[0], 'https://www.alibaba.fr/product-detail/12V-Car-Jump-Starter-With-Air_1601952873179.html');
  assert.ok(c.includes('https://www.alibaba.fr/product-detail/subject-1601952873179.html'));
  assert.ok(!c.some((u) => u.includes('priceId')));
  assert.strictEqual(candidatas('m.alibaba.com/product/1601952873179/12V-Car.html')[0], 'https://www.alibaba.fr/product-detail/12V-Car_1601952873179.html');
  assert.deepStrictEqual(candidatas('hola'), []);
});

test('la página vacía de alibaba.com no cuenta como leída; la de alibaba.fr sí', () => {
  assert.ok(!tieneDatos(textoDeHtml(VACIA)));
  assert.ok(tieneDatos(textoDeHtml(HTML_FR)));
  assert.doesNotMatch(textoDeHtml(HTML_FR), /var x/);
});

test('lee el link bajando alibaba.fr y la IA ordena los datos (arrancador: 26,33, 24x12x45, 2 kg)', async () => {
  const pedidos = [];
  const fetchImpl = async (url, opt = {}) => {
    pedidos.push(url);
    if (url.includes('anthropic')) {
      assert.match(JSON.parse(opt.body).messages[0].content, /Single package size: 24X12X45/);
      return { ok: true, json: async () => ({ content: [{ type: 'text', text: JSON.stringify(JSON_IA) }] }) };
    }
    return { ok: true, status: 200, text: async () => (url.includes('alibaba.fr') ? HTML_FR : VACIA) };
  };
  const r = await leer(LINK, { fetchImpl });
  assert.strictEqual(r.precios[0].usd, 26.33);
  assert.strictEqual(r.peso_bruto_kg, 2);
  assert.match(r.fuente, /alibaba\.fr/);
  assert.ok(!pedidos.some((u) => u.includes('priceId')));
  const otra = await leer(LINK, { fetchImpl });
  assert.ok(otra.ya_leido); // no la vuelve a bajar
});

test('si el servidor no la puede bajar, la IA la lee con web_fetch', async () => {
  let cuerpo = null; let beta = null;
  const fetchImpl = async (url, opt = {}) => {
    if (url.includes('anthropic')) { cuerpo = JSON.parse(opt.body); beta = opt.headers['anthropic-beta']; return { ok: true, json: async () => ({ content: [{ type: 'text', text: JSON.stringify({ ...JSON_IA, titulo: 'Polea', paquete_coherente: false, nota: '25 kg no es una polea' }) }] }) }; }
    return { ok: false, status: 403, text: async () => '' };
  };
  const r = await leer('https://www.alibaba.com/product-detail/DIY-Sport-Gym-Fitness-Equipment-Wheel_1600958949996.html', { fetchImpl });
  assert.strictEqual(cuerpo.tools[0].type, 'web_fetch_20250910');
  assert.strictEqual(beta, 'web-fetch-2025-09-10');
  assert.strictEqual(r.paquete_coherente, false);
  assert.match(r.instruccion, /paquete_coherente es false/);
});

test('si no se puede leer de ninguna forma, pide las capturas', async () => {
  const fetchImpl = async (url) => (url.includes('anthropic') ? { ok: false, status: 400, text: async () => 'web_fetch not enabled' } : { ok: true, status: 200, text: async () => VACIA });
  const r = await leer('https://www.alibaba.com/product-detail/Otra-Cosa_1600000000001.html', { fetchImpl });
  assert.match(r.error, /Empaque y entrega/);
});

test('el bot tiene la herramienta leer_link y el prompt le dice que la use', () => {
  assert.ok(require('../tools').definiciones.some((d) => d.name === 'leer_link'));
  assert.match(require('../agent').SYSTEM, /usá `leer_link`/);
});

test('control del paquete: frena solo lo imposible (polea de 25 kg), no lo grande pero posible (arrancador 24x12x45)', () => {
  const { INSTRUCCION } = require('../links');
  assert.match(INSTRUCCION, /SOLO si es imposible/);
  assert.match(INSTRUCCION, /24x12x45 cm para un arrancador/);
  assert.match(require('../agent').SYSTEM, /la aerolínea cobra lo real/);
});

test('link corto del Compartir de la app (alibaba.com/x/...): sigue la redirección y lee el producto', async () => {
  const pedidos = [];
  const fetchImpl = async (url, opt = {}) => {
    pedidos.push(url);
    if (url.includes('/x/B2iQFj')) return { ok: false, status: 302, headers: { get: (h) => (h === 'location' ? 'https://spanish.alibaba.com/product-detail/subject-1601952873179.html?ckvia=share_X&from=share' : null) }, text: async () => '' };
    if (url.includes('anthropic')) return { ok: true, json: async () => ({ content: [{ type: 'text', text: JSON.stringify(JSON_IA) }] }) };
    return { ok: true, status: 200, text: async () => (url === 'https://www.alibaba.fr/product-detail/subject-1601952873179.html' ? HTML_FR : VACIA) };
  };
  const r = await leer('https://www.alibaba.com/x/B2iQFj?ck=pdp', { fetchImpl });
  assert.strictEqual(r.precios[0].usd, 26.33);
  assert.ok(pedidos[0].includes('/x/B2iQFj')); // siguió el link corto (el producto ya estaba leído: no lo vuelve a bajar)
  assert.ok(!pedidos.some((u) => u.includes('ckvia')));
  const { candidatas } = require('../links');
  assert.strictEqual(candidatas('https://spanish.alibaba.com/product-detail/subject-1601952873179.html?ckvia=x')[0], 'https://www.alibaba.fr/product-detail/subject-1601952873179.html');
});

test('formato product-introduction de Alibaba también se lee', () => {
  assert.strictEqual(candidatas('https://www.alibaba.com/product-introduction/Non-Slip-Custom-logo-print-Double_60747406011.html')[0], 'https://www.alibaba.fr/product-detail/Non-Slip-Custom-logo-print-Double_60747406011.html');
});

test('prueba de varios links: arma la tabla con leídos y no leídos', async () => {
  const { autoprueba } = require('../links');
  const { crearStore } = require('../store');
  const fetchImpl = async (url) => {
    if (url.includes('anthropic')) return { ok: true, json: async () => ({ content: [{ type: 'text', text: JSON.stringify(JSON_IA) }] }) };
    return { ok: true, status: 200, text: async () => (url.includes('alibaba.fr') && url.includes('1700000000001') ? HTML_FR : VACIA) };
  };
  let subido = null;
  const r = await autoprueba({ store: crearStore(null), fetchImpl, links: ['https://www.alibaba.com/product-detail/A_1700000000001.html', 'https://www.ejemplo.com/nada'], subirFn: async (x) => { subido = x; return { ok: true }; } });
  assert.strictEqual(r.total, 2);
  assert.match(subido.contenido, /Leídos: \d de 2/);
  assert.match(subido.contenido, /\| ✅ \|/);
});

test('publicación dada de baja ("Product Not Available"): lo dice, no pide capturas', async () => {
  const fetchImpl = async (url) => (url.includes('anthropic') ? { ok: false, status: 500, text: async () => '' } : { ok: true, status: 200, text: async () => '<html><head><title>Product Not Available</title></head></html>' });
  const r = await leer('https://www.alibaba.com/product-detail/Viejo_1601148563519.html', { fetchImpl });
  assert.strictEqual(r.de_baja, true);
  assert.match(r.error, /ya no está disponible/);
});

test('precio publicado en Alibaba: avisa que puede no ser el real y que lo confirme el proveedor (Gustavo 16/11)', () => {
  const p = require('../agent').SYSTEM;
  assert.match(p, /El precio publicado en Alibaba muchas veces no es el real/);
  assert.match(p, /precio publicado, a confirmar con el proveedor/);
  assert.match(p, /send me your best unit price/);
});

test('links de la tienda del proveedor (proveedor.en.alibaba.com/product/<número>-...) se leen por el número', () => {
  assert.strictEqual(candidatas('https://holyindustries.en.alibaba.com/product/60769949049-213989284/4PCS_knife_set.html')[0], 'https://www.alibaba.fr/product-detail/subject-60769949049.html');
  assert.strictEqual(candidatas('https://anma.m.en.alibaba.com/product/1601006813235-212796826/x.html')[0], 'https://www.alibaba.fr/product-detail/subject-1601006813235.html');
});

test('precios en formato francés ("42,78 $US") y datos lejos del principio de la página se leen (16/11, v5)', () => {
  const relleno = '<div>menu</div>'.repeat(3000);
  const html = `<h1>Garwin 5-piece knife set</h1>${relleno}<div>42,78 $US</div><div>1 - 499 sets</div><div>Poids brut unique: 1.2 kg</div><div>Taille d'emballage unique: 40X20X8 cm</div>`;
  const t = textoDeHtml(html);
  assert.ok(t.length <= 20000);
  assert.match(t, /Garwin/);
  assert.match(t, /42,78 \$US/);
  assert.match(t, /Poids brut unique: 1\.2 kg/);
  assert.ok(tieneDatos(t));
});

test('el aviso de "precio publicado" va una vez por charla', () => {
  assert.match(require('../agent').SYSTEM, /una vez por charla/);
});

test('si la IA no entiende la página bajada, prueba con web_fetch (16/11, v6)', async () => {
  let llamadasIA = 0;
  const fetchImpl = async (url, opt = {}) => {
    if (url.includes('anthropic')) {
      llamadasIA += 1;
      const b = JSON.parse(opt.body);
      if (!b.tools) return { ok: true, json: async () => ({ content: [{ type: 'text', text: 'No veo un producto en este texto.' }] }) };
      return { ok: true, json: async () => ({ content: [{ type: 'text', text: JSON.stringify({ ...JSON_IA, titulo: 'Garwin 5-piece knife set' }) }] }) };
    }
    return { ok: true, status: 200, text: async () => HTML_FR };
  };
  const r = await leer('https://www.alibaba.co.uk/product-detail/Garwin_1601596679880.html', { fetchImpl });
  assert.strictEqual(llamadasIA, 2);
  assert.strictEqual(r.titulo, 'Garwin 5-piece knife set');
  assert.strictEqual(r.fuente, 'web_fetch');
});

test('pide sin "pensar" y, si el modelo no acepta el parámetro, repite sin él', async () => {
  const cuerpos = [];
  const fetchImpl = async (url, opt = {}) => {
    if (url.includes('anthropic')) {
      const b = JSON.parse(opt.body); cuerpos.push(b);
      if (b.thinking) return { ok: false, status: 400, text: async () => 'thinking: unsupported' };
      return { ok: true, json: async () => ({ content: [{ type: 'text', text: JSON.stringify(JSON_IA) }] }) };
    }
    return { ok: true, status: 200, text: async () => HTML_FR };
  };
  const r = await leer('https://www.alibaba.com/product-detail/Otra_1609999999999.html', { fetchImpl });
  assert.strictEqual(r.precios[0].usd, 26.33);
  assert.deepStrictEqual(cuerpos[0].thinking, { type: 'disabled' });
  assert.strictEqual(cuerpos[1].thinking, undefined);
});
