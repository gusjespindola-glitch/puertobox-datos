'use strict';
/**
 * Motor de cotización PuertoBox (courier China aéreo).
 * Lee las reglas de /data. Sin dependencias. Funciona en Node y navegador
 * (en navegador, pasá los JSON con cotizar(input, datos)).
 *
 * Principio: el flete declarado para el CIF es SIEMPRE el real.
 * No existe opción para declarar un flete menor.
 */

const r2 = (n) => Math.round(n * 100) / 100;

function cargarDatos() {
  const path = require('path');
  const dir = path.join(__dirname, '..', 'data');
  return {
    regimenes: require(path.join(dir, 'regimenes.json')),
    categorias: require(path.join(dir, 'categorias.json')),
    forwarder: require(path.join(dir, 'forwarder.json')),
    precios: require(path.join(dir, 'precios_venta.json')),
  };
}

/** Peso facturable por bulto = max(real, volumétrico). Total redondeado hacia arriba. */
function pesoFacturable(bultos, divisor) {
  const detalle = bultos.map((b) => {
    const vol = b.largo && b.ancho && b.alto ? (b.largo * b.ancho * b.alto) / divisor : 0;
    return { real: b.kg, volumetrico: r2(vol), facturable: Math.max(b.kg, vol) };
  });
  const total = Math.ceil(detalle.reduce((s, d) => s + d.facturable, 0));
  return { detalle, total };
}

/** Costo USD/kg del proveedor según el tramo de kilos. */
function costoKgProveedor(kg, fw) {
  const t = fw.flete_china_aereo;
  const tramo = t.tramos.find((x) => kg >= x.desde_kg && (x.hasta_kg === null || kg < x.hasta_kg));
  if (!tramo || tramo.usd_kg === null) return { usd_kg: t.fallback_menos_10kg_usd_kg, estimado: true };
  return { usd_kg: tramo.usd_kg, estimado: false };
}

/** Recargo de aerolínea por bulto que supera el umbral de peso. */
function recargoSobrepeso(bultos, fw) {
  const s = fw.recargos.sobrepeso_bulto;
  const unitario = s.monto_rmb * s.factor * fw.tipo_cambio.rmb_a_usd;
  const cant = bultos.filter((b) => b.kg > s.umbral_kg).length;
  return { bultos: cant, usd: r2(cant * unitario), unitario_usd: r2(unitario) };
}

/** Gastos admin del proveedor por tramos de CIF. */
function gastosAdmin(cif, fw) {
  const g = fw.gastos_admin;
  const tramo = g.tramos.find((x) => cif >= x.cif_desde_usd && (x.cif_hasta_usd === null || cif < x.cif_hasta_usd));
  const admin = cif * tramo.porcentaje;
  return { porcentaje: tramo.porcentaje, admin: r2(admin), iva: r2(admin * g.iva_sobre_admin) };
}

/** Tributos aduaneros. */
function tributos({ regimen, categoria, fob, cif, enviosUsadosAnio = 0, condicionFiscal = 'no_inscripto' }, datos) {
  const reg = datos.regimenes;
  const k = reg.constantes;
  const cat = datos.categorias.categorias.find((c) => c.id === categoria);
  if (!cat) throw new Error(`Categoría desconocida: ${categoria}`);

  let factor = 1; // fracción del CIF que paga derechos y tasa
  let franquicia = false;
  if (regimen === 'pequenos_envios') {
    const pe = reg.pequenos_envios;
    if (fob > pe.tope_fob_usd) throw new Error(`FOB ${fob} supera el tope de USD ${pe.tope_fob_usd}`);
    if (enviosUsadosAnio < pe.envios_con_franquicia_por_anio) {
      franquicia = true;
      factor = fob <= pe.franquicia_fob_usd ? 0 : (fob - pe.franquicia_fob_usd) / fob;
    }
  } else if (regimen === 'courier_comercial') {
    if (fob > reg.courier_comercial.tope_fob_usd) throw new Error(`FOB ${fob} supera el tope de USD ${reg.courier_comercial.tope_fob_usd}`);
  } else {
    throw new Error(`Régimen desconocido: ${regimen}`);
  }

  const base = cif * factor;
  const derechos = base * cat.derechos;
  const tasa = base * k.tasa_estadistica;
  const baseIva = cif + derechos + tasa;
  const iva = baseIva * cat.iva;
  const internos = baseIva * cat.impuestos_internos;

  let percepciones = 0;
  const p = reg.courier_comercial.percepciones;
  if (regimen === 'courier_comercial' && p.aplicar_por_defecto) {
    const gan = condicionFiscal === 'responsable_inscripto' ? p.ganancias_ri : p.ganancias_no_inscripto;
    percepciones = baseIva * (p.iva_adicional_ri + gan);
  }

  const total = derechos + tasa + iva + internos + percepciones;
  return {
    categoria: cat.nombre,
    franquicia,
    fraccion_gravada: r2(factor),
    derechos: r2(derechos),
    tasa_estadistica: r2(tasa),
    iva: r2(iva),
    impuestos_internos: r2(internos),
    percepciones: r2(percepciones),
    total: r2(total),
  };
}

