'use strict';
// 17/11/2026 21:21 (Gustavo): "desde el mismo chat poder entrar a mi base de datos, hacer el presupuesto, apretar un botón y que se suba".
const test = require('node:test');
const assert = require('node:assert');

test('presupuesto desde la charla: marca la charla, cotiza en otra pestaña (en blanco) y el PDF llega a la marcada', async () => {
  const os = require('os'); const path = require('path'); const fs = require('fs');
  const archivo = path.join(os.tmpdir(), `pb-pdc-${process.pid}.json`);
  const TEL = '5492364652566';
  const ahora = Date.now();
  fs.writeFileSync(archivo, JSON.stringify({
    chats: { [TEL]: { mensajes: [{ role: 'user', content: 'Quiero traer 10 paragolpes, 40 kg, me salen USD 600', en: ahora - 60e3 }], ultimoClienteEn: ahora - 60e3, ultimo: ahora - 60e3, nombre: 'Juan Pérez' } },
    leads: { [TEL]: { telefono: TEL, nombre: 'Juan Pérez', producto: 'Paragolpes delanteros de auto', kg: 40, valor_usd: 600 } }, vistos: [],
  }));
  process.env.ADMIN_KEY = 'clave-secreta'; process.env.DATA_FILE = archivo; process.env.YCLOUD_API_KEY = 'yc'; process.env.BUSINESS_NUMBER = '5492216826773';
  delete require.cache[require.resolve('../bot/server')];
  const srv = require('../bot/server');
  const s = srv.servidor().listen(0); await new Promise((r) => s.once('listening', r));
  const base = `http://127.0.0.1:${s.address().port}`;
  const fetchReal = globalThis.fetch; const enviados = [];
  globalThis.fetch = async (url, opt) => { if (String(url).includes('ycloud')) { enviados.push(JSON.parse(opt.body)); return { ok: true, text: async () => '' }; } return fetchReal(url, opt); };
  try {
    const cookie = 'pbk=clave-secreta';
    const pide = async (cuerpo, tel = TEL) => (await fetchReal(`${base}/nomenclador/api/presupuesto?tel=${tel}`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) })).json();
    // 1) Sin marca, el cotizador no manda a nadie.
    assert.deepStrictEqual(await (await fetchReal(`${base}/nomenclador/api/marcado`, { headers: { cookie } })).json(), {});
    assert.match((await pide({ modo: 'enviar' })).error, /ninguna charla marcada/);
    // 2) En /charlas, Gustavo marca la charla (🎯) y sigue viéndola; el cotizador (otra pestaña) muestra a quién va.
    let charlas = await (await fetchReal(`${base}/charlas?t=${srv.firma('charlas')}`)).text();
    assert.match(charlas, /🎯 Marcar para presupuestar/);
    assert.ok(!/nomenclador\/\?para=/.test(charlas), 'ya no abre el cotizador cargado con lo del chat');
    assert.strictEqual((await fetchReal(`${base}/marcar-cotizar?tel=${TEL}&v=1&t=mal`, { method: 'POST', redirect: 'manual' })).status, 401);
    assert.strictEqual((await fetchReal(`${base}/marcar-cotizar?tel=${TEL}&v=1&t=${srv.firma('cotizar:' + TEL)}`, { method: 'POST', redirect: 'manual' })).status, 303);
    charlas = await (await fetchReal(`${base}/charlas?t=${srv.firma('charlas')}`)).text();
    assert.match(charlas, /🎯 Marcada para presupuestar: <a href="#c-5492364652566"><b>Juan Pérez/);
    const c = await (await fetchReal(`${base}/nomenclador/api/marcado`, { headers: { cookie } })).json();
    assert.strictEqual(c.tel, TEL); assert.strictEqual(c.nombre, 'Juan Pérez'); assert.strictEqual(c.abierta, true);
    assert.match((await pide({ modo: 'enviar' }, '5491100000000')).error, /Cambiaste la charla marcada/);
    const params = new URLSearchParams({ valor: 600, kg: 40, cajas: 2, largo: 120, ancho: 30, alto: 30, unidades: 10, regimen: 'comercial', die: 18 }).toString();
    assert.match((await pide({ modo: 'enviar', params })).error, /posición/);
    // 4) Ver el PDF antes (no manda nada).
    const ver = await pide({ modo: 'ver', params, posicion: '8708.10.00.000C', producto: 'Paragolpes delanteros de auto', cliente: { nombre: 'Juan Pérez', iva: 'Monotributista' } });
    assert.ok(ver.ok, JSON.stringify(ver)); assert.strictEqual(enviados.length, 0);
    const pdf = await fetchReal(base + ver.ruta);
    assert.strictEqual(pdf.headers.get('content-type'), 'application/pdf');
    // 5) Mandar: llega como documento al chat del cliente, con el número del presupuesto.
    const env = await pide({ modo: 'enviar', params, posicion: '8708.10.00.000C', producto: 'Paragolpes delanteros de auto', cliente: { nombre: 'Juan Pérez', iva: 'Monotributista' } });
    assert.ok(env.ok, JSON.stringify(env));
    assert.strictEqual(env.nro, ver.nro, 'el que viste es el que mandás (mismo número)');
    assert.strictEqual(enviados.length, 1);
    assert.strictEqual(enviados[0].to, '+' + TEL);
    assert.strictEqual(enviados[0].type, 'document');
    assert.match(enviados[0].document.filename, /^Presupuesto 0001-\d{8} - Juan Pérez\.pdf$/);
    assert.match(enviados[0].document.caption, new RegExp('N° ' + env.nro));
    assert.match(env.volver, /^\/charlas\?t=.*abierto=5492364652566/);
    const db = JSON.parse(fs.readFileSync(archivo, 'utf8'));
    assert.strictEqual(db.leads[TEL].posicion_fija.posicion, '8708.10.00.000C');
    assert.strictEqual(db.leads[TEL].posicion_fija.confirmada, true);
    assert.strictEqual(db.leads[TEL].posicion_fija.die, 18); // DIE de ARCA
    assert.strictEqual(db.leads[TEL].cotizacion.input.kg, 40);
    assert.match(db.chats[TEL].mensajes.slice(-1)[0].content, /\[Gustavo\] Te paso el presupuesto formal/);
    assert.ok(db.chats[TEL].presupuestoEnviadoEn);
    assert.strictEqual(db.meta.aPresupuestar, null, 'después de mandar se saca la marca');
  } finally { globalThis.fetch = fetchReal; s.close(); }
});
