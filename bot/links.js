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
  // Tiendas de proveedores (proveedor.en.alibaba.com/product/<número>-<otro>/...): se lee por el número.
  const t = u.match(/alibaba\.com\/product\/(\d{8,})-\d+\//i);
  if (t) return ['fr', 'co.uk'].map((d) => `https://www.alibaba.${d}/product-detail/subject-${t[1]}.html`);
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
const CLAVES = /(US\s?\$|\$\s?US|\$\s?\d|\d\s?\$|€|£|price|prix|precio|gross weight|poids|peso bruto|package size|taille d|emballage|packaging|tamaño del paquete|selling units|unités de vente)/i;
/** Texto visible de una página (sin scripts ni estilos). Si es largo, se queda con el principio (título) y con lo que
 * rodea a precios y empaque (16/11: en páginas activas los datos quedaban más allá de lo que se leía). */
function textoDeHtml(html, max = 20000) {
  const t = String(html || '').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|li|tr|h\d|span|td|dd|dt)>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#36;/g, '$')
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
  if (t.length <= max) return t;
  const lineas = t.split('\n');
  const elegidas = new Set();
  lineas.forEach((l, i) => { if (CLAVES.test(l)) for (let k = Math.max(0, i - 3); k <= Math.min(lineas.length - 1, i + 6); k++) elegidas.add(k); });
  const inicio = t.slice(0, 5000);
  const resto = [...elegidas].sort((a, b) => a - b).map((i) => lineas[i]).join('\n');
  return `${inicio}\n…\n${resto}`.slice(0, max);
}
/** ¿La página trae datos de producto? Acepta precios en formato francés/inglés ("42,78 $US", "US$26.33", "£19"). */
const tieneDatos = (t) => t.length > 1500 && /(US\s?\$|\$\s?US|\$\s?\d|\d\s?\$|€|£)/.test(t) && /(kg|gross weight|poids|package|emballage|peso|piece|pièce|set|unit)/i.test(t);

const INSTRUCCION = `Te paso el texto de la publicación de un producto (Alibaba, 1688, etc.). Devolvé SOLO un JSON, sin texto alrededor, con lo que DICE la página (no inventes nada; si un dato no está, null):
{"titulo":"...","precio_por":"pieza/metro/set/par/kg","precios":[{"desde":6,"hasta":499,"usd":26.33}],"pedido_minimo":6,"unidades_de_venta":"Artículo individual","unidades_por_paquete":1,"tamano_paquete_cm":"24x12x45","peso_bruto_kg":2.0,"caracteristicas":{"marca":"OEM","modelo":"CYD17","material":"...","bateria":"litio 12000 mAh / no / no dice","inalambrico":"Bluetooth/WiFi/no","voltaje":"12V","uso":"...","otras":"lo demás que sirva para clasificarlo, en una línea"},"paquete_coherente":true,"nota":"..."}
"unidades_por_paquete": cuántas unidades de venta vienen en el paquete de "Empaque y entrega" (1 si es "Artículo individual"; si dice "caja de 2 unidades", 2). "precios": cada escalón con "hasta" null en el último.
"paquete_coherente": false SOLO si es imposible para UNA unidad de venta (5 veces o más de lo razonable; por ejemplo, 25 kg o 30x30x30 cm para una polea chica). Si solo parece grande o generoso (por ejemplo, 24x12x45 cm para un arrancador con accesorios), es true, y en "nota" decí en una línea que puede estar exagerado y conviene confirmarlo con el proveedor. (16/11: Gustavo cotizó el arrancador con 24x12x45 cm.)`;

