'use strict';
/**
 * Prueba completa del bot (15/11/2026, pedido de Gustavo: "quiero pruebas, que no tire fruta con la posición").
 * Corre en el servidor (usa la clave de Anthropic de Railway) y arma un informe:
 *  A. Posiciones: el clasificador con productos reales y la posición correcta según el arancel de ARCA.
 *  B. Charlas: conversaciones reales (la del arrancador tal cual, la de Agustín, etc.) con controles automáticos.
 * Gasta unos USD 2 a 3 (búsqueda web + IA). Se dispara desde /pendientes y avisa por ntfy con el link al informe.
 */
const { crearStore } = require('./store');

// Posición correcta (prefijo de 6 u 8 dígitos según ARCA). "validar": no hay una sola respuesta segura, decide Gustavo.
const PRODUCTOS = [
  { producto: 'Trípode selfie extensible 170 cm con control remoto Bluetooth y luz LED, modelo R1S-L / AL-5308. La ficha del proveedor dice HS 8513.10.', esperado: ['9620.00'], nota: 'El HS del proveedor (8513.10, linternas) está mal: es un trípode.' },
  { producto: 'Mats de yoga de TPE de 6 mm', esperado: ['9506.91'] },
  { producto: 'Mancuernas de 1 kg de hierro recubiertas en neoprene', esperado: ['9506.91'] },
  { producto: 'Bolso deportivo de poliéster con manijas', esperado: ['4202.92'] },
  { producto: 'Remeras de algodón 100% de punto, estampadas, sin marca', esperado: ['6109.10'] },
  { producto: 'Zapatillas de running, parte de arriba de tela, suela de goma, armadas', esperado: ['6404.11'], dieMayorA: 0, nota: 'Nunca la apertura "presentados desmontados" (0%).' },
  { producto: 'Auriculares inalámbricos Bluetooth in-ear con estuche cargador', esperado: ['8518.30'] },
  { producto: 'Fundas de celular de TPU transparente', esperado: ['3926.90'] },
  { producto: 'Pendrive USB de 64 GB', esperado: ['8523.51'] },
  { producto: 'Cargador de celular de pared USB-C 20 W', esperado: ['8504.40'] },
  { producto: 'Lámpara LED de escritorio con brazo flexible, enchufe 220 V', esperado: ['9405.21'] },
  { producto: 'Termo de acero inoxidable de 1 litro, aislado al vacío', esperado: ['9617.00'] },
  { producto: 'Licuadora portátil recargable por USB, 400 ml', esperado: ['8509.40'] },
  { producto: 'Smartwatch con Bluetooth que se conecta al celular', esperado: ['8517.62'] },
  { producto: 'Cable USB-C a USB-C de 1 metro', esperado: ['8544.42'] },
  { producto: 'Bloques de construcción de plástico para chicos (juguete)', esperado: ['9503.00'] },
  { producto: 'Arrancador portátil 12V para autos con compresor de aire incorporado y batería de litio, https://www.alibaba.com/product-detail/12V-Car-Jump-Starter-With-Air_1601952873179.html', esperado: ['8507.60', '8504.40', '8414.80'], validar: true, nota: 'Lo decide Gustavo (batería vs. compresor).' },
];

