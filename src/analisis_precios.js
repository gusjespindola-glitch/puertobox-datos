'use strict';
/**
 * Análisis de precios PuertoBox: ganancia por envío y comparación con la competencia.
 * Usa los precios de data/precios_venta.json (flete_directo) y data/referencias_mercado.json.
 * Uso: npm run precios   (escribe docs/precios/AAAA-MM-DD.md)
 */
const path = require('path');
const fd = require('./flete_directo');
const precios = require(path.join(__dirname, '..', 'data', 'precios_venta.json'));
const mercado = require(path.join(__dirname, '..', 'data', 'referencias_mercado.json'));

const M = precios.flete_directo;
const PASARELA = 0.03; // pago al proveedor de flete por Alibaba
const r2 = (n) => Math.round(n * 100) / 100;

/** Ganancia de un envío de `kg` kilos cobrables declarados por el proveedor. */
function gananciaEnvio(kg) {
  const p = fd.presupuesto({ kg, valorFactura: 100 });
  const venta = p.flete_puertobox_usd + p.handling_puertobox_usd;
  const costoNormal = fd.fleteCosto(p.kg_declarado_cobrable) * (1 + PASARELA); // la caja pesa lo que dijo el proveedor
  const costoPeor = fd.fleteCosto(p.kg_presupuestado) * (1 + PASARELA); // la caja llega 15% más pesada (tope del precio firme)
  return {
    kg, kg_cotizado: p.kg_presupuestado, venta: r2(venta), por_kg: r2(venta / kg),
    ganancia: r2(venta - costoNormal), ganancia_pct: r2(((venta - costoNormal) / venta) * 100),
    ganancia_peor: r2(venta - costoPeor),
  };
}

/** Precio por kilo de un competidor para `kg` (número fijo o tramos tipo "15-65kg", "100kg+", "particular"). */
function precioCompetidor(valor, kg) {
  if (typeof valor === 'number') return valor;
  if (!valor || typeof valor !== 'object') return null;
  for (const [k, v] of Object.entries(valor)) {
    const m = /^(\d+)(?:-(\d+))?kg(\+)?$/.exec(k);
    if (m) {
      const desde = +m[1], hasta = m[2] ? +m[2] : Infinity;
      if (kg >= desde && kg <= hasta) return v;
    }
  }
  return valor.particular ?? null; // AeroEnvíos: tarifa particular por defecto
}

function competenciaPara(kg) {
  return mercado.competencia
    .map((c) => ({ nombre: c.nombre, usd_kg: precioCompetidor(c.china_usd_kg, kg) }))
    .filter((c) => c.usd_kg != null);
}

const mediana = (xs) => { const s = [...xs].sort((a, b) => a - b); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };

function analizar(kgs = [0.5, 1, 2, 3, 5, 8, 10, 15, 20, 30, 50]) {
  return kgs.map((kg) => {
    const g = gananciaEnvio(kg);
    const comp = competenciaPara(kg);
    const med = mediana(comp.map((c) => c.usd_kg));
    const alertas = [];
    if (g.ganancia_peor < 0) alertas.push('PODÉS PERDER si la caja llega 15% más pesada');
    else if (g.ganancia < 10) alertas.push('ganancia baja (menos de USD 10)');
    if (med && g.por_kg > med * 1.25) alertas.push(`caro: ${Math.round((g.por_kg / med - 1) * 100)}% arriba de la mediana del mercado`);
    if (med && g.por_kg < med * 0.8) alertas.push('barato vs mercado: hay margen para subir');
    return { ...g, mercado_mediana_kg: med, mercado_min_kg: comp.length ? Math.min(...comp.map((c) => c.usd_kg)) : null, alertas };
  });
}

function informe(fecha = new Date().toISOString().slice(0, 10)) {
  const filas = analizar();
  const t = [
    `# Análisis de precios PuertoBox — ${fecha}`,
    '',
    'Precio de venta = flete firme (peso del proveedor + 15%) + handling USD 10. Costo = tarifa DHL de Howard + 3% de pasarela.',
    '"Peor caso" = la caja llega 15% más pesada (lo máximo que absorbe el precio firme).',
    'Competencia: precio por kilo publicado (referencias_mercado.json), sin mínimos, recargos ni domicilio: es orientativo.',
    '',
    '| Kg proveedor | Kg cotizado | Cobrás | USD/kg | Ganás | Margen | Ganás peor caso | Mercado mediana USD/kg | Mercado mín. | Alertas |',
    '|---|---|---|---|---|---|---|---|---|---|',
    ...filas.map((f) => `| ${f.kg} | ${f.kg_cotizado} | ${f.venta} | ${f.por_kg} | ${f.ganancia} | ${f.ganancia_pct}% | ${f.ganancia_peor} | ${f.mercado_mediana_kg ?? '—'} | ${f.mercado_min_kg ?? '—'} | ${f.alertas.join('; ') || 'OK'} |`),
    '',
    `Fuente de costos: ${M.fuente_costos}. Competencia actualizada: ${mercado._meta.actualizado}.`,
  ];
  return { texto: t.join('\n'), filas };
}

module.exports = { gananciaEnvio, precioCompetidor, competenciaPara, analizar, informe };

if (require.main === module) {
  const fs = require('fs');
  const fecha = new Date().toISOString().slice(0, 10);
  const { texto } = informe(fecha);
  const dir = path.join(__dirname, '..', 'docs', 'precios');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${fecha}.md`), texto + '\n');
  console.log(texto);
}
