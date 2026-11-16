'use strict';
/**
 * Leer el link de un producto (16/11/2026, Gustavo: "¿no hay manera de entrar a ver el enlace? ¿Ninguna manera?").
 *
 * alibaba.com no deja leer sus páginas desde un servidor (llega una página vacía), pero la MISMA publicación en
 * alibaba.fr o alibaba.co.uk sí trae todo: título, escalones de precio, pedido mínimo y "Empaque y entrega"
 * (unidades de venta, tamaño del paquete, peso bruto). Probado el 16/11 con el arrancador (USD 26,33 desde 6,
 * 24×12×45 cm, 2,0 kg: igual que la captura de Gustavo).
 *
 * Orden: 1) el servidor baja la página (alibaba.fr, .co.uk, .com); 2) si no trae datos, la IA la lee con su
 * herramienta web_fetch. La IA solo ordena lo que dice la página (no inventa) y controla que el paquete tenga sentido
 * para una unidad (la publicación de las poleas decía 25 kg por polea).
 */
const MODELO = process.env.MODELO_LINKS || process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const cache = new Map();

/** URLs a probar para un link. Alibaba: primero los espejos que sí se leen. Sin parámetros de seguimiento. */
function candidatas(url) {
  const u = String(url || '').trim();
  const m = u.match(/alibaba\.[a-z.]+\/product-(?:detail|introduction)\/([^?#\s]+?\.html)/i) || u.match(/m\.alibaba\.com\/product\/(\d+)\/([^?#\s]+?\.html)/i);
  if (m) {
    const ruta = m[2] ? `${m[2].replace(/\.html$/, '')}_${m[1]}.html` : m[1];
    const id = (ruta.match(/[_-](\d{8,})\.html$/) || [])[1];
    // 16/11: el "Compartir" de la app lleva a spanish.alibaba.com/product-detail/subject-<número>.html, que llega vacía;
    // alibaba.fr con "subject-<número>" sí trae la publicación.
    const rutas = [...new Set([ruta, ...(id ? [`subject-${id}.html`] : [])])];
    return [...new Set([...rutas.flatMap((r) => ['fr', 'co.uk'].map((d) => `https://www.alibaba.${d}/product-detail/${r}`)), `https://www.alibaba.com/product-detail/${ruta}`])];
  }
  return /^https?:\/\//i.test(u) ? [u.split('#')[0]] : [];
}
const idDe = (url) => (String(url).match(/[_-](\d{8,})\.html/) || String(url).match(/\/(\d{8,})\//) || [])[1] || String(url).split('?')[0];
/** Links cortos del "Compartir" de la app (alibaba.com/x/B2iQFj): se sigue la redirección para saber qué producto es. */
const esCorto = (u) => /alibaba\.[a-z.]+\/x\//i.test(u) || /^https?:\/\/(s\.)?(click|a)\.aliexpress\.com\//i.test(u);
async function resolver(url, fetchImpl) {
  let u = String(url || '').trim();
  for (let i = 0; i < 4 && esCorto(u); i++) {
    const r = await fetchImpl(u, { redirect: 'manual', headers: { 'user-agent': UA }, signal: AbortSignal.timeout(15000) });
    const loc = r.headers && (typeof r.headers.get === 'function' ? r.headers.get('location') : r.headers.location);
    if (!loc) break;
    u = new URL(loc, u).toString();
  }
  return u;
}

/** Texto visible de una página (sin scripts ni estilos), recortado. */
function textoDeHtml(html, max = 20000) {
  return String(html || '').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|li|tr|h\d)>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim().slice(0, max);
}
/** ¿La página trae datos de producto (precio y algo del empaque o del producto)? */
const tieneDatos = (t) => t.length > 1500 && /(US\s?\$|\$\s?\d|€)/.test(t) && /(kg|gross weight|package|peso|piece|pieces|unit)/i.test(t);

const INSTRUCCION = `Te paso el texto de la publicación de un producto (Alibaba, 1688, etc.). Devolvé SOLO un JSON, sin texto alrededor, con lo que DICE la página (no inventes nada; si un dato no está, null):
{"titulo":"...","precios":[{"desde":6,"hasta":499,"usd":26.33}],"pedido_minimo":6,"unidades_de_venta":"Artículo individual","tamano_paquete_cm":"24x12x45","peso_bruto_kg":2.0,"bateria":"si/no/no dice","material":"...","paquete_coherente":true,"nota":"..."}
"paquete_coherente": false SOLO si es imposible para UNA unidad de venta (5 veces o más de lo razonable; por ejemplo, 25 kg o 30x30x30 cm para una polea chica). Si solo parece grande o generoso (por ejemplo, 24x12x45 cm para un arrancador con accesorios), es true, y en "nota" decí en una línea que puede estar exagerado y conviene confirmarlo con el proveedor. (16/11: Gustavo cotizó el arrancador con 24x12x45 cm.)`;

async function llamarIA(body, fetchImpl, beta) {
  const r = await fetchImpl('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', ...(beta ? { 'anthropic-beta': beta } : {}) },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Anthropic ${r.status}: ${(await r.text()).slice(0, 150)}`);
  return r.json();
}
const jsonDe = (j) => {
  const t = (j.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');
  const m = t.match(/\{[\s\S]*\}/);
  try { return m ? JSON.parse(m[0]) : null; } catch { return null; }
};

/** Lee un link y devuelve los datos de la publicación, o { error }. ctx: { fetchImpl, store }. */
async function leer(url, ctx = {}) {
  const fetchImpl = ctx.fetchImpl || fetch;
  let real = url;
  try { real = await resolver(url, fetchImpl); } catch (e) { /* si no se puede seguir, se prueba con el link tal cual */ }
  const urls = candidatas(real);
  if (!urls.length) return { error: 'No es un link. Pedile al cliente el link de la publicación o una captura.' };
  const id = idDe(urls[0]);
  if (cache.has(id)) return { ...cache.get(id), ya_leido: true };
  const intentos = [];
  let texto = '';
  let fuente = '';
  let deBaja = false; // 16/11: 5 de 13 links de la prueba eran publicaciones dadas de baja ("Product Not Available")
  // 1) El servidor baja la página (lo más barato).
  for (const u of urls) {
    try {
      const r = await fetchImpl(u, { headers: { 'user-agent': UA, 'accept-language': 'es-AR,es;q=0.9,en;q=0.8', accept: 'text/html' }, redirect: 'follow', signal: AbortSignal.timeout(15000) });
      const html = await r.text();
      if (/Product Not Available|produit n'est pas disponible|producto no disponible/i.test(html.slice(0, 20000))) { deBaja = true; intentos.push(`${u.split('/')[2]}: dada de baja`); continue; }
      const t = textoDeHtml(html);
      if (r.ok && tieneDatos(t)) { texto = t; fuente = u; break; }
      intentos.push(`${u.replace(/^https:\/\/www\./, '').split('/')[0]}: ${r.status}${r.ok ? ' sin datos' : ''}`);
    } catch (e) { intentos.push(`${u.split('/')[2]}: ${String(e.message).slice(0, 60)}`); }
  }
  if (!texto && deBaja) return { error: 'Esa publicación ya no está disponible en Alibaba (la dieron de baja). Decíselo al cliente en una línea y pedile el link nuevo o la proforma del proveedor.', de_baja: true };
  let datos = null;
  try {
    if (texto) {
      datos = jsonDe(await llamarIA({ model: MODELO, max_tokens: 1500, system: INSTRUCCION, messages: [{ role: 'user', content: `Publicación (${fuente}):\n${texto}` }] }, fetchImpl));
    } else {
      // 2) La IA la lee con su propia herramienta (web_fetch de Anthropic: desde ahí alibaba.fr sí se lee).
      const j = await llamarIA({
        model: MODELO, max_tokens: 3000, system: INSTRUCCION,
        tools: [{ type: 'web_fetch_20250910', name: 'web_fetch', max_uses: 3 }],
        messages: [{ role: 'user', content: `Leé esta publicación con web_fetch (probá en este orden hasta que traiga datos): ${urls.join(' , ')}` }],
      }, fetchImpl, 'web-fetch-2025-09-10');
      datos = jsonDe(j);
      fuente = 'web_fetch';
    }
  } catch (e) { intentos.push(`IA: ${String(e.message).slice(0, 120)}`); }
  if (!datos || (!datos.titulo && !datos.precios)) {
    return { error: 'No pude leer la publicación. Pedile al cliente captura del precio y de "Empaque y entrega".', detalle: intentos.join(' | ') };
  }
  const res = { ...datos, fuente, link: urls[0], instruccion: 'Datos de la publicación (no del cliente): el precio es por unidad según la cantidad; "Empaque y entrega" con "Artículo individual" es por unidad. Si paquete_coherente es false, no uses ese paquete: pedí la proforma o el peso y las medidas de la caja al proveedor.' };
  cache.set(id, res);
  if (cache.size > 200) cache.delete(cache.keys().next().value);
  return res;
}

// Prueba al arrancar (una vez por versión): lee links reales de Alibaba de distintos rubros y formatos y sube una tabla
// a la rama del aprendizaje (son publicaciones públicas, sin datos de clientes). Así Claude sabe si desde Railway se leen.
// 16/11 16:15, Gustavo: "¿podemos hacer pruebas con enlaces aleatorios de Alibaba, a ver si funciona?"
const VERSION_PRUEBA = 'v4-16-11';
const LINKS_PRUEBA = [
  'https://www.alibaba.com/x/B2iQFj?ck=pdp', // link corto del Compartir (arrancador, el de Gustavo)
  'https://www.alibaba.com/product-detail/DIY-Sport-Gym-Fitness-Equipment-Wheel_1600958949996.html?spm=a2700.prosearch',
  'https://www.alibaba.com/product-detail/Fitness-Cable-Gym-Equipment-Steel-Wire_60734807345.html?spm=a2706',
  'https://www.alibaba.com/product-introduction/Non-Slip-Custom-logo-print-Double_60747406011.html',
  'https://www.alibaba.com/product-introduction/TOPKO-Exercise-Anti-Slip-Eco-Friendly_1600156426710.html',
  'https://www.alibaba.co.uk/product-detail/Portable-Car-Jump-Starter-12v-with_1601273281314.html',
  'https://www.alibaba.co.uk/product-detail/Newest-Multi-function-12V-Jump-Starter_1601726016174.html',
  'https://www.alibaba.fr/product-detail/12V-Portable-6000mAh-Car-Battery-Booster_1601608136622.html',
  'https://www.alibaba.com/product-detail/Car-Jump-Starter-1000A-3-in_1601148563519.html',
  'https://www.alibaba.com/product-detail/_62020798193.html',
  'https://www.alibaba.co.uk/product-detail/200LM-W-Flexible-SMD-2835-72_1601386148326.html',
  'https://www.alibaba.com/product-detail/Smart-wifi-leds-5050-rgb-light_1600997656793.html',
  'https://www.alibaba.com/product-introduction/China-Factory-Directly-Offer-Liquid-Silicon_1601323439529.html',
];
const celda = (x) => String(x == null ? '—' : x).replace(/\|/g, '/').replace(/\s+/g, ' ').slice(0, 70);
async function autoprueba({ store, fetchImpl = fetch, links = LINKS_PRUEBA, subirFn = null }) {
  if (!store.meta || store.meta('pruebaLink') === VERSION_PRUEBA) return null;
  store.meta('pruebaLink', VERSION_PRUEBA);
  const filas = [];
  let ok = 0;
  for (const l of links) {
    cache.delete(idDe(candidatas(l)[0] || l));
    let r;
    try { r = await leer(l, { fetchImpl }); } catch (e) { r = { error: e.message }; }
    const bien = !r.error && !!r.titulo;
    if (bien) ok += 1;
    const p0 = (r.precios || [])[0];
    filas.push(`| ${bien ? '✅' : '❌'} | ${celda(l.replace(/^https:\/\/(www\.)?/, '').slice(0, 60))} | ${celda(r.fuente && r.fuente.replace(/^https:\/\/(www\.)?/, '').split('/')[0])} | ${celda(r.titulo)} | ${p0 ? `USD ${p0.usd} desde ${p0.desde}` : '—'} | ${celda(r.unidades_de_venta)} | ${celda(r.tamano_paquete_cm)} | ${celda(r.peso_bruto_kg)} | ${r.paquete_coherente === false ? '⚠️ no' : r.paquete_coherente ? 'sí' : '—'} | ${celda(r.error ? `${r.error} ${r.detalle || ''}` : r.nota)} |`);
  }
  const fecha = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
  const contenido = `# Prueba de lectura de links — ${fecha}\n\nLeídos: ${ok} de ${links.length} (desde el servidor de Railway).\n\n| | Link | Leído de | Producto | Precio | Unidad de venta | Paquete (cm) | Peso (kg) | ¿Coherente? | Nota |\n|---|---|---|---|---|---|---|---|---|---|\n${filas.join('\n')}\n`;
  const subir = subirFn || ((x) => require('./aprendizaje').subir(x));
  await subir({ fecha: `prueba-link-${fecha}`, contenido, fetchImpl }).catch((e) => console.error('Prueba link (subir):', e.message));
  return { ok, total: links.length, contenido };
}

module.exports = { autoprueba, leer, candidatas, textoDeHtml, tieneDatos, INSTRUCCION };
