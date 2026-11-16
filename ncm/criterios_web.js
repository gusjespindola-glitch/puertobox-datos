'use strict';
// Copia ncm/criterios.json a la página del nomenclador (web/nomenclador/data/criterios.json) y controla que cada posición exista.
// Uso: npm run criterios
const fs = require('fs');
const path = require('path');
const c = JSON.parse(fs.readFileSync(path.join(__dirname, 'criterios.json'), 'utf8'));
const sim = require('../src/arancel').leer('sim.json');
const ncm = new Set(sim.p.map((f) => f[0].slice(0, 10)));
const normas = new Set(c.normas.map((n) => n.id));
const malos = c.criterios.filter((x) => !ncm.has(x.pos) || !normas.has(x.norma) || !/^\d{1,3}\/\d{2}$/.test(x.criterio));
if (malos.length) { console.error('Criterios con posición inexistente, norma sin link o número raro:', malos); process.exit(1); }
fs.writeFileSync(path.join(__dirname, '..', 'web', 'nomenclador', 'data', 'criterios.json'), JSON.stringify(c));
console.log(`${c.criterios.length} criterios de ${c.normas.length} normas copiados a la página.`);
