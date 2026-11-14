'use strict';
/**
 * Páginas públicas de PuertoBox, todas armadas con la base única (src/negocio.js) y el nomenclador:
 *  /                     web principal (web/sitio/index.html con {{datos}})
 *  /buscador?q=...       buscador público de posiciones (sin la liquidación, que es solo de Gustavo)
 *  /ncm/6404.19.00       una página por posición (para Google)
 *  /importar/zapatillas  una página por producto común (para Google)
 *  /sitemap.xml, /robots.txt
 */
const fs = require('fs');
const path = require('path');
const { crear } = require('./nomenclador');
const negocio = require('./negocio');

const RAIZ = path.join(__dirname, '..');
const dataNom = (f) => JSON.parse(fs.readFileSync(path.join(RAIZ, 'web', 'nomenclador', 'data', f), 'utf8'));
let motor = null;
function nom() {
  if (!motor) motor = crear({ sim: dataNom('sim.json'), intervenciones: dataNom('intervenciones.json'), sinonimos: dataNom('sinonimos.json'), frecuentes: dataNom('productos_frecuentes.json') });
  return motor;
}
const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cap = (t) => { const s = String(t || '').trim(); return s ? s[0].toUpperCase() + s.slice(1).toLowerCase() : s; };
const filasValidas = () => nom().filas.filter((f) => !f.c.startsWith('00'));
const ncmDe = (c) => c.slice(0, 10); // 6404.19.00

function waLink(texto) {
  const d = negocio.datos();
  return `https://wa.me/${d.whatsapp_bot}?text=${encodeURIComponent(texto)}`;
}

function layout({ titulo, descripcion, canonico, cuerpo }) {
  const d = negocio.datos();
  return `<!DOCTYPE html>
<html lang="es-AR"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(titulo)}</title>
<meta name="description" content="${esc(descripcion)}">
<link rel="canonical" href="https://${d.dominio}${canonico}">
<style>
:root{--red:#ff1a35;--white:#f0f0f0;--gray:#8a8a8a;--bg:#080808;--bg2:#121212;--line:rgba(255,255,255,.1)}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--white);font:16px/1.6 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
a{color:var(--white)}header{display:flex;justify-content:space-between;align-items:center;padding:14px 20px;border-bottom:1px solid var(--line)}
.logo{font-weight:800;letter-spacing:4px;text-decoration:none}.logo em{color:var(--red);font-style:normal}
main{max-width:860px;margin:0 auto;padding:24px 20px 80px}h1{font-size:28px;line-height:1.2;margin:8px 0 12px}h2{font-size:20px;margin:28px 0 10px}
.muted{color:var(--gray);font-size:14px}.card{background:var(--bg2);border:1px solid var(--line);border-radius:10px;padding:16px;margin:12px 0}
.wa{display:inline-block;background:#25d366;color:#04140a;font-weight:700;padding:14px 20px;border-radius:8px;text-decoration:none;margin:12px 0}
form{display:flex;gap:8px;margin:12px 0}input{flex:1;padding:12px;border-radius:8px;border:1px solid var(--line);background:var(--bg2);color:var(--white);font-size:16px}
button{padding:12px 16px;border:0;border-radius:8px;background:var(--red);color:#fff;font-weight:700;font-size:16px}
table{width:100%;border-collapse:collapse}td,th{padding:8px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}
.tag{display:inline-block;background:rgba(255,26,53,.15);color:#ff8a96;border-radius:6px;padding:2px 8px;font-size:13px;margin:2px 4px 2px 0}
ul.res{list-style:none;padding:0}ul.res li{padding:12px 0;border-bottom:1px solid var(--line)}code{color:#ff8a96}
</style></head><body>
<header><a class="logo" href="/">PUERTO<em>BOX</em></a><a href="/buscador">Buscador de posiciones</a></header>
<main>${cuerpo}
<p class="muted" style="margin-top:40px">${esc(d.marca)} · ${esc(d.despachante)}, despachante de aduana matriculado ante ARCA · ${esc(d.ciudad)} · <a href="/">Inicio</a> · <a href="/privacidad">Privacidad</a></p>
</main></body></html>`;
}

function aviso() {
  const meta = nom().meta || {};
  return `<p class="muted">Información orientativa según el Arancel Integrado de ARCA (archivos del ${esc(String(meta.fecha_archivos || '').split('-').reverse().join('/'))}). Las intervenciones son orientativas. La clasificación final la confirma nuestro despachante al cotizar.</p>`;
}

function bloquePrecio() {
  const d = negocio.datos();
  return `<div class="card"><strong>Envío de China a tu domicilio por courier aéreo express.</strong><br>
Un envío chico arranca en unos USD ${d.envio_minimo_usd} entre flete y gestión, y el kilo baja mientras más pesa: desde ${d.kg_desde} kg, USD ${d.usd_kg_desde} el kilo de flete más USD ${d.gestion_usd} de gestión por envío. Precio cerrado. Los impuestos se pagan aparte a la empresa de transporte y te los estimamos antes de que compres.</div>`;
}

