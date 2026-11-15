'use strict';
/**
 * Dólar de referencia (oficial, venta) para mostrarle al cliente la ganancia por unidad en pesos.
 * Se actualiza solo: el servidor lo pide a dolarapi.com cada 12 h y lo guarda en /data/dolar.json.
 * Si la consulta falla o trae un número raro, se queda con el último bueno o con negocio.json → dolar_referencia_ars.
 * (15/11/2026: antes había que cambiarlo a mano cada semana.)
 */
const fs = require('fs');
const path = require('path');

const URL = 'https://dolarapi.com/v1/dolares/oficial';
const base = () => require('./negocio').datos().dolar_referencia_ars;
const archivo = () => path.join(path.dirname(process.env.DATA_FILE || '/data/data.json'), 'dolar.json');

let actual = null; // { ars, fecha, fuente }

function cargar() {
  if (actual) return actual;
  try { const g = JSON.parse(fs.readFileSync(archivo(), 'utf8')); if (valido(g.ars)) actual = g; } catch { /* sin archivo todavía */ }
  return actual;
}

/** Evita que un error de la fuente meta un dólar disparatado: tiene que estar entre la mitad y el doble del de negocio.json. */
function valido(n) {
  const b = base();
  return typeof n === 'number' && n > 0 && (!b || (n >= b / 2 && n <= b * 2));
}

/** Valor a usar en los presupuestos. */
function valor() {
  const a = cargar();
  return a ? a.ars : base();
}

function info() {
  const a = cargar();
  return a ? { ...a, automatico: true } : { ars: base(), fecha: null, fuente: 'negocio.json', automatico: false };
}

/** Pide el dólar a la fuente. `pedir` se puede reemplazar en los tests. */
async function actualizar(pedir = (u) => fetch(u, { signal: AbortSignal.timeout(15000) }).then((r) => r.json())) {
  try {
    const j = await pedir(URL);
    const venta = Number(j && j.venta);
    if (!valido(venta)) { console.error('Dólar: valor descartado', j && j.venta); return false; }
    actual = { ars: Math.round(venta), fecha: j.fechaActualizacion || new Date().toISOString(), fuente: 'dolarapi.com (oficial, venta)' };
    try { fs.writeFileSync(archivo(), JSON.stringify(actual)); } catch (e) { console.error('Dólar: no se pudo guardar', e.message); }
    return true;
  } catch (e) {
    console.error('Dólar: no se pudo consultar', e.message);
    return false;
  }
}

function _reset() { actual = null; }

module.exports = { valor, info, actualizar, valido, _reset, URL };
