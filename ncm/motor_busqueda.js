'use strict';
/* Motor de búsqueda SIM compartido (Node y navegador). */
(function (root) {
  const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const STOP = new Set(['de','la','el','los','las','y','o','para','con','sin','en','del','a','un','una','por']);
  function crear(DB, SIN) {
    const T = DB.t.map(norm);
    const filas = DB.p.map(([c, die, ii, re, ids]) => ({ c, die, ii, re, ids, d: ids.map((i) => T[i]).join(' > '), u: T[ids[ids.length - 1]] }));
    const texto = (f) => f.ids.map((i) => DB.t[i]);
    function buscar(q, n = 25) {
      const qn = norm(q).trim();
      if (!qn) return [];
      if (/^[\d.]+[a-z]?$/.test(qn)) {
        const p = qn.replace(/[^0-9]/g, '');
        return filas.filter((f) => f.c.replace(/[^0-9]/g, '').startsWith(p)).slice(0, n);
      }
      let q2 = qn;
      for (const [k, v] of Object.entries(SIN || {})) {
        if (k === '_meta') continue;
        if (new RegExp('(^|\\s)' + norm(k) + '(\\s|$)').test(q2)) q2 = q2.replace(norm(k), norm(v));
      }
      const toks = q2.split(/\s+/).filter((t) => t.length > 1 && !STOP.has(t))
        .map((t) => (t.length > 4 ? t.replace(/(es|s)$/, '') : t));
      if (!toks.length) return [];
      const rx = toks.map((t) => new RegExp('\\b' + t.replace(/[^a-z0-9-]/g, '').replace(/-/g, '.?') + '(es|s|as|os|a|o)?\\b'));
      const out = [];
      for (const f of filas) {
        let s = 0, h = 0;
        for (const w of rx) if (w.test(f.d)) { h++; s += 2; if (w.test(f.u)) s += 6; }
        if (h === rx.length) out.push([s, f]);
      }
      return out.sort((a, b) => b[0] - a[0]).slice(0, n).map((r) => r[1]);
    }
    return { buscar, texto, meta: DB.meta };
  }
  if (typeof module !== 'undefined') module.exports = { crear };
  else root.MotorSIM = { crear };
})(this);