/**
 * Cotización completa.
 * input: { regimen, categoria, fob, bultos:[{kg, largo, ancho, alto}], litio,
 *          enviosUsadosAnio, condicionFiscal, kgSalidaConsolidada, trasladarAdmin }
 * kgSalidaConsolidada: kilos totales de la salida semanal (define el tramo de costo).
 */
function cotizar(input, datos = cargarDatos()) {
  const { regimenes: reg, forwarder: fw, precios } = datos;
  const k = reg.constantes;
  const pv = precios.china_aereo;

  const peso = pesoFacturable(input.bultos, k.divisor_volumetrico);
  const kgCobrar = Math.max(peso.total, pv.minimo_facturable_kg);

  // Costo proveedor
  const kgTramo = input.kgSalidaConsolidada || peso.total;
  const ck = costoKgProveedor(kgTramo, fw);
  let fleteCosto = peso.total * ck.usd_kg;
  if (input.litio) fleteCosto *= fw.recargos.bateria_litio.valor;
  const sobrepeso = recargoSobrepeso(input.bultos, fw);
  const fleteReal = fleteCosto + sobrepeso.usd;

  // CIF con flete REAL
  const seguro = (input.fob + fleteReal) * k.seguro_sobre_fob_mas_flete;
  const cif = input.fob + fleteReal + seguro;

  const adm = gastosAdmin(cif, fw);
  const pasarela = (fleteReal + adm.admin) * fw.pasarela.porcentaje;
  const trib = tributos({ ...input, cif }, datos);

  // Precio al cliente
  const fleteCliente = kgCobrar * pv.usd_kg * (input.litio ? fw.recargos.bateria_litio.valor : 1);
  const trasladarAdmin = input.trasladarAdmin !== false; // por defecto se traslada
  const gestionCliente = pv.fee_gestion_usd + (trasladarAdmin ? adm.admin + adm.iva : 0);
  const totalCliente = fleteCliente + sobrepeso.usd + gestionCliente + trib.total;

  // Costo y ganancia (tributos son pass-through: se cobran y se pagan igual)
  const costoTotal = fleteReal + adm.admin + adm.iva + pasarela;
  const ingresoPropio = fleteCliente + sobrepeso.usd + gestionCliente;
  const ganancia = ingresoPropio - costoTotal;

  return {
    peso: { ...peso, cobrado_kg: kgCobrar },
    costo: {
      usd_kg_proveedor: ck.usd_kg,
      usd_kg_estimado: ck.estimado,
      flete: r2(fleteCosto),
      sobrepeso: sobrepeso,
      admin: adm,
      pasarela: r2(pasarela),
      total: r2(costoTotal),
    },
    aduana: { seguro: r2(seguro), cif: r2(cif), tributos: trib },
    cliente: {
      flete: r2(fleteCliente),
      recargo_sobrepeso: sobrepeso.usd,
      gestion: r2(gestionCliente),
      tributos: trib.total,
      total: r2(totalCliente),
    },
    ganancia: r2(ganancia),
    margen_sobre_ingreso: ingresoPropio ? r2(ganancia / ingresoPropio) : 0,
  };
}

module.exports = { cotizar, tributos, pesoFacturable, costoKgProveedor, recargoSobrepeso, gastosAdmin, cargarDatos };
