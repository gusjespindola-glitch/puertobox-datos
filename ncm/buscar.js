'use strict';
/** Buscador SIM por consola. Uso: node ncm/buscar.js "auriculares"  |  node ncm/buscar.js 8518.30 */
const { crear } = require('./motor_busqueda');
const motor = crear(require('./sim_compacto.json'), require('./sinonimos.json'));
const SUF = require('./sufijos.json');
const sufijosDe = (c) => { const d = c.replace(/[^0-9]/g, ''); return Object.keys(SUF).filter((k) => d.startsWith(k)).flatMap((k) => SUF[k]); };
module.exports = { buscar: motor.buscar, texto: motor.texto, sufijosDe };
if (require.main === module) {
  const q = process.argv.slice(2).join(' ');
  console.log(`(ARCA, archivos del ${motor.meta.fecha_archivos})\n`);
  for (const f of motor.buscar(q, 10)) {
    const t = motor.texto(f);
    console.log(`${f.c}  DIE ${f.die}%${f.ii ? ` + internos ${(f.ii * 100).toFixed(1)}%` : ''}  RE ${f.re}%  · ${sufijosDe(f.c).length} sufijos\n   ${t.slice(-3).join(' › ')}\n`);
  }
}
