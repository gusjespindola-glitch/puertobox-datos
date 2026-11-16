'use strict';
/**
 * Criterios de clasificación arancelaria de ARCA (16/11, Gustavo: "quiero mi Tarifar o PCRAM").
 * Datos en ncm/criterios.json (copia en web/nomenclador/data/criterios.json): posición NCM, resumen de la mercadería,
 * N° de criterio, expediente y norma con el link al anexo oficial. Los suma una tarea semanal.
 */
const fs = require('fs');
const path = require('path');
const ARCHIVO = path.join(__dirname, '..', 'web', 'nomenclador', 'data', 'criterios.json');
let cache = null;
function datos() {
  if (!cache) { try { cache = JSON.parse(fs.readFileSync(ARCHIVO, 'utf8')); } catch (_) { cache = { normas: [], criterios: [] }; } }
  return cache;
}
const dig = (c) => String(c || '').replace(/\D/g, '');
const sinTildes = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const conNorma = (c) => { const n = datos().normas.find((x) => x.id === c.norma); return { ...c, url: n ? n.url : '' }; };

/** Criterios de la misma posición NCM (8 dígitos) que el código dado (SIM o NCM). */
function dePosicion(codigo) {
  const d = dig(codigo).slice(0, 8);
  if (d.length < 8) return [];
  return datos().criterios.filter((c) => dig(c.pos) === d).map(conNorma);
}
/** Criterios cuya descripción menciona las palabras buscadas (todas, sin tildes). */
function buscar(texto, max = 5) {
  const palabras = sinTildes(texto).split(/[^a-z0-9]+/).filter((w) => w.length > 2);
  if (!palabras.length) return [];
  return datos().criterios.filter((c) => { const t = sinTildes(c.desc); return palabras.every((w) => t.includes(w.slice(0, Math.max(4, w.length - 2)))); }).slice(0, max).map(conNorma);
}
module.exports = { datos, dePosicion, buscar };
