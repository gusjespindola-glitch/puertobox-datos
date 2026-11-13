'use strict';
/** Modelo fijo PuertoBox: precio = USD/kg × kg + % × valor factura (mínimo). */
const path = require('path');
const precios = require(path.join(__dirname, '..', 'data', 'precios_venta.json'));
const fw = require(path.join(__dirname, '..', 'data', 'forwarder.json'));
const r2 = (n) => Math.round(n * 100) / 100;

function kgFacturable({ kg, largo, ancho, alto }) {
  const vol = largo && ancho && alto ? (largo * ancho * alto) / 5000 : 0;
  return Math.max(Math.ceil(Math.max(kg, vol) * 10) / 10, 1);
}

/** Lo que paga el cliente. */
function precioCliente({ kg, largo, ancho, alto, valorFactura, die = null }, m = precios.modelo_fijo) {
  const k = kgFacturable({ kg, largo, ancho, alto });
  const pct = die !== null && die > (m.umbral_die_alto ?? 20) ? (m.porcentaje_die_alto ?? 0.70) : m.porcentaje_valor_factura;
  const total = Math.max(m.usd_por_kg * k + pct * valorFactura, m.minimo_usd);
  return { kg_facturable: k, porcentaje: pct, total: r2(total) };
}

/** Costeo interno (guía consolidada, RI con crédito de IVA). */
function costeo({ kg, largo, ancho, alto, valorFactura, derechos = 0.20, internos = 0 }, m = precios.modelo_fijo) {
  const { kg_facturable, total } = precioCliente({ kg, largo, ancho, alto, valorFactura, die: derechos * 100 }, m);
  const flete = kg_facturable * 11;
  const cif = (valorFactura + flete) * 1.01;
  const dite = cif * (derechos + 0.03);
  const intern = (cif + dite) * internos;
  const doc = cif * fw.gastos_admin.tramos[1].porcentaje; // guía consolidada > USD 500
  const docIibb = doc * fw.gastos_admin.percepciones_iibb_sobre_admin;
  const neto = (total / 1.21) * 0.96 - flete - dite - intern - doc - docIibb;
  return { kg_facturable, precio: total, costo: r2(flete + dite + intern + doc + docIibb), neto: r2(neto) };
}

module.exports = { precioCliente, costeo, kgFacturable };