// 16/11 (prueba v7): la IA se gastaba el lugar "pensando" (stop=max_tokens, sin texto). Se pide sin pensar; si el modelo
// no acepta ese parámetro, se repite sin él.
async function llamarIA(body, fetchImpl, beta) {
  const pedir = (b) => fetchImpl('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', ...(beta ? { 'anthropic-beta': beta } : {}) },
    body: JSON.stringify(b),
  });
  let r = await pedir({ ...body, thinking: { type: 'disabled' } });
  if (!r.ok && r.status === 400) {
    const t = await r.text();
    if (!/thinking/i.test(t)) throw new Error(`Anthropic 400: ${t.slice(0, 150)}`);
    r = await pedir(body);
  }
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
      intentos.push(`${u.replace(/^https:\/\/www\./, '').split('/')[0]}: ${r.status}${r.ok ? ` sin datos (html ${html.length}, texto ${t.length})` : ''}`);
    } catch (e) { intentos.push(`${u.split('/')[2]}: ${String(e.message).slice(0, 60)}`); }
  }
  if (!texto && deBaja) return { error: 'Esa publicación ya no está disponible en Alibaba (la dieron de baja). Decíselo al cliente en una línea y pedile el link nuevo o la proforma del proveedor.', de_baja: true };
  let datos = null;
  try {
    if (texto) {
      const j0 = await llamarIA({ model: MODELO, max_tokens: 4000, system: INSTRUCCION, messages: [{ role: 'user', content: `Publicación (${fuente}):\n${texto}` }] }, fetchImpl);
      datos = jsonDe(j0);
      if (!datos || (!datos.titulo && !datos.precios)) {
        const dijo = (j0.content || []).filter((b) => b.type === 'text').map((b) => b.text).join(' ').replace(/\s+/g, ' ').slice(0, 120);
        intentos.push(`IA: no sacó datos del texto de ${fuente.split('/')[2]} (texto ${texto.length}; dijo: ${dijo})`);
        datos = null; texto = ''; // 16/11, prueba v6: páginas activas que el servidor baja pero la IA no entiende → se prueba con web_fetch
      }
    }
    if (!texto) {
      // 2) La IA la lee con su propia herramienta (web_fetch de Anthropic: desde ahí alibaba.fr sí se lee).
      const j = await llamarIA({
        model: MODELO, max_tokens: 8000, system: INSTRUCCION,
        tools: [{ type: 'web_fetch_20250910', name: 'web_fetch', max_uses: 3 }],
        messages: [{ role: 'user', content: `Leé esta publicación con web_fetch (probá en este orden hasta que traiga datos): ${urls.join(' , ')}` }],
      }, fetchImpl, 'web-fetch-2025-09-10');
      datos = jsonDe(j);
      if (datos && (datos.titulo || datos.precios)) fuente = 'web_fetch';
      if (!datos) intentos.push(`web_fetch: sin JSON (stop=${j.stop_reason || '?'}, bloques=${(j.content || []).map((b) => b.type).join('+').slice(0, 80)})`);
    }
  } catch (e) { intentos.push(`IA: ${String(e.message).slice(0, 120)}`); }
  if (!datos || (!datos.titulo && !datos.precios)) {
    return { error: 'No pude leer la publicación. Pedile al cliente captura del precio y de "Empaque y entrega".', detalle: intentos.join(' | ') };
  }
  const res = { ...datos, fuente, link: urls[0], instruccion_base: 'Datos de la publicación (no del cliente): el precio es por unidad según la cantidad; "Empaque y entrega" con "Artículo individual" es por unidad. Si paquete_coherente es false, no uses ese paquete: pedí la proforma o el peso y las medidas de la caja al proveedor.' };
  cache.set(id, res);
  if (cache.size > 200) cache.delete(cache.keys().next().value);
  return conPedido(res, ctx.unidades);
}

