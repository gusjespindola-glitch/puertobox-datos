'use strict';
/**
 * Certeza de la posición arancelaria (15/11/2026, Gustavo: "para que el presupuesto se mande solo necesito
 * certeza de que está bien; que no pase lo de hoy que le erraste dos veces de posición").
 *
 * - En el presupuestador de /charlas, Gustavo ve la posición que eligió el bot y la puede corregir.
 * - Si la corrige: se valida contra el arancel de ARCA, el presupuesto se recalcula con el derecho nuevo y
 *   el producto queda guardado como "confirmado por Gustavo" (la próxima vez el bot ya no se equivoca con ese producto).
 * - Cada presupuesto enviado suma al marcador: ¿el bot la acertó a la primera?
 * - El envío automático recién se puede prender con SEGUIDAS_PARA_AUTOMATICO aciertos seguidos.
 */
const { exacta, aperturas, clave } = require('./clasificador');

const SEGUIDAS_PARA_AUTOMATICO = 20;
const ncm8 = (p) => String(p || '').replace(/\D/g, '').slice(0, 8);

/** Posición que escribió Gustavo → fila del arancel de ARCA, o error claro. Acepta la completa o los 8 dígitos. */
function validar(texto) {
  const t = String(texto || '').trim().toUpperCase();
  if (ncm8(t).length < 8) return { error: 'Escribí la posición completa (por ejemplo 8507.60.00).' };
  const fila = exacta(t);
  if (fila) return { fila };
  const lista = aperturas(ncm8(t));
  if (!lista.length) return { error: `La posición ${t} no existe en el arancel de ARCA.` };
  const dies = [...new Set(lista.map((a) => a.die))];
  if (dies.length > 1) return { error: `La ${t} tiene aperturas con distinto derecho: ${lista.map((a) => `${a.posicion} (${a.die}%)`).join(', ')}. Elegí una completa.` };
  return { fila: lista[0] };
}

/**
 * Aplica la posición que dejó Gustavo en el presupuestador. Si es la misma, no toca nada.
 * Devuelve { cambio, error, de, a }.
 */
function aplicar(store, tel, texto, ejecutar) {
  const lead = store.lead(tel) || {};
  const fija = lead.posicion_fija;
  if (!String(texto || '').trim()) return { cambio: false };
  const actual = fija ? fija.posicion : '';
  const escrito = String(texto).trim().toUpperCase();
  // Mismos 8 dígitos sin apertura distinta escrita = la deja como está.
  if (fija && ncm8(escrito) === ncm8(actual) && (escrito.replace(/[^\dA-Z]/g, '').length <= 8 || escrito === actual.toUpperCase())) return { cambio: false };
  const v = validar(texto);
  if (v.error) return { error: v.error };
  const f = v.fila;
  if (fija && f.posicion === fija.posicion) return { cambio: false };
  const nueva = {
    ...(fija || {}), posicion: f.posicion, die: f.die, internos: f.impuestos_internos || 0, descripcion_arancel: f.descripcion,
    intervenciones_posibles: f.intervenciones_posibles, confianza: 'alta', confirmada: true,
    bot_propuso: (fija && (fija.bot_propuso || fija.posicion)) || '', por_que: 'Confirmada por nuestro despachante.',
  };
  store.guardarLead(tel, { posicion_fija: nueva, posicion: f.posicion });
  // Aprende: el mismo producto, la próxima vez, sale con la posición de Gustavo.
  if (fija && fija.producto && store.guardarClasificacion) {
    const { producto, bot_propuso, ...resto } = nueva; // eslint-disable-line no-unused-vars
    store.guardarClasificacion(clave(producto), resto);
  }
  // Recalcula el presupuesto con el derecho nuevo (misma cotización, otro derecho).
  if (lead.cotizacion && lead.cotizacion.input && ejecutar) {
    ejecutar('cotizar', { ...lead.cotizacion.input }, { telefono: tel, store, derivaciones: [] });
  }
  return { cambio: true, de: actual, a: f.posicion };
}

/**
 * Gustavo confirma la posición desde el aviso del celular (15/11, "los botones no funcionan"): si es la misma
 * que eligió el bot, queda confirmada y aprendida; si es otra, se aplica como corrección.
 */
function confirmar(store, tel, texto, ejecutar) {
  const lead = store.lead(tel) || {};
  const fija = lead.posicion_fija;
  if (!fija) return { error: 'Ese cliente todavía no tiene posición elegida.' };
  const v = validar(texto);
  if (v.error) return { error: v.error };
  if (v.fila.posicion !== fija.posicion) return aplicar(store, tel, v.fila.posicion, ejecutar);
  const nueva = { ...fija, confianza: 'alta', confirmada: true, por_que: 'Confirmada por nuestro despachante.' };
  store.guardarLead(tel, { posicion_fija: nueva, posicion: nueva.posicion });
  if (fija.producto && store.guardarClasificacion) {
    const { producto, bot_propuso, ...resto } = nueva; // eslint-disable-line no-unused-vars
    store.guardarClasificacion(clave(producto), resto);
  }
  return { cambio: false, confirmada: true, a: nueva.posicion };
}

/** Anota en el marcador si el bot acertó la posición (una vez por presupuesto enviado). */
function registrar(store, tel, token) {
  const lead = store.lead(tel) || {};
  const fija = lead.posicion_fija;
  if (!fija || !fija.posicion) return null;
  const lista = store.meta('posiciones') || [];
  if (lista.some((x) => x.token === token)) return null;
  const bot = fija.bot_propuso || fija.posicion;
  const fila = {
    token, en: new Date().toISOString(), producto: String(fija.producto || lead.producto || '').slice(0, 80),
    bot, final: fija.posicion, ok: ncm8(bot) === ncm8(fija.posicion), confianza: fija.bot_propuso ? 'corregida' : fija.confianza,
  };
  store.meta('posiciones', [...lista, fila].slice(-200));
  return fila;
}

/** Marcador: cuántas acertó, cuántas seguidas, y si ya se puede prender el envío automático. */
function marcador(store) {
  const lista = store.meta('posiciones') || [];
  let seguidas = 0;
  for (let i = lista.length - 1; i >= 0 && lista[i].ok; i--) seguidas++;
  const bien = lista.filter((x) => x.ok).length;
  return { total: lista.length, bien, seguidas, falta: Math.max(0, SEGUIDAS_PARA_AUTOMATICO - seguidas), listo: seguidas >= SEGUIDAS_PARA_AUTOMATICO, errores: lista.filter((x) => !x.ok).slice(-5) };
}

module.exports = { validar, aplicar, confirmar, registrar, marcador, SEGUIDAS_PARA_AUTOMATICO };