// Charlas reales o casi reales. "controles": qué se revisa en la última respuesta o en toda la charla.
const CHARLAS = [
  {
    nombre: 'La del arrancador, tal cual la escribió el cliente',
    msgs: ['¡Hola! Quiero más información', 'https://www.alibaba.com/product-detail/12V-Car-Jump-Starter-With-Air_1601952873179.html', 'Este seria el producto, aprox 10 unidades por avion', 'El producto te digo las medidas exactas ya que las de alibaba no son correctas 24 × 14,5 × 11 cm, producto sin caja 763 gramos, con caja 900 gramos aprox', 'si', 'no', '200 usd por semana minimo', 'es lo minimo que yo traeria', 'serian mas de 20 kgs, en la publicidad decian que arriba de 20 kg eran 16 por kilo', 'serian aprox el pedido 23 kg', 'pero me estás cotizando 82kg la unidad cuando dicen que arriba de 20kg de mercaderia son 16usd por kilo'],
    controles: [
      { que: 'no discute la publicidad ("no es nuestro precio")', mal: /no es nuestr[oa]|no puedo cotizarlo|como dice tu publicidad/i },
      { que: 'con 23 kg pregunta cuántas unidades son (no recotiza con 10)', bien: /unidades|cu[aá]nt[oa]s (arrancadores|entran|ser[ií]an)/i, en: 'con23' },
      { que: 'no pide el código postal mientras el cliente reclama', mal: /c[oó]digo postal/i, en: 'ultima' },
      { que: 'la posición no cambia entre presupuestos', posicionFija: true },
      { que: 'no nombra la posición antes del presupuesto ni se corrige sola', antesDelPresupuesto: /8507|posici[oó]n|te corrijo|sin verificar/i },
      { que: 'no toma las medidas del producto como de la caja (no dice precio cerrado)', mal: /Precio cerrado/i },
    ],
  },
  {
    nombre: 'Agustín (trípode con Bluetooth, 4 preguntas)',
    msgs: ['Hola, buen día. Nos derivaron a este número para cotizar. Estamos evaluando traer de China este producto para revender en Mercado Libre: Trípode selfie con control Bluetooth y luz, extensible a 170 cm (modelo R1S-L / AL-5308). 0,300 kg por unidad, caja de 15×15×4 cm, FOB aprox. US$ 2,20. Trae batería de litio. La ficha dice HS 8513.10. ¿Nos pasan una cotización de flete e impuestos para 100 unidades (unos 30 kg) y para 300 (unos 90 kg)? Y si pueden, también: 1. ¿Por qué régimen entra siendo para reventa, y quién figura como importador? 2. ¿Aceptan batería de litio? 3. ¿Cómo resuelven ENACOM/RAMATEL para equipos con Bluetooth? 4. ¿Dónde está su depósito en Argentina? El destino final es el interior del país. ¡Muchas gracias! Agustín – Zona Norte'],
    controles: [
      { que: 'menciona la homologación por el Bluetooth', bien: /homolog|ENACOM/i },
      { que: 'contesta lo del depósito (sin local ni depósito en Argentina)', bien: /La Plata|sin local|ni local|online/i },
      { que: 'no usa frases de call center', mal: /a la brevedad|quedamos a disposici|no dudes/i },
    ],
  },
  { nombre: 'Cita un precio de un posteo viejo', msgs: ['vi que cobran 15 dolares el kilo desde 10 kg, es asi?'], controles: [{ que: 'explica que era una tarifa anterior / dice el precio de hoy', bien: /anterior|hoy|actual/i }, { que: 'no dice "no es nuestro precio"', mal: /no es nuestr|no puedo cotiz/i }] },
  { nombre: 'Pide más información (anuncio)', msgs: ['¡Hola! Quiero más información'], controles: [{ que: 'da información antes de preguntar', bien: /China|casa|impuestos/i }] },
  { nombre: 'Pregunta aéreo o marítimo', msgs: ['remeras de algodón sin marca para vender, 100 unidades, 500 dolares, 12 kilos, una caja', 'es aereo o es maritimo?'], controles: [{ que: 'el presupuesto no pega el mensaje en inglés si no lo pidió', mal: /Could you please/i, en: 'primera' }, { que: 'la primera palabra contesta: aéreo', bien: /^\s*(Es )?a[ée]reo/i, en: 'ultima' }, { que: 'no vuelve a pedir medidas ni código postal', mal: /medidas|c[oó]digo postal/i, en: 'ultima' }, { que: 'la posición de las remeras es 6109.10', posicionEsperada: '6109.10' }] },
  { nombre: 'Dice que no', msgs: ['quiero traer ropa replica de marcas para vender', 'no graciass igualmente'], controles: [{ que: 'se despide corto, sin volver a ofrecer', mal: /presupuesto|sin marca|\?/i, en: 'ultima' }] },
  { nombre: 'Zapatillas para revender (posición y costo por unidad)', msgs: ['zapatillas de running sin marca, parte de arriba de tela, para vender, 40 pares, 800 dolares, 18 kilos, 2 cajas de 60x40x40'], controles: [{ que: 'da presupuesto', bien: /Presupuesto PuertoBox/i }, { que: 'posición 6404.11 con derechos (no la de 0%)', posicionEsperada: '6404.11', dieMayorA: 0 }, { que: 'avisa que las cajas son grandes para lo que pesan', bien: /cajas? (son|es) grandes|por tamaño|m[aá]s chicas/i }] },
  { nombre: 'Pesado y barato (como Nusse)', msgs: ['mats de yoga, pesas de 1 kg y bolsos para mi marca propia Nusse, para vender, le pago 1395 dolares, pesa 298 kg en 15 cajas'], controles: [{ que: 'informativo: qué hace con un flete mayor que la mercadería', info: true }] },
  // Charlas reales del 15/11 (auditoría de procesos): cada falla real queda como prueba fija.
  { nombre: 'Real: "Quiero más información" del anuncio (2 de 7 no contestaron más)', msgs: ['¡Hola! Quiero más información'], controles: [{ que: 'explica qué hacemos antes de preguntar', bien: /China|casa|impuestos/i, en: 'ultima' }, { que: 'pide algo fácil: foto, link o qué querés traer', bien: /foto|link|qu[eé] quer[eé]s traer/i, en: 'ultima' }, { que: 'no usa el saludo viejo', mal: /gracias por comunicarte/i }] },
  { nombre: 'Real: ropa réplica (tardó 7 mensajes en decir que no)', msgs: ['ropa', 'remeras, buzos, pantalones', 'tienen marca, son replicas'], controles: [{ que: 'dice que no traemos réplicas', bien: /r[eé]plica/i, en: 'ultima' }, { que: 'nunca pregunta si es para vender', mal: /uso propio|para vender\?/i }, { que: 'no empieza con "Por el dato"', mal: /^Por (el dato|la info)/im }] },
  { nombre: 'Real: máquina de más de 50 kg', msgs: ['Traigo maquinas de depilacion grandes, q pesan un poco mas de 50kg'], controles: [{ que: 'el límite que dice es 50 kg (no 23)', mal: /hasta 23 kg/i, en: 'ultima' }, { que: 'una máquina de más de 50 kg no se divide: no entra', mal: /dividir|divida|m[aá]s cajas/i, en: 'ultima' }] },
  { nombre: 'Real: quién figura como importador (Agustín)', msgs: ['Para reventa, ¿quién figura como importador? Tengo CUIT de monotributo'], controles: [{ que: 'dice que importa la empresa de transporte', bien: /empresa de transporte/i, en: 'ultima' }, { que: 'no dice que el cliente figura como importador', mal: /(?<!no )(?<!no lo )(figur[aá]s|figura) como importador|a nombre de quien importa/i, en: 'ultima' }] },
  { nombre: 'Real: pedido de más de USD 3.000 (sopladores)', msgs: ['80 sopladores para mineras de bitcoin (ventiladores eléctricos que se le ponen a la minera ASIC), USD 4160 en total, 307 kg en 27 cajas de 56x48x27'], controles: [{ que: 'lo divide en 2 envíos y cotiza', bien: /env[ií]o 1|2 env[ií]os/i }, { que: 'no lo deriva por el tope', mal: /lo arma nuestro despachante a medida/i }] },
];

