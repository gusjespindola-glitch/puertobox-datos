'use strict';
// Arancel ARCA que se actualiza solo (16/11, Gustavo): se prueba con los archivos reales de ARCA que están en el repo.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');

const F = path.join(__dirname, '..', 'ncm', 'fuentes_arca');
const D = path.join(__dirname, '..', 'web', 'nomenclador', 'data');
const reales = () => ({
  nomenclador: fs.readFileSync(path.join(F, 'nomenclador_12112026.txt')),
  sufijos: fs.readFileSync(path.join(F, 'sufijos_12112026.txt')),
  capitulo: fs.readFileSync(path.join(F, 'capitulo_12112026.txt')),
});

/** Zip mínimo (deflate), como el que publica ARCA. */
function zip(archivos) {
  const locales = []; const centrales = []; let off = 0;
  for (const [nombre, datos] of Object.entries(archivos)) {
    const comp = zlib.deflateRawSync(datos); const n = Buffer.from(nombre);
    const crc = zlib.crc32 ? zlib.crc32(datos) : 0;
    const l = Buffer.alloc(30); l.writeUInt32LE(0x04034b50, 0); l.writeUInt16LE(20, 4); l.writeUInt16LE(8, 8); l.writeUInt32LE(crc, 14); l.writeUInt32LE(comp.length, 18); l.writeUInt32LE(datos.length, 22); l.writeUInt16LE(n.length, 26);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(8, 10); c.writeUInt32LE(crc, 16); c.writeUInt32LE(comp.length, 20); c.writeUInt32LE(datos.length, 24); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(off, 42);
    locales.push(l, n, comp); centrales.push(c, n); off += 30 + n.length + comp.length;
  }
  const cd = Buffer.concat(centrales);
  const e = Buffer.alloc(22); e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(Object.keys(archivos).length, 8); e.writeUInt16LE(Object.keys(archivos).length, 10); e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(off, 16);
  return Buffer.concat([...locales, cd, e]);
}
const fetchZip = (buf, llamadas = []) => async (url) => { llamadas.push(url); return { ok: true, status: 200, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length) }; };

test('arma el nomenclador desde los archivos de ARCA igual que los scripts de Python (sim, notas y sufijos idénticos)', () => {
  const a = require('../src/arancel');
  const r = a.construir({ ...reales(), nombreNomenclador: 'nomenclador_12112026.txt' });
  assert.deepStrictEqual(r.sim, JSON.parse(fs.readFileSync(path.join(D, 'sim.json'), 'utf8')));
  assert.deepStrictEqual(r.notas, JSON.parse(fs.readFileSync(path.join(D, 'notas.json'), 'utf8')));
  assert.deepStrictEqual(r.sufijos, JSON.parse(fs.readFileSync(path.join(D, 'sufijos.json'), 'utf8')));
});