/** "24x12x45", "25.00x21.00x7.00", "38*19*32cm (caja de 2)" → [24, 12, 45] o null. */
function medidas(t) {
  const m = String(t || '').replace(/,/g, '.').match(/(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)/i);
  return m ? m.slice(1, 4).map(Number) : null;
}
/** Escalón de precio que corresponde a una cantidad (16/11, Gustavo: "el precio dependiendo la cantidad"). */
function escalon(precios, unidades) {
  const ps = (precios || []).filter((p) => p && p.usd > 0).sort((a, b) => (a.desde || 0) - (b.desde || 0));
  if (!ps.length) return null;
  return ps.find((p) => unidades >= (p.desde || 0) && (p.hasta == null || unidades <= p.hasta)) || (unidades < (ps[0].desde || 0) ? ps[0] : ps[ps.length - 1]);
}
/**
 * Con la cantidad del cliente, la cuenta hecha en código (no por la IA): precio del escalón, valor total, cantidad de
 * paquetes, peso total y los datos listos para `cotizar` (16/11, Gustavo: "que reconozca las características y el precio
 * dependiendo la cantidad y el peso y las medidas").
 */
function conPedido(res, unidades) {
  const sin = { ...res, instruccion: `${res.instruccion_base} Cuando sepas cuántas unidades quiere, volvé a llamar leer_link con "unidades": te devuelve el precio que le toca, el valor total y los datos para cotizar.` };
  delete sin.instruccion_base;
  const u = Math.round(Number(unidades) || 0);
  if (!(u > 0)) return sin;
  const e = escalon(res.precios, u);
  const upp = Math.max(1, Math.round(Number(res.unidades_por_paquete) || 1));
  const med = medidas(res.tamano_paquete_cm);
  const kgPaq = Number(res.peso_bruto_kg) || 0;
  const paquetes = Math.ceil(u / upp);
  const pedido = {
    unidades: u,
    ...(e ? { precio_unitario_usd: e.usd, escalon: `${e.desde ?? 1}${e.hasta == null ? ' o más' : ` a ${e.hasta}`}`, valor_total_usd: Math.round(u * e.usd * 100) / 100 } : {}),
    ...(res.pedido_minimo && u < res.pedido_minimo ? { aviso_minimo: `El proveedor vende desde ${res.pedido_minimo}: con ${u} puede no aceptar el pedido o cobrar otro precio.` } : {}),
    paquetes,
    ...(kgPaq ? { kg_total: Math.round(paquetes * kgPaq * 100) / 100 } : {}),
  };
  if (e && med && kgPaq && res.paquete_coherente !== false) {
    pedido.cotizar_con = { unidades: u, valor_factura_usd: pedido.valor_total_usd, kg: pedido.kg_total, bultos: [{ cantidad: paquetes, largo_cm: med[0], ancho_cm: med[1], alto_cm: med[2], kg_por_caja: kgPaq }] };
  }
  sin.para_tu_pedido = pedido;
  sin.instruccion = `${res.instruccion_base} para_tu_pedido ya trae la cuenta: precio del escalón, valor total, paquetes y peso. ${pedido.cotizar_con ? 'Pasale a cotizar EXACTAMENTE los datos de para_tu_pedido.cotizar_con (más die/regimen y lo que corresponda, por ejemplo con_bateria_litio si tiene batería).' : 'Falta el peso o las medidas del paquete (o no son coherentes): pedí la proforma o el peso y las medidas de la caja al proveedor.'} Decile al cliente en una línea el precio que le toca ("con ${u} unidades el proveedor cobra USD X c/u").`;
  return sin;
}