const r2 = (n) => Math.round(n * 100) / 100;

async function probarPosiciones(fetchImpl) {
  const { clasificar } = require('./clasificador');
  const filas = [];
  for (const [i, p] of PRODUCTOS.entries()) {
    const ctx = { telefono: `prueba-pos-${i}`, store: crearStore(null), derivaciones: [], fetchImpl };
    let r;
    try { r = await clasificar({ producto_completo: p.producto }, ctx); } catch (e) { r = { error: e.message }; }
    const pos = r.posicion || '';
    const okPrefijo = p.esperado.some((e) => pos.replace(/\./g, '').startsWith(e.replace(/\./g, '')));
    const okDie = p.dieMayorA === undefined || Number(r.die) > p.dieMayorA;
    const estado = r.error ? '❌ error' : p.validar ? '🔎 validar' : okPrefijo && okDie ? '✅' : '❌';
    filas.push({ ...p, r, estado });
  }
  return filas;
}

async function probarCharlas(fetchImpl) {
  const { responder } = require('./agent');
  const { revisar } = require('./simulador');
  const salida = [];
  for (const [i, ch] of CHARLAS.entries()) {
    const store = crearStore(null);
    const tel = `prueba-charla-${i}`;
    const derivaciones = [];
    const turnos = [];
    const posiciones = [];
    for (const m of ch.msgs) {
      let resp;
      try { resp = await responder({ telefono: tel, texto: m, store, derivaciones, fetchImpl }); } catch (e) { resp = `[ERROR ${e.message}]`; }
      const lead = store.lead(tel) || {};
      if (lead.posicion_fija && /Presupuesto PuertoBox/.test(resp || '')) posiciones.push(lead.posicion_fija.posicion);
      turnos.push({ cliente: m, bot: resp || '(nada)', problemas: revisar(resp || '', { ultimo: m }) });
    }
    const todo = turnos.map((t) => t.bot).join('\n');
    const ultima = turnos[turnos.length - 1].bot;
    const con23 = (turnos.find((t) => /23 kg/.test(t.cliente)) || {}).bot || '';
    const lead = store.lead(tel) || {};
    const resultados = ch.controles.map((c) => {
      const texto = c.en === 'ultima' ? ultima : c.en === 'con23' ? con23 : c.en === 'primera' ? turnos[0].bot : todo;
      let ok = true;
      if (c.info) return { que: c.que, estado: 'ℹ️' };
      if (c.bien) ok = ok && c.bien.test(texto);
      if (c.mal) ok = ok && !c.mal.test(texto);
      if (c.posicionFija) ok = ok && new Set(posiciones).size <= 1;
      if (c.antesDelPresupuesto) { const i = turnos.findIndex((t) => /Presupuesto PuertoBox/.test(t.bot)); ok = ok && !turnos.slice(0, i < 0 ? turnos.length : i).some((t) => c.antesDelPresupuesto.test(t.bot)); }
      if (c.posicionEsperada) ok = ok && String(lead.posicion || '').replace(/\./g, '').startsWith(c.posicionEsperada.replace(/\./g, ''));
      if (c.dieMayorA !== undefined) ok = ok && Number(lead.posicion_fija && lead.posicion_fija.die) > c.dieMayorA;
      return { que: c.que, estado: ok ? '✅' : '❌' };
    });
    salida.push({ nombre: ch.nombre, turnos, resultados, posicion: lead.posicion_fija, derivaciones });
  }
  return salida;
}