test('baja el zip de ARCA, instala el arancel nuevo, avisa qué cambió y no reinstala el mismo', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pb-arancel-'));
  process.env.ARANCEL_DIR = dir;
  const a = require('../src/arancel');
  try {
    const { nomenclador, sufijos, capitulo } = reales();
    // ARCA sube el DIE de las cintas kinesiológicas (3005.10.90.000W) de 10,8 a 12,6 en el arancel del 20/11.
    const txt = nomenclador.toString('latin1').replace(/^(2@3005\.10\.90\.000W\s*@[^@]*@[^@]*@)010\.80/m, '$1012.60');
    assert.notStrictEqual(txt, nomenclador.toString('latin1'), 'encontró la línea de la posición');
    const llamadas = [];
    const buf = zip({ 'capitulo_20112026.txt': capitulo, 'nomenclador_20112026.txt': Buffer.from(txt, 'latin1'), 'sufijos_20112026.txt': sufijos });
    const v0 = a.version();
    const r = await a.actualizar(fetchZip(buf, llamadas));
    assert.strictEqual(llamadas[0], 'https://serviciosweb.afip.gob.ar/aduana/arancelintegrado/archivos/arancel.zip');
    assert.strictEqual(r.nuevo, true);
    assert.deepStrictEqual(r.comparacion.cambios, [{ c: '3005.10.90.000W', dif: [{ campo: 'DIE', antes: 10.8, ahora: 12.6 }] }]);
    assert.match(r.texto, /archivos del 2026-11-20 \(antes 2026-11-12\)/);
    assert.match(r.texto, /3005\.10\.90\.000W: DIE 10\.8 → 12\.6/);
    // Desde ahora el nomenclador, el bot y la web usan el arancel nuevo.
    assert.notStrictEqual(a.version(), v0);
    assert.strictEqual(a.ruta('sim.json'), path.join(dir, 'sim.json'));
    const fila = a.leer('sim.json').p.find((f) => f[0] === '3005.10.90.000W');
    assert.strictEqual(fila[1], 12.6);
    assert.strictEqual(a.historial()[0].cambios.length, 1);
    const { ejecutar } = require('../bot/tools');
    const pos = await ejecutar('buscar_posicion', { producto: '3005.10.90' }, { telefono: '1', store: { lead: () => null, guardarLead() {} } });
    assert.match(JSON.stringify(pos), /12[.,]6/);
    // El mismo arancel otra vez: no hace nada.
    assert.strictEqual((await a.actualizar(fetchZip(buf))).nuevo, false);
    // Un arancel cortado no reemplaza al bueno.
    const corto = zip({ 'capitulo_21112026.txt': capitulo, 'nomenclador_21112026.txt': Buffer.from(txt.slice(0, 100000), 'latin1'), 'sufijos_21112026.txt': sufijos });
    await assert.rejects(a.actualizar(fetchZip(corto)), /no lo instalo/);
    assert.strictEqual(a.leer('sim.json').meta.fecha_archivos, '2026-11-20');
  } finally {
    delete process.env.ARANCEL_DIR;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('sin arancel bajado, todo sigue usando los datos del repo', () => {
  process.env.ARANCEL_DIR = path.join(os.tmpdir(), 'pb-arancel-no-existe');
  const a = require('../src/arancel');
  assert.strictEqual(a.ruta('sim.json'), path.join(D, 'sim.json'));
  assert.strictEqual(a.ruta('intervenciones.json'), path.join(D, 'intervenciones.json'));
  assert.strictEqual(a.version(), 0);
  delete process.env.ARANCEL_DIR;
});

test('la página del nomenclador sirve el arancel bajado y la lista de cambios', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pb-arancel-srv-'));
  process.env.ARANCEL_DIR = dir; process.env.ADMIN_KEY = 'clave-arancel';
  fs.writeFileSync(path.join(dir, 'sim.json'), JSON.stringify({ meta: { fecha_archivos: '2026-11-20', posiciones_sim: 1 }, t: ['x'], p: [] }));
  fs.writeFileSync(path.join(dir, 'cambios.json'), JSON.stringify([{ hasta: '2026-11-20', desde: '2026-11-12', cambios: [], altas: [], bajas: [] }]));
  delete require.cache[require.resolve('../bot/server')];
  const s = require('../bot/server').servidor().listen(0); await new Promise((r) => s.once('listening', r));
  const base = `http://127.0.0.1:${s.address().port}/nomenclador`;
  try {
    const sim = await (await fetch(`${base}/data/sim.json?key=clave-arancel`)).json();
    assert.strictEqual(sim.meta.fecha_archivos, '2026-11-20');
    const cambios = await (await fetch(`${base}/api/cambios?key=clave-arancel`)).json();
    assert.strictEqual(cambios[0].hasta, '2026-11-20');
    const html = await (await fetch(`${base}/?key=clave-arancel`)).text();
    assert.match(html, /verCambios/);
    assert.strictEqual((await fetch(`${base}/api/cambios`)).status, 401);
  } finally {
    s.close(); delete process.env.ARANCEL_DIR; fs.rmSync(dir, { recursive: true, force: true });
  }
});
