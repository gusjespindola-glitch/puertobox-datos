'use strict';
/**
 * Modelo "flete directo" PuertoBox (desde 13/11/2026):
 * - El envío va a nombre y domicilio del cliente por courier (DHL por defecto).
 * - PuertoBox cobra flete + handling fijo, por adelantado, al pesarse en el depósito de China.
 * - Impuestos y gasto administrativo los paga el cliente directo al courier.
 * - El presupuesto es estimado con los datos del proveedor; el flete final es el de la balanza.
 */
const path = require('path');
const precios = require(path.join(__dirname, '..', 'data', 'precios_venta.json'));
const r2 = (n) => Math.round(n * 100) / 100;

const M = precios.flete_directo;

/** Kg cobrable: mayor entre real y volumétrico, redondeado hacia arriba a 0,5 kg, mínimo 1. */
function kgCobrable({ kg, largo, ancho, alto, cajas = 1 }) {
  const vol = largo && ancho && alto ? ((largo * ancho * alto) / M.divisor_volumetrico) * (cajas || 1) : 0;
  return Math.max(Math.ceil(Math.max(kg, vol) * 2) / 2, 1);
}

function tramo(kg, tabla) {
  return tabla.find((t) => kg >= t.desde_kg && (t.hasta_kg === null || kg < t.hasta_kg));
}

const precioTramo = (t, kg) => (t.total_usd !== undefined ? t.total_usd : r2(t.usd_kg * kg));

/**
 * Flete que cobra PuertoBox para un kg cobrable.
 * Nunca más caro que el arranque de un tramo siguiente: sin esto 9,5 kg (USD 237,50) costaba más que 10 kg (USD 200),
 * y lo mismo en 4,5, 14,5 y 19,5 kg. Un cliente que pesa menos no puede pagar más.
 */
function fleteVenta(kg) {
  const t = tramo(kg, M.tramos_venta);
  const siguientes = M.tramos_venta.filter((x) => x.desde_kg > kg).map((x) => precioTramo(x, x.desde_kg));
  return Math.min(precioTramo(t, kg), ...siguientes);
}

/** Lo que le paga PuertoBox al forwarder. */
function fleteCosto(kg) {
  const t = tramo(kg, M.tramos_costo_dhl);
  return t.total_usd !== undefined ? t.total_usd : r2(t.usd_kg * kg);
}

/**
 * Estimación de impuestos y gasto administrativo que el cliente paga al courier.
 * regimen: 'personal' (franquicia USD 400 FOB si le quedan envíos) o 'comercial'.
 */
function estimarImpuestos({ valorFactura, flete, die, internos = 0, regimen = 'comercial', conFranquicia = true }) {
  const cif = (valorFactura + flete) * 1.01;
  // Pequeños envíos (curso, Courier 2025): derechos y tasa sobre (FOB - 400) + flete + seguro; hasta USD 400 FOB solo IVA.
  let baseDerechos = cif;
  if (regimen === 'personal' && conFranquicia) {
    baseDerechos = valorFactura <= 400 ? 0 : cif - 400;
  }
  const di = baseDerechos * (die / 100);
  const te = baseDerechos * 0.03;
  const intern = (cif + di + te) * (internos / 100);
  const iva = (cif + di + te) * 0.21;
  const pctAdmin = cif < 500 ? 0.20 : 0.095;
  const admin = cif * pctAdmin;
  const adminTotal = admin * (1 + 0.21 + 0.08);
  return {
    cif: r2(cif),
    derechos_y_tasa: r2(di + te),
    iva: r2(iva),
    internos: r2(intern),
    gasto_administrativo: r2(adminTotal),
    total: r2(di + te + iva + intern + adminTotal),
  };
}

/** Presupuesto estimado para el cliente (flete final = peso de balanza). */
function presupuesto({ kg, largo, ancho, alto, cajas = 1, valorFactura, die = 0, internos = 0, regimen = 'comercial', conFranquicia = true }) {
  const declarado = kgCobrable({ kg, largo, ancho, alto, cajas });
  const kgPres = Math.ceil(declarado * (1 + (M.tolerancia || 0)) * 2) / 2;
  const flete = fleteVenta(kgPres);
  const handling = M.handling_usd || 0;
  const imp = estimarImpuestos({ valorFactura, flete, die, internos, regimen, conFranquicia });
  return {
    kg_declarado_cobrable: declarado,
    kg_presupuestado: kgPres,
    flete_puertobox_usd: flete,
    handling_puertobox_usd: handling,
    impuestos_estimados_usd: imp,
    total_estimado_usd: r2(flete + handling + imp.total),
    margen_interno_usd: r2(flete + handling - fleteCosto(kgPres)),
  };
}

module.exports = { kgCobrable, fleteVenta, fleteCosto, estimarImpuestos, presupuesto };