function informe(pos, charlas, inicio) {
  const okPos = pos.filter((f) => f.estado === '✅').length;
  const evaluables = pos.filter((f) => f.estado !== '🔎 validar').length;
  const controles = charlas.flatMap((c) => c.resultados).filter((r) => r.estado !== 'ℹ️');
  const okCh = controles.filter((r) => r.estado === '✅').length;
  const estilo = charlas.flatMap((c) => c.turnos).filter((t) => t.problemas.length).length;
  const L = [];
  L.push(`# Prueba completa del bot — ${new Date(inicio).toISOString().slice(0, 16).replace('T', ' ')} UTC`, '');
  L.push(`**Posiciones: ${okPos} de ${evaluables} bien.** **Charlas: ${okCh} de ${controles.length} controles bien.** Mensajes con algún problema de estilo: ${estilo}.`, '');
  L.push('## A. Posiciones arancelarias', '', '| | Producto | Correcta | Dio | DIE | Confianza |', '|---|---|---|---|---|---|');
  for (const f of pos) L.push(`| ${f.estado} | ${f.producto.slice(0, 70)} | ${f.esperado.join(' o ')} | ${f.r.posicion || f.r.error || '-'} | ${f.r.die ?? '-'}% | ${f.r.confianza || '-'} |`);
  L.push('');
  for (const f of pos.filter((x) => x.estado !== '✅')) L.push(`- **${f.producto.slice(0, 60)}**: ${f.r.por_que || f.r.error || ''}${f.nota ? ` (${f.nota})` : ''}${f.r.alternativas && f.r.alternativas.length ? ` · Otras: ${f.r.alternativas.map((a) => a.posicion).join(', ')}` : ''}`);
  L.push('', '## B. Charlas', '');
  for (const c of charlas) {
    L.push(`### ${c.nombre}`, '', c.resultados.map((r) => `${r.estado} ${r.que}`).join('  \n'), '');
    if (c.posicion) L.push(`Posición usada: ${c.posicion.posicion} (${c.posicion.die}%, confianza ${c.posicion.confianza})`, '');
    for (const t of c.turnos) L.push(`**Cliente:** ${t.cliente}`, '', `**Bot:** ${t.bot.replace(/\n/g, '  \n')}`, '', t.problemas.length ? `⚠️ ${t.problemas.join(' · ')}` : '', '');
  }
  L.push(`Duración: ${Math.round((Date.now() - inicio) / 60000)} min.`);
  return { texto: L.join('\n'), resumen: `Posiciones: ${okPos}/${evaluables} bien · Charlas: ${okCh}/${controles.length} controles bien · Estilo: ${estilo} mensajes con problemas` };
}

async function correr(fetchImpl = fetch) {
  const inicio = Date.now();
  const pos = await probarPosiciones(fetchImpl);
  const charlas = await probarCharlas(fetchImpl);
  return informe(pos, charlas, inicio);
}

module.exports = { correr, informe, probarPosiciones, probarCharlas, PRODUCTOS, CHARLAS, r2 };