// Prueba al arrancar (una vez por versión): lee links reales de Alibaba de distintos rubros y formatos y sube una tabla
// a la rama del aprendizaje (son publicaciones públicas, sin datos de clientes). Así Claude sabe si desde Railway se leen.
// 16/11 16:15, Gustavo: "¿podemos hacer pruebas con enlaces aleatorios de Alibaba, a ver si funciona?"
const VERSION_PRUEBA = 'v10-16-11'; // v10: presupuesto armado por el programa
const LINKS_PRUEBA = [
  'https://www.alibaba.com/x/B2iQFj?ck=pdp',
];
// Charlas completas con la IA de verdad (16/11, "hacé más pruebas"): el cliente manda el link y contesta lo que le piden.
const CHARLAS_PRUEBA = [
  { nombre: 'Link corto del Compartir (arrancador)', msgs: ['Hola quiero traer esto https://www.alibaba.com/x/B2iQFj?ck=pdp', '20 unidades, sin marca'] },
  { nombre: 'Remeras con todos los datos (sin link)', msgs: ['Hola, quiero traer 200 remeras de algodón sin marca, le pago 700 dólares al proveedor, son 30 kilos en 2 cajas de 50x40x50'] },
];
async function charlasDePrueba(fetchImpl) {
  const { responder } = require('./agent');
  const { crearStore } = require('./store');
  const salida = [];
  for (const [i, c] of CHARLAS_PRUEBA.entries()) {
    const st = crearStore(null); const tel = `54900000099${i}`; const derivaciones = [];
    salida.push(`### ${c.nombre}`, '');
    for (const m of c.msgs) {
      let r; try { r = await responder({ telefono: tel, texto: m, store: st, fetchImpl, derivaciones }); } catch (e) { r = `[ERROR ${e.message}]`; }
      salida.push(`**Cliente:** ${m}`, '', `**Bot:** ${String(r || '(nada)').replace(/\n/g, '  \n')}`, '');
    }
    if (derivaciones.length) salida.push(`_Derivaciones: ${derivaciones.map((d) => d.motivo).join(', ')}_`, '');
  }
  return salida.join('\n');
}
const celda = (x) => String(x == null ? '—' : x).replace(/\|/g, '/').replace(/\s+/g, ' ').slice(0, 70);
async function autoprueba({ store, fetchImpl = fetch, links = LINKS_PRUEBA, subirFn = null, conCharlas = links === LINKS_PRUEBA }) {
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
    filas.push(`| ${bien ? '✅' : '❌'} | ${celda(l.replace(/^https:\/\/(www\.)?/, '').slice(0, 60))} | ${celda(r.fuente && r.fuente.replace(/^https:\/\/(www\.)?/, '').split('/')[0])} | ${celda(r.titulo)} | ${p0 ? `USD ${p0.usd} desde ${p0.desde}` : '—'} | ${celda(r.unidades_de_venta)} | ${celda(r.tamano_paquete_cm)} | ${celda(r.peso_bruto_kg)} | ${r.paquete_coherente === false ? '⚠️ no' : r.paquete_coherente ? 'sí' : '—'} | ${r.error ? String(`${r.de_baja ? 'Dada de baja' : 'No leída'}: ${r.detalle || ''}`).replace(/\|/g, '/').slice(0, 300) : celda(r.nota)} |`);
  }
  const fecha = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
  let charlas = '';
  if (conCharlas) { try { charlas = `\n## Charlas completas con la IA\n\n${await charlasDePrueba(fetchImpl)}`; } catch (e) { charlas = `\n## Charlas completas con la IA\n\nFalló: ${e.message}\n`; } }
  const contenido = `# Prueba de lectura de links — ${fecha}\n\nLeídos: ${ok} de ${links.length} (desde el servidor de Railway).\n\n| | Link | Leído de | Producto | Precio | Unidad de venta | Paquete (cm) | Peso (kg) | ¿Coherente? | Nota |\n|---|---|---|---|---|---|---|---|---|---|\n${filas.join('\n')}\n${charlas}`;
  const subir = subirFn || ((x) => require('./aprendizaje').subir(x));
  await subir({ fecha: `prueba-link-${fecha}`, contenido, fetchImpl }).catch((e) => console.error('Prueba link (subir):', e.message));
  return { ok, total: links.length, contenido };
}

module.exports = { conPedido, escalon, medidas, autoprueba, leer, candidatas, textoDeHtml, tieneDatos, INSTRUCCION };