// ── Web principal ──
function home() {
  return negocio.render(fs.readFileSync(path.join(RAIZ, 'web', 'sitio', 'index.html'), 'utf8'));
}

/** Título (partida) y detalle (subpartida) de una posición, con acentos, desde la jerarquía de ARCA. */
function describir(c) {
  const jer = (nom().ficha(c).jerarquia || []).map((j) => j.replace(/^-+/, '').replace(/[.:;]+$/, '').trim()).filter(Boolean);
  const corto = (t, n) => (t.length > n ? t.slice(0, n - 1) + '…' : t);
  return { titulo: corto(cap(jer[0] || ''), 110), detalle: corto(jer.slice(1, 3).map(cap).join(' › '), 140), jer };
}

// ── Buscador público ──
function agruparPorNcm(resultados) {
  const vistos = new Map();
  for (const r of resultados) {
    if (r.c.startsWith('00')) continue;
    const k = ncmDe(r.c);
    if (!vistos.has(k)) vistos.set(k, r);
  }
  return [...vistos.values()];
}

function buscador(q) {
  q = String(q || '').trim().slice(0, 80);
  let lista = '';
  if (q) {
    const res = agruparPorNcm(nom().buscar(q, 60)).slice(0, 15);
    lista = res.length
      ? `<ul class="res">${res.map((r) => { const t = describir(r.c); return `<li><a href="/ncm/${esc(ncmDe(r.c))}"><code>${esc(ncmDe(r.c))}</code> ${esc(t.titulo)}</a><br><span class="muted">${esc(t.detalle)}</span></li>`; }).join('')}</ul>`
      : `<p>No encontramos "${esc(q)}". Probá con otra palabra o escribinos y lo clasificamos nosotros.</p>`;
    lista += `<a class="wa" href="${esc(waLink(`Hola, quiero cotizar: ${q}`))}" target="_blank" rel="noopener">💬 Cotizar "${esc(q)}" por WhatsApp</a>`;
  }
  return layout({
    titulo: q ? `${cap(q)}: posición arancelaria e impuestos de importación | PuertoBox` : 'Buscador de posiciones arancelarias (NCM) | PuertoBox',
    descripcion: 'Buscá la posición arancelaria (NCM) de tu producto, los derechos de importación y si necesita algún permiso. Gratis, con datos de ARCA.',
    canonico: '/buscador',
    cuerpo: `<h1>Buscador de posiciones arancelarias</h1>
<p>Escribí qué querés traer y te mostramos la posición, los derechos de importación y si puede necesitar algún permiso.</p>
<form action="/buscador" method="get"><input name="q" value="${esc(q)}" placeholder="Ej.: zapatillas, auriculares, mochila" aria-label="Producto"><button>Buscar</button></form>
${lista}${aviso()}`,
  });
}

// ── Página por posición ──
function paginaNcm(ncm) {
  if (!/^\d{4}\.\d{2}\.\d{2}$/.test(ncm) || ncm.startsWith('00')) return null;
  const filas = filasValidas().filter((f) => ncmDe(f.c) === ncm);
  if (!filas.length) return null;
  const ficha = nom().ficha(filas[0].c);
  const titulo = describir(filas[0].c).titulo;
  const interv = ficha.intervenciones || [];
  const dies = [...new Set(filas.map((f) => Number(f.die)))].sort((a, b) => a - b);
  const resumenDie = dies.length === 1 ? `${dies[0]}%` : `entre ${dies[0]}% y ${dies[dies.length - 1]}% según el detalle`;
  const filasHtml = filas.map((f) => `<tr><td><code>${esc(f.c)}</code></td><td>${esc(cap(f.ult))}</td><td>${esc(f.die)}%</td></tr>`).join('');
  return layout({
    titulo: `Posición ${ncm}: ${titulo.slice(0, 60)} — derechos de importación | PuertoBox`,
    descripcion: `Posición arancelaria ${ncm} (${titulo.slice(0, 90)}): derechos de importación, tasa de estadística e intervenciones. Traelo de China con PuertoBox.`,
    canonico: `/ncm/${ncm}`,
    cuerpo: `<p class="muted"><a href="/buscador">Buscador</a> › ${esc(ncm.slice(0, 4))}</p>
<h1>Posición ${esc(ncm)}</h1>
<p>${esc(describir(filas[0].c).jer.slice(0, 3).map(cap).join(' › '))}</p>
<h2>Derechos de importación</h2>
<div class="card" style="font-size:20px"><strong>Derecho (DIE): ${esc(resumenDie)}</strong></div>
<details><summary>Ver las ${filas.length} posiciones SIM</summary>
<table><tr><th>Posición SIM</th><th>Detalle</th><th>DIE</th></tr>${filasHtml}</table></details>
<p class="muted">Además: tasa de estadística 3% e IVA (21% en general). En courier el cálculo cambia según el régimen; te lo hacemos al cotizar.</p>
<h2>Intervenciones posibles</h2>
${interv.length ? interv.map((i) => `<span class="tag">${esc(i.organismo)}</span>`).join('') + `<p class="muted">${esc(interv[0].detalle)}</p>` : '<p>No figura ninguna en nuestra tabla orientativa.</p>'}
<h2>¿Lo querés traer de China?</h2>
${bloquePrecio()}
<a class="wa" href="${esc(waLink(`Hola, quiero cotizar un producto de la posición ${ncm}`))}" target="_blank" rel="noopener">💬 Cotizar por WhatsApp</a>
${aviso()}`,
  });
}

