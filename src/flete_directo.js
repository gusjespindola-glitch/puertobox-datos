'use strict';
/**
 * Modelo "flete directo" PuertoBox (desde 13/11/2026):
 * - El envío va a nombre y domicilio del cliente por courier (DHL por defecto).
 * - PuertoBox cobra SOLO el flete, por adelantado, al pesarse en el depósito de China.
 * - Impuestos y gasto administrativo los paga el cliente directo al courier.
 * - El presupuesto usa los datos del proveedor + 15% de tolerancia.
 */
const path = require('path');
const precios = require(path.join(__dirname, '..', 'data', 'precios_venta.json'));
const r2 = (n) => Math.round(n * 100) / 100;

const M = precios.flete_directo;

/** Kg cobrable: mayor entre real y volumétrico, redondeado hacia arriba a 0,5 kg, mínimo 1. */
function kgCobrable({ kg, largo, ancho, alto }) {
  const vol = largo && ancho && alto ? (largo * ancho * alto) / M.divisor_volumetrico : 0;
  return Math.max(Math.ceil(Math.max(kg, vol) * 2) / 2, 1);
}

function tramo(kg, tabla) {
  return tabla.find((t) => kg >= t.desde_kg && (t.hasta_kg === null || kg < t.hasta_kg));
}

/** Flete que cobra PuertoBox para un kg cobrable. */
function fleteVenta(kg) {
  const t = tramo(kg, M.tramos_venta);
  return t.total_usd !== undefined ? t.total_usd : r2(t.usd_kg * kg);
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
  let factorDerechos = 1;
  if (regimen === 'personal' && conFranquicia) {
    factorDerechos = valorFactura <= 400 ? 0 : (valorFactura - 400) / valorFactura;
  }
  const di = cif * factorDerechos * (die / 100);
  const te = cif * factorDerechos * 0.03;
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

/** Presupuesto firme para el cliente. */
function presupuesto({ kg, largo, ancho, alto, valorFactura, die = 0, internos = 0, regimen = 'comercial' }) {
  const declarado = kgCobrable({ kg, largo, ancho, alto });
  const kgPres = Math.ceil(declarado * (1 + M.tolerancia) * 2) / 2;
  const flete = fleteVenta(kgPres);
  const imp = estimarImpuestos({ valorFactura, flete, die, internos, regimen });
  return {
    kg_declarado_cobrable: declarado,
    kg_presupuestado: kgPres,
    flete_puertobox_usd: flete,
    impuestos_estimados_usd: imp,
    total_estimado_usd: r2(flete + imp.total),
    margen_interno_usd: r2(flete - fleteCosto(kgPres)),
  };
}

module.exports = { kgCobrable, fleteVenta, fleteCosto, estimarImpuestos, presupuesto };
