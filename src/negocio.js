'use strict';
/**
 * Base única de PuertoBox. Junta data/negocio.json (contacto y reglas) con data/precios_venta.json (precios)
 * y calcula los valores derivados. El bot, la web, el buscador y las páginas leen TODO de acá.
 * Cambiás un dato en data/ → cambia en todos lados.
 */
const path = require('path');
const fs = require('fs');
const DATA = path.join(__dirname, '..', 'data');
const leer = (f) => JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8'));

const fmtKg = (n) => String(n).replace('.', ',');

function datos() {
  const n = leer('negocio.json');
  const fd = leer('precios_venta.json').flete_directo;
  const tramos = fd.tramos_venta;
  const gestion = fd.handling_usd;
  const precioKg = require('./flete_directo').fleteVenta; // un solo cálculo de flete para bot, web y páginas
  const gestionPara = require('./flete_directo').gestionPara;
  const tg = fd.handling_tramos || [];
  const gestionTexto = tg.length > 1 ? tg.map((t, i) => (t.hasta_kg == null ? `USD ${t.usd} en los de más de ${tg[i - 1].hasta_kg} kg` : `USD ${t.usd} en envíos de hasta ${t.hasta_kg} kg`)).join(' y ') : `USD ${gestion}`;
  const ultimo = tramos[tramos.length - 1];
  const filas = tramos.map((t, i) => {
    // Kilos enteros (15/11): el tramo va del primer kilo entero que alcanza hasta el último entero antes del siguiente.
    const desde = i === 0 ? null : Math.ceil(t.desde_kg);
    const hasta = t.hasta_kg == null ? null : Math.ceil(t.hasta_kg) - 1;
    const rango = desde == null ? `Hasta ${fmtKg(hasta)} kg` : hasta == null ? `${fmtKg(desde)} kg o más` : desde === hasta ? `${fmtKg(desde)} kg` : `${fmtKg(desde)} a ${fmtKg(hasta)} kg`;
    const precio = t.total_usd != null ? `USD ${t.total_usd} total` : `USD ${t.usd_kg} / kg`;
    return { rango, precio };
  });
  const d = {
    ...n,
    gestion_usd: gestion,
    gestion_texto: gestionTexto, // "USD 20 en envíos de hasta 5 kg y USD 40 en los de más de 5 kg"
    gestion_grande_usd: gestionPara(1000),
    gestion_cuit_puertobox_usd: fd.handling_cuit_puertobox_usd || gestion,
    envio_minimo_usd: precioKg(1) + gestionPara(1),
    usd_kg_desde: ultimo.usd_kg,
    kg_desde: ultimo.desde_kg,
    // Kilo con la gestión incluida que se publica (16/11, gestión escalonada): el último precio por kilo + 1 (USD 19),
    // y desde cuántos kilos es cierto (con gestión USD 40, 40 kg). Así el anuncio y la web nunca prometen de menos.
    usd_kg_total_desde: ultimo.usd_kg + 1,
    kg_desde_total: (() => { for (let k = Math.ceil(ultimo.desde_kg); k <= 500; k++) if ((precioKg(k) + gestionPara(k)) / k <= ultimo.usd_kg + 1) return k; return null; })(),
    franquicia_usd: n.pequenos_envios.franquicia_usd,
    envios_por_anio: n.pequenos_envios.envios_por_anio,
    unidades_iguales: n.pequenos_envios.unidades_iguales,
    wa_link: `https://wa.me/${n.whatsapp_bot}?text=${encodeURIComponent(n.mensaje_whatsapp)}`,
    tabla_html: filas.map((f) => `<tr><td>${f.rango}</td><td>${f.precio}</td></tr>`).join('\n    '),
    tabla_texto: filas.map((f) => `${f.rango}: ${f.precio}`).join(' · '),
  };
  // Texto del anuncio vigente y precios de publicaciones viejas (15/11: un cliente citó un precio de un posteo viejo y el bot no lo sabía).
  const subA = (t) => String(t).replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_, k) => { if (!(k in d)) throw new Error(`Falta {{${k}}} en anuncio_vigente`); return String(d[k]); });
  d.anuncio_vigente = subA(n.anuncio_vigente || '');
  d.anuncio_vigente_una_linea = d.anuncio_vigente.replace(/\s*\n+\s*/g, ' ');
  d.precios_anteriores_texto = (n.precios_anteriores || []).map((x) => `- ${x}`).join('\n');
  const faq = leer('faq.json').preguntas;
  const sub = (t) => t.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_, k) => { if (!(k in d)) throw new Error(`Falta {{${k}}} en faq.json`); return String(d[k]); });
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  d.faq_texto = faq.map((f) => `- ${f.pregunta} → ${sub(f.respuesta)}`).join('\n');
  d.faq_html = faq.map((f) => `<details><summary>${esc(f.pregunta)}</summary><p>${esc(sub(f.respuesta))}</p></details>`).join('\n    ');
  return d;
}

/** Reemplaza {{clave}} por su valor. Si falta una clave, tira error (así nunca sale un {{...}} al cliente). */
function render(texto, extra = {}) {
  const d = { ...datos(), ...extra };
  return texto.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_, k) => {
    if (!(k in d)) throw new Error(`Falta el dato {{${k}}} en data/negocio.json`);
    return String(d[k]);
  });
}

module.exports = { datos, render };