// ── Página por producto común (palabras del sinónimo) ──
function palabras() {
  return Object.keys(dataNom('sinonimos.json')).filter((k) => !k.startsWith('_') && /^[a-zñáéíóú ]+$/i.test(k));
}
function slug(t) { return String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''); }

function paginaProducto(s) {
  const palabra = palabras().find((p) => slug(p) === s);
  if (!palabra) return null;
  const res = agruparPorNcm(nom().buscar(palabra, 60)).slice(0, 8);
  return layout({
    titulo: `Importar ${palabra} de China a Argentina: impuestos y envío | PuertoBox`,
    descripcion: `Cómo traer ${palabra} de China: posición arancelaria, derechos de importación y costo del envío por courier a tu domicilio.`,
    canonico: `/importar/${s}`,
    cuerpo: `<h1>Importar ${esc(palabra)} de China</h1>
<p>Te decimos la posición arancelaria, cuánto vas a pagar de impuestos y el costo del envío antes de que le pagues al proveedor.</p>
${bloquePrecio()}
<a class="wa" href="${esc(waLink(`Hola, quiero cotizar ${palabra} desde China`))}" target="_blank" rel="noopener">💬 Cotizar ${esc(palabra)} por WhatsApp</a>
<h2>Posiciones posibles</h2>
<ul class="res">${res.map((r) => { const t = describir(r.c); return `<li><a href="/ncm/${esc(ncmDe(r.c))}"><code>${esc(ncmDe(r.c))}</code> ${esc(t.titulo)}</a><br><span class="muted">${esc(t.detalle)}</span></li>`; }).join('')}</ul>
<p class="muted">La posición exacta depende del material y el uso. La confirmamos al cotizar.</p>
${aviso()}`,
  });
}

function privacidad() {
  const d = negocio.datos();
  return layout({
    titulo: 'Política de privacidad | PuertoBox',
    descripcion: 'Cómo PuertoBox usa los datos que nos dejás al cotizar por WhatsApp o Instagram.',
    canonico: '/privacidad',
    cuerpo: `<h1>Política de privacidad</h1>
<p>${esc(d.marca)} (${esc(d.despachante)}, despachante de aduana matriculado ante ARCA, ${esc(d.ciudad)}) usa los datos que nos mandás por WhatsApp, Instagram o esta web solo para cotizar y gestionar tu envío: nombre, teléfono o usuario, producto, peso, medidas y valor de la compra.</p>
<p>Las respuestas automáticas las arma un asistente con inteligencia artificial que procesa tus mensajes para responderte. No vendemos ni compartimos tus datos con terceros, salvo lo necesario para hacer el envío (courier y Aduana).</p>
<p>Podés pedir que borremos tus datos o tu conversación cuando quieras escribiendo a <a href="mailto:${esc(d.email)}">${esc(d.email)}</a> o por los mismos chats. Lo hacemos dentro de los 10 días.</p>
<p class="muted">Última actualización: 13/11/2026.</p>`,
  });
}

function sitemap() {
  const d = negocio.datos();
  const base = `https://${d.dominio}`;
  const urls = ['/', '/buscador', '/privacidad', ...palabras().map((p) => `/importar/${slug(p)}`), ...[...new Set(filasValidas().map((f) => ncmDe(f.c)))].map((n) => `/ncm/${n}`)];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `<url><loc>${base}${u}</loc></url>`).join('\n')}\n</urlset>\n`;
}

function robots() {
  const d = negocio.datos();
  return `User-agent: *\nAllow: /\nDisallow: /nomenclador\nDisallow: /leads\nDisallow: /pruebas\nDisallow: /webhook\nSitemap: https://${d.dominio}/sitemap.xml\n`;
}

/** Devuelve { tipo, cuerpo } para la ruta, o null si no es una página pública. */
function servir(pathname, searchParams) {
  const html = (c) => (c == null ? null : { tipo: 'text/html; charset=utf-8', cuerpo: c });
  if (pathname === '/' || pathname === '/index.html') return html(home());
  if (pathname === '/buscador') return html(buscador(searchParams.get('q')));
  if (pathname.startsWith('/ncm/')) return html(paginaNcm(decodeURIComponent(pathname.slice(5))));
  if (pathname.startsWith('/importar/')) return html(paginaProducto(decodeURIComponent(pathname.slice(10))));
  if (pathname === '/privacidad') return html(privacidad());
  if (pathname === '/sitemap.xml') return { tipo: 'application/xml; charset=utf-8', cuerpo: sitemap() };
  if (pathname === '/robots.txt') return { tipo: 'text/plain; charset=utf-8', cuerpo: robots() };
  return null;
}

module.exports = { servir, home, buscador, privacidad, paginaNcm, paginaProducto, sitemap, robots, slug, palabras };
