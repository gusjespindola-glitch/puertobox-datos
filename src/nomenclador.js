'use strict';
/**
 * Nomenclador PuertoBox: motor compartido por la página (web/nomenclador) y el bot.
 * Datos: web/nomenclador/data/*.json (generados con ncm/build_nomenclador.py desde archivos de ARCA).
 */
(function (root) {
  const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const STOP = new Set(['de', 'la', 'el', 'los', 'las', 'y', 'o', 'para', 'con', 'sin', 'en', 'del', 'a', 'un', 'una', 'por']);
  const digitos = (c) => String(c).replace(/[^0-9]/g, '');
  const r2 = (n) => Math.round(n * 100) / 100;

  function crear({ sim, sufijos = {}, intervenciones = { reglas: [], organismos: {} }, sinonimos = {}, notas = {}, frecuentes = { productos: [] } }) {
    const T = sim.t;
    const TN = T.map(norm);
    const filas = sim.p.map(([c, die, dii, de, re, ri, diem, udiem, ue, ii, ids]) => ({
      c, d: digitos(c), die, dii, de, re, ri, diem, udiem, ue, ii, ids,
      txt: ids.map((i) => TN[i]).join(' > '), ult: TN[ids[ids.length - 1]],
    }));
    const porCodigo = new Map(filas.map((f) => [f.c, f]));

    const DESMONTADO = /desmontad|sin montar/;
    const enPalabras = (texto, frase) => (' ' + texto + ' ').includes(' ' + frase + ' ');
    /** Productos frecuentes (ncm/productos_frecuentes.json): gana la frase más larga que aparezca en la consulta. */
    function frecuente(qn) {
      let mejor = null;
      for (const p of frecuentes.productos || []) {
        for (const w of p.palabras) {
          const wn = norm(w).trim();
          if (enPalabras(qn, wn) && (!mejor || wn.length > mejor.largo)) mejor = { p, largo: wn.length };
        }
      }
      return mejor && mejor.p;
    }

    function buscar(q, n = 30) {
      const qn = norm(q).replace(/[^a-z0-9.\s-]/g, ' ').replace(/\s+/g, ' ').trim();
      if (!qn) return [];
      if (/^[\d.\s]+[a-z]?$/.test(qn)) {
        const p = digitos(qn);
        return filas.filter((f) => f.d.startsWith(p)).slice(0, n);
      }
      const fr = frecuente(qn);
      if (fr) {
        const quiereDesmontado = /desmont/.test(qn);
        const pref = fr.prefijos.map(digitos);
        // Dentro de las subpartidas: primero las que nombran algo de lo que pidió el cliente; después "Los demás" (la apertura general).
        const extra = qn.split(' ').filter((t) => t.length > 3 && !STOP.has(t)).map((t) => t.replace(/(es|s)$/, ''));
        const nota = (f) => extra.filter((t) => f.txt.includes(t)).length * 6 + (/^l[oa]s demas/.test(f.ult) ? 1 : 0);
        const cand = filas.filter((f) => pref.some((p) => f.d.startsWith(p)) && (quiereDesmontado || !DESMONTADO.test(f.txt)))
          .map((f, i) => ({ f, i, k: pref.findIndex((p) => f.d.startsWith(p)), s: nota(f) }))
          .sort((a, b) => b.s - a.s || a.k - b.k || a.i - b.i);
        // Una de cada subpartida primero (para que se vean todas las opciones), después el resto.
        const vistas = new Set(), primero = [], resto = [];
        for (const x of cand) (vistas.has(x.k) ? resto : (vistas.add(x.k), primero)).push(x);
        const r = [...primero.sort((a, b) => a.k - b.k), ...resto].map((x) => x.f);
        if (r.length) return r.slice(0, n).map((f) => ({ ...f, frecuente: fr.nota }));
      }
      let q2 = qn;
      for (const [k, v] of Object.entries(sinonimos)) {
        if (k.startsWith('_')) continue;
        if (new RegExp('(^|\\s)' + norm(k) + '(\\s|$)').test(q2)) q2 = q2.replace(norm(k), norm(v));
      }
      const toks = q2.split(/\s+/).filter((t) => t.length > 1 && !STOP.has(t)).map((t) => (t.length > 4 ? t.replace(/(es|s)$/, '') : t));
      if (!toks.length) return [];
      const rx = toks.map((t) => new RegExp('\\b' + t.replace(/[^a-z0-9-]/g, '').replace(/-/g, '.?') + '(es|s|as|os|a|o)?\\b'));
      const quiereDesmontado = /desmont/.test(qn);
      const todos = [], casi = [];
      for (const f of filas) {
        let s = 0, h = 0;
        for (const w of rx) if (w.test(f.txt)) { h++; s += 2; if (w.test(f.ult)) s += 6; }
        if (!h) continue;
        s -= f.c.startsWith('00') ? 50 : 0;
        if (!quiereDesmontado && DESMONTADO.test(f.txt)) s -= 20; // "presentados desmontados" (DIE 0%) casi nunca es lo que trae el cliente
        if (h === rx.length) todos.push([s, f]); else if (rx.length > 1 && h === rx.length - 1) casi.push([s, f]);
      }
      const out = todos.length ? todos : casi; // si ninguna posición tiene todas las palabras, las que tienen todas menos una
      return out.sort((a, b) => b[0] - a[0]).slice(0, n).map((x) => x[1]);
    }

    const jerarquia = (f) => f.ids.map((i) => T[i]);
    const sufijosDe = (f) => Object.keys(sufijos).filter((k) => f.d.startsWith(k)).sort((a, b) => a.length - b.length).flatMap((k) => sufijos[k].map((s) => ({ ...s, nivel: k })));
    function intervencionesDe(f) {
      const vistos = new Map();
      for (const r of intervenciones.reglas || []) {
        if (r.prefijos.some((p) => f.d.startsWith(digitos(p)))) {
          for (const o of r.organismos) if (!vistos.has(o)) vistos.set(o, { organismo: o, detalle: (intervenciones.organismos || {})[o] || '', nota: r.nota || '' });
        }
      }
      return [...vistos.values()];
    }
    const notasDe = (f) => notas[f.d.slice(0, 2)] || '';

    function ficha(codigo) {
      const f = porCodigo.get(codigo) || filas.find((x) => x.d.startsWith(digitos(codigo)));
      if (!f) return null;
      return {
        posicion: f.c, ncm: f.c.slice(0, 10), die: f.die, dii: f.dii, de: f.de, re: f.re, ri: f.ri,
        die_especifico_minimo: f.diem ? `${f.diem} ${f.udiem}`.trim() : '', unidad_estadistica: f.ue,
        impuestos_internos: f.ii, jerarquia: jerarquia(f), sufijos: sufijosDe(f), intervenciones: intervencionesDe(f), notas: notasDe(f),
      };
    }
    return { buscar, ficha, jerarquia, sufijosDe, intervencionesDe, notasDe, filas, meta: sim.meta };
  }

  /**
   * Liquidación estimada de tributos.
   * regimen: 'general' (despacho de importación), 'courier' (courier general / comercial) o 'pequenos' (pequeños envíos, uso propio).
   * Pequeños envíos según el curso (Courier 2025): DI y TE sobre (CIF - 400); hasta USD 400 FOB solo IVA.
   * Percepciones (solo régimen general, editables): IVA adicional 20% (10% si IVA 10,5%), Ganancias 6%, IIBB.
   */
  function liquidar({ regimen = 'courier', fob, flete = 0, seguro = null, die = 0, te = 3, iva = 21, internos = 0,
    percepcionIva = null, percepcionGanancias = 6, percepcionIibb = 2.5 }) {
    const seg = seguro == null ? (fob + flete) * 0.01 : seguro;
    const cif = fob + flete + seg;
    let base = cif;
    if (regimen === 'pequenos') base = fob <= 400 ? 0 : cif - 400;
    const di = base * die / 100;
    const tasa = base * te / 100;
    const baseIva = cif + di + tasa;
    const ivaM = baseIva * iva / 100;
    const intern = baseIva * internos / 100;
    const res = { cif: r2(cif), seguro: r2(seg), base_derechos: r2(base), di: r2(di), te: r2(tasa), base_iva: r2(baseIva), iva: r2(ivaM), internos: r2(intern) };
    let percep = 0;
    if (regimen === 'general') {
      const pIva = percepcionIva == null ? (iva <= 10.5 ? 10 : 20) : percepcionIva;
      res.percepcion_iva = r2(baseIva * pIva / 100);
      res.percepcion_ganancias = r2(baseIva * percepcionGanancias / 100);
      res.percepcion_iibb = r2(baseIva * percepcionIibb / 100);
      percep = res.percepcion_iva + res.percepcion_ganancias + res.percepcion_iibb;
    }
    res.tributos = r2(di + tasa + ivaM + intern);
    res.percepciones = r2(percep);
    res.total_a_pagar = r2(di + tasa + ivaM + intern + percep);
    const avisos = [];
    if (regimen !== 'general' && fob > 3000) avisos.push('Supera USD 3.000 FOB: no entra en courier.');
    if (regimen === 'pequenos') avisos.push('Pequeños envíos: uso propio, hasta 3 unidades de la misma especie y 5 envíos por año.');
    res.avisos = avisos;
    return res;
  }

  const api = { crear, liquidar, norm, digitos };
  if (typeof module !== 'undefined') module.exports = api; else root.Nomenclador = api;
})(this);
