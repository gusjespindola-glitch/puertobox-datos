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
  const precioKg = (kg) => { // mismo criterio que src/flete_directo.js: desde_kg <= kg < hasta_kg
    const t = tramos.find((x) => kg >= x.desde_kg && (x.hasta_kg == null || kg < x.hasta_kg)) || tramos[0];
    return t.total_usd != null ? t.total_usd : t.usd_kg * kg;
  };
  const ultimo = tramos[tramos.length - 1];
  const filas = tramos.map((t, i) => {
    const desde = i === 0 ? null : t.desde_kg;
    const hasta = t.hasta_kg == null ? null : t.hasta_kg - 0.5;
    const rango = desde == null ? `Hasta ${fmtKg(t.hasta_kg - 0.5)} kg` : hasta == null ? `${fmtKg(desde)} kg o más` : `${fmtKg(desde)} a ${fmtKg(hasta)} kg`;
    const precio = t.total_usd != null ? `USD ${t.total_usd} total` : `USD ${t.usd_kg} / kg`;
    return { rango, precio };
  });
  const d = {
    ...n,
    gestion_usd: gestion,
    envio_minimo_usd: precioKg(1) + gestion,
    usd_kg_desde: ultimo.usd_kg,
    kg_desde: ultimo.desde_kg,
    usd_kg_total_desde: Math.round((precioKg(ultimo.desde_kg) + gestion) / ultimo.desde_kg),
    franquicia_usd: n.pequenos_envios.franquicia_usd,
    envios_por_anio: n.pequenos_envios.envios_por_anio,
    unidades_iguales: n.pequenos_envios.unidades_iguales,
    wa_link: `https://wa.me/${n.whatsapp_bot}?text=${encodeURIComponent(n.mensaje_whatsapp)}`,
    tabla_html: filas.map((f) => `<tr><td>${f.rango}</td><td>${f.precio}</td></tr>`).join('\n    '),
    tabla_texto: filas.map((f) => `${f.rango}: ${f.precio}`).join(' · '),
  };
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
