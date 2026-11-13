'use strict';
/** Buscador NCM. Uso: node ncm/buscar.js "zapatillas de cuero"   |   node ncm/buscar.js 8517.13 */
const data = require('./ncm.json');
const SIN = require('./sinonimos.json');
const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const STOP = new Set(['de','la','el','los','las','y','o','para','con','sin','en','del','a','un','una','por']);
const index = data.map((x) => ({ x, d: norm(x.d), ult: norm(x.d.split(' > ').pop()) }));

function buscar(q, n = 10) {
  const qn = norm(q).trim();
  if (/^[\d.]+$/.test(qn)) {
    const p = qn.replace(/\./g, '');
    return data.filter((x) => x.c.replace(/\./g, '').startsWith(p)).slice(0, n);
  }
  let q2 = qn;
  for (const [k, v] of Object.entries(SIN)) if (k !== '_meta' && new RegExp(`(^|\\s)${norm(k)}(\\s|$)`).test(q2)) q2 = q2.replace(norm(k), norm(v));
  const toks = q2.split(/\s+/).filter((t) => t.length > 1 && !STOP.has(t))
    .map((t) => (t.length > 4 ? t.replace(/(es|s)$/, '') : t));
  if (!toks.length) return [];
  const res = [];
  for (const it of index) {
    let s = 0, hit = 0;
    for (const t of toks) {
      const w = new RegExp(`\\b${t}(es|s|as|os|a|o)?\\b`);
      if (w.test(it.d)) { hit++; s += 2; if (w.test(it.ult)) s += 6; }
    }
    if (hit === toks.length) res.push([s, it.x]);
  }
  return res.sort((a, b) => b[0] - a[0]).slice(0, n).map((r) => r[1]);
}

module.exports = { buscar, data };
if (require.main === module) {
  const q = process.argv.slice(2).join(' ');
  for (const x of buscar(q)) {
    console.log(`${x.c}  DIE ${x.die ?? '?'}%${x.ii ? ` + internos ${x.ii * 100}%` : ''}${x.n ? `  (${x.n})` : ''}\n   ${x.d.slice(-160)}\n`);
  }
}
