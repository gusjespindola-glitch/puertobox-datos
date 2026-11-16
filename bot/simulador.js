'use strict';
/**
 * Simulador de clientes: corre conversaciones de prueba contra el bot real (Claude + herramientas)
 * y revisa cada respuesta con reglas automáticas. Necesita ANTHROPIC_API_KEY (gasta centavos).
 * Uso: ANTHROPIC_API_KEY=... npm run simular    → escribe docs/pruebas/AAAA-MM-DD.md
 */
const fs = require('fs');
const path = require('path');
const { responder } = require('./agent');
const { crearStore } = require('./store');

// Cada escenario: mensajes del cliente en orden y qué tiene que pasar.
const ESCENARIOS = [
  { nombre: 'Cliente que no sabe nada', msgs: ['hola', 'quiero traer cosas de china', 'ropa', 'para vender', 'no tiene marca', 'como 600 dolares', 'no se cuanto pesa'], espera: { sinPresupuesto: true, mencionaProveedor: true, contiene: /Could you please/i } },
  { nombre: 'Manda todo junto', msgs: ['Hola, quiero traer 2 cajas de remeras sin marca para vender, pago 700 usd, pesan 30 kilos, cada caja 50x40x50'], espera: { presupuesto: true } },
  { nombre: 'Uso propio chico', msgs: ['hola quiero traer unas zapatillas para mi', 'sin marca', '80 dolares', '2 kilos'], espera: { presupuesto: true } },
  { nombre: 'Se va de tema', msgs: ['hola', 'quiero traer juguetes', 'che y ustedes donde estan?', 'para vender'], espera: {} },
  { nombre: 'Pregunta el kilo', msgs: ['cuanto sale el kilo?'], espera: { sinTabla: true } },
  { nombre: 'Marca para revender', msgs: ['quiero traer zapatillas nike para vender en mi local'], espera: { sinPresupuesto: true } },
  { nombre: 'Celulares para revender', msgs: ['quiero traer 20 celulares para vender'], espera: { sinPresupuesto: true } },
  { nombre: 'Termos para revender', msgs: ['quiero traer termos sin marca para vender', '500 dolares', '15 kilos'], espera: { sinPresupuesto: true } },
  { nombre: 'Perfumes', msgs: ['traen perfumes?'], espera: { sinPresupuesto: true } },
  { nombre: 'Mensaje cortado', msgs: ['hola quiero tr'], espera: {} },
  { nombre: 'Pregunta si es bot', msgs: ['sos un bot?'], espera: { noDiceHumano: true } },
  { nombre: 'Quiere pagar', msgs: ['quiero traer remeras sin marca para vender, 300 usd, 5 kilos, 1 caja 40x30x30', 'dale quiero avanzar como pago?'], espera: { deriva: true } },
  { nombre: 'Mayorista', msgs: ['necesito traer un contenedor de muebles'], espera: { deriva: true } },
  { nombre: 'Pedido grande por courier', msgs: ['quiero traer remeras estampadas sin marca para vender', 'le pago 8000 dolares al proveedor'], espera: { sinPresupuesto: true, contiene: /pes|kilo|caja/i } },
  { nombre: 'Juguetes para vender (certificación)', msgs: ['quiero traer juguetes sin marca para vender, pago 400 usd, son 12 kilos en una caja de 40x30x30'], espera: { presupuesto: true, contiene: /certific/i } },
  { nombre: 'Cargadores para vender (seguridad eléctrica)', msgs: ['cargadores de celular sin marca para vender, 250 dolares, 6 kilos'], espera: { presupuesto: true, contiene: /certific/i } },
  { nombre: 'Caja de más de 23 kg', msgs: ['mochilas sin marca para vender, 900 usd, una sola caja de 30 kilos'], espera: { presupuesto: true, contiene: /divid|23 ?kg/i } },
  { nombre: 'Uso propio de más de USD 400', msgs: ['unas zapatillas sin marca para mi, pago 600 dolares, pesan 3 kilos'], espera: { presupuesto: true } },
  { nombre: 'Valor no creíble', msgs: ['un robot de cocina de 25 kilos que me sale 60 dolares, para vender, sin marca'], espera: { sinPresupuesto: true } },
  { nombre: 'Pregunta el plazo', msgs: ['cuanto tarda en llegar?'], espera: { noContiene: /\b\d+\s*(a\s*\d+\s*)?d[ií]as\b/i } },
  { nombre: 'Pregunta cómo se paga', msgs: ['como se paga?'], espera: { contiene: /dep[oó]sito|pes/i } },
  { nombre: 'Manda un audio', msgs: ['[El cliente mandó un audio. Pedile que lo describa por texto o derivá si hace falta.]'], espera: { contiene: /escrib|texto/i } },
  { nombre: 'Zona alejada', msgs: ['remeras sin marca para vender, 300 usd, 5 kilos, una caja de 40x30x30', 'mi codigo postal es 9410, ushuaia'], espera: { presupuesto: true, contiene: /recargo|zona/i } },
  { nombre: 'Monotributista', msgs: ['soy monotributista, puedo importar para vender?'], espera: { sinPresupuesto: true, contiene: /s[ií]/i, noContiene: /responsable inscripto es obligatorio/i } },
  { nombre: 'Envíos por año', msgs: ['cuantos envios puedo hacer por año?'], espera: { contiene: /5/ } },
  { nombre: 'Auriculares bluetooth para vender', msgs: ['quiero traer auriculares bluetooth sin marca para vender'], espera: { sinPresupuesto: true } },
  { nombre: 'Uso propio con más de 3 iguales', msgs: ['quiero traer 6 remeras sin marca para mi, 60 dolares, 2 kilos'], espera: { contiene: /vender|iguales|misma/i } },
  { nombre: 'Sin medidas no hay presupuesto (Gustavo 15/11 17:59)', msgs: ['remeras sin marca para vender, 300 usd, 5 kilos, una caja, no tengo las medidas'], espera: { sinPresupuesto: true, contiene: /Could you please/i } },
  { nombre: 'Licuadoras para vender (sin permiso de envases)', msgs: ['licuadoras sin marca para vender, 500 dolares, 15 kilos, una caja de 40x30x30'], espera: { presupuesto: true, contiene: /certific/i } },
  { nombre: 'Envío dentro de China', msgs: ['quien paga el envio de la fabrica hasta el deposito?'], espera: { sinPresupuesto: true, contiene: /proveedor/i } },
  { nombre: 'Audio pasado a texto', msgs: ['[Audio del cliente, pasado a texto automáticamente] hola buen día quería saber cuánto me sale traer unas mochilas sin marca para vender, son como 400 dólares y pesan 8 kilos, vienen en una caja de 40 por 30 por 30'], espera: { presupuesto: true, noContiene: /no (puedo )?escuch/i } },
  { nombre: 'Marca desconocida para vender (INPI)', msgs: ['cargadores marca Baseus para vender, 300 dolares, 5 kilos, una caja de 40x30x30'], espera: { presupuesto: true, deriva: true } },
  { nombre: 'Fundas para vender (respuesta clara)', msgs: ['quiero traer fundas de celular para vender'], espera: { contiene: /\bs[ií]\b|traemos/i } },
  // 15/11: charla real del arrancador (10 unidades de 0,9 kg que pasaron a "23 kg"): el bot recotizó con las 10 unidades viejas,
  // el costo por unidad saltó a USD 82 y el cliente lo leyó como precio por kilo; después negó el precio de la publicidad y repitió el código postal.
  { nombre: 'Cambia el peso: preguntar unidades nuevas', msgs: ['arrancadores portatiles 12V sin marca para vender, 10 unidades, cada una pesa 900 gramos con caja, le pago 200 dolares en total', 'serian mas de 20 kilos, unos 23 kg'], espera: { ultima: { contiene: /unidades/i, noContiene: /Presupuesto PuertoBox/i } } },
  { nombre: 'Compara con el precio de la publicidad', msgs: ['remeras sin marca para vender, 100 unidades, pago 500 dolares, 23 kilos, una caja de 40x30x30', 'en la publicidad decian que arriba de 20 kg es 16 por kilo, por que me cobras mas?'], espera: { presupuesto: true, ultima: { contiene: /kilo/i, noContiene: /no es (nuestr[oa]|el nuestro)|no puedo cotiz|como dice tu publicidad|c[oó]digo postal/i } } },
  { nombre: 'Confunde costo por unidad con el kilo', msgs: ['remeras sin marca para vender, 100 unidades, pago 500 dolares, 23 kilos, una caja de 40x30x30', 'me estas cobrando 13 dolares el kilo? no tiene sentido'], espera: { ultima: { contiene: /unidad|remera/i, noContiene: /c[oó]digo postal/i } } },
  { nombre: 'Se enoja y pide una persona', msgs: ['remeras sin marca para vender, 300 usd, 5 kilos, una caja de 40x30x30', 'no entiendo nada, esto es un papelon, quiero hablar con una persona'], espera: { deriva: true, ultima: { noContiene: /c[oó]digo postal/i } } },
  // 15/11 (Gustavo: "la charla es muy bot"): que suene a persona y conteste lo que le preguntan.
  { nombre: 'Cita un precio de un posteo viejo', msgs: ['vi que cobran 15 dolares el kilo desde 10 kg, es asi?'], espera: { ultima: { contiene: /anterior|hoy/i, noContiene: /no es nuestr|no puedo cotiz/i } } },
  { nombre: 'Posición fija entre presupuestos', msgs: ['arrancador portatil 12V con compresor de aire y bateria de litio, sin marca, para vender, 10 unidades, 200 dolares, 9 kilos, una caja de 40x30x30', '25 unidades, 500 dolares, 23 kilos'], espera: { presupuesto: true } },
  { nombre: 'Pide más información (anuncio)', msgs: ['¡Hola! Quiero más información'], espera: { ultima: { contiene: /China|casa|impuestos/i } } },
  { nombre: 'Pregunta aéreo o marítimo', msgs: ['remeras sin marca para vender, 300 usd, 5 kilos, una caja de 40x30x30', 'es aereo o es maritimo?'], espera: { ultima: { contiene: /^\s*(Es )?a[ée]reo/i, noContiene: /medidas|c[oó]digo postal/i } } },
  { nombre: 'Dice que no', msgs: ['quiero traer ropa replica de marcas para vender', 'no graciass igualmente'], espera: { ultima: { noContiene: /presupuesto|sin marca|\?/i } } },
  { nombre: 'Repuestos de auto', msgs: ['repuestos de auto genericos para vender, 800 dolares, 20 kilos, 2 cajas de 50x40x40'], espera: { presupuesto: true } },
];

const MULETILLAS = /^(¡?genial|¡?anotado|¡?perfecto|¡?buen[ií]simo|¡?excelente|gracias(?! por escribir)|joya|dale|tranqui|entendido|entiendo|comprendido|correcto)\b/i;
const JERGA = /peso bruto|volum[eé]tric|\bFOB\b|\bCIF\b|r[eé]gimen|courier comercial|peque[ñn]os env[ií]os|\bANMAT\b|\bINAL\b|\bSENASA\b/i;

function revisar(resp, ctx) {
  const prob = [];
  if (!resp || !resp.trim()) prob.push('respuesta vacía');
  const t = resp || '';
  const esPresupuesto = /\*Presupuesto(?: PuertoBox)?\*/i.test(t);
  const sinSaludo = t.replace(/¿c[oó]mo (va|est[aá]s|and[aá]s)\?/gi, '');
  if (!esPresupuesto && (sinSaludo.match(/\?/g) || []).length > 1) prob.push('más de una pregunta');
  if (/^\[ERROR/.test(t)) prob.push('error técnico');
  if (/d[oó]nde/i.test(ctx.ultimo) && (/AMBA|CABA/.test(t) || !/La Plata/.test(t))) prob.push('ubicación mal (es La Plata, sin local)');
  if (/retir(o|ar) (en|por) (el|nuestro) local/i.test(t)) prob.push('ofrece retiro en local');
  if (!esPresupuesto && JERGA.test(t)) prob.push('usa palabras técnicas');
  if (/pesa menos[^.]{0,40}(paga|pag[aá]s|sale) menos/i.test(t)) prob.push('dice "si pesa menos paga menos"');
  if (/\bDHL\b/.test(t) && !/dhl|courier/i.test(ctx.ultimo)) prob.push('nombra DHL sin que pregunten');
  if (MULETILLAS.test(t.trim())) prob.push('arranca con muletilla');
  if (/al toque|\bjoya\b|\bche\b|\btranqui\b|buen[ií]simo|\bposta\b|\bre (bien|lindo)\b/i.test(t)) prob.push('tono poco profesional');
  if (/\p{Extended_Pictographic}/u.test(t)) prob.push('usa emojis');
  if (/^[¿¡]?\p{Ll}/u.test(t.trim())) prob.push('arranca en minúscula');
  if (esPresupuesto && !/\*Total: USD/i.test(t)) prob.push('presupuesto sin "*Total: USD"');
  if (esPresupuesto && (t.match(/PuertoBox/g) || []).length > 1) prob.push('presupuesto repite "PuertoBox" (16/11)');
  if (esPresupuesto && t.split('\n').filter((l) => l.trim()).length > 14) prob.push('presupuesto largo: más de 14 líneas (16/11)');
  if (esPresupuesto && /total estimado/i.test(t)) prob.push('mezcla PuertoBox e impuestos en un solo total');
  if (/se pueden? evaluar|lo evaluamos|lo analizamos|tenemos contemplad|en principio/i.test(t)) prob.push('frase vacía ("se puede evaluar", "contemplado"...)');
  if (/[?!]\.(\s|$)/.test(t)) prob.push('puntuación rara ("?.")');
  if (/Gustavo/.test(t)) prob.push('nombra a Gustavo (tiene que decir "nuestro despachante")');
  if (/(pag[aá]s|paga|pagan)[^.]{0,20}al courier/i.test(t)) prob.push('dice que se paga al courier (tiene que decir "la empresa de transporte")');
  if (/soy (una )?persona|soy humano/i.test(t)) prob.push('dice que es humano');
  if (/no es nuestr[oa] (precio|tarifa)|no puedo cotizarlo|como dice tu publicidad/i.test(t)) prob.push('discute el precio de la publicidad en vez de dar el kilo de su presupuesto');
  // 15/11 (Gustavo: "es muy bot"): frases de robot o de call center.
  if (/^(por el dato|por la info|por el link|por escribirnos|por los datos|por tu consulta)\b/i.test(t.trim())) prob.push('arranca con frase cortada ("Por el dato.")');
  if (/a la brevedad|le informamos|quedamos a (tu |su )?disposici[oó]n|no dudes en consultar|gratis y sin compromiso|tomamos \d/i.test(t)) prob.push('frase de plantilla o call center');
  if (!esPresupuesto && (t.length > 420 || t.split('\n').filter((l) => l.trim()).length > 5)) prob.push('mensaje largo (no es presupuesto)');
  return prob;
}

async function correrEscenarios() {
  const salida = [`# Pruebas del bot — ${new Date().toISOString().slice(0, 10)}`, ''];
  let fallas = 0;
  for (const [i, esc] of ESCENARIOS.entries()) {
    const store = crearStore(null);
    const tel = '549000000' + String(i).padStart(4, '0');
    const derivaciones = [];
    salida.push(`## ${esc.nombre}`, '');
    const todas = [];
    for (const m of esc.msgs) {
      let resp;
      try { resp = await responder({ telefono: tel, texto: m, store, derivaciones }); } catch (e) { resp = `[ERROR ${e.message}]`; }
      todas.push(resp || '');
      const prob = revisar(resp, { ultimo: m });
      fallas += prob.length;
      salida.push(`**Cliente:** ${m}`, '', `**Bot:** ${(resp || '(nada)').replace(/\n/g, '  \n')}`, '', prob.length ? `❌ ${prob.join(' · ')}` : '✅', '');
    }
    const junto = todas.join('\n');
    const e = esc.espera;
    const finales = [];
    if (e.presupuesto && !/\*Presupuesto(?: PuertoBox)?\*/i.test(junto)) finales.push('no dio presupuesto');
    if (e.sinPresupuesto && /\*Presupuesto(?: PuertoBox)?\*/i.test(junto)) finales.push('cotizó cuando no debía');
    if (e.mencionaProveedor && !/gross weight|proveedor/i.test(junto)) finales.push('no ayudó a pedirle el peso al proveedor');
    if (e.sinTabla && /32\/kg|28\/kg|25\/kg/.test(junto)) finales.push('recitó la tabla por kilo');
    if (e.deriva && !derivaciones.length) finales.push('no derivó a Gustavo');
    if (e.contiene && !e.contiene.test(junto)) finales.push(`le faltó mencionar ${e.contiene}`);
    if (e.noContiene && e.noContiene.test(junto)) finales.push(`no debía decir ${e.noContiene}`);
    // Revisión solo de la última respuesta (para ver cómo reacciona a un cambio o a una queja).
    const ultima = todas[todas.length - 1] || '';
    if (e.ultima?.contiene && !e.ultima.contiene.test(ultima)) finales.push(`al final le faltó mencionar ${e.ultima.contiene}`);
    if (e.ultima?.noContiene && e.ultima.noContiene.test(ultima)) finales.push(`al final no debía decir ${e.ultima.noContiene}`);
    fallas += finales.length;
    salida.push(finales.length ? `**Resultado:** ❌ ${finales.join(' · ')}` : '**Resultado:** ✅', '');
  }
  salida.splice(1, 0, `Escenarios: ${ESCENARIOS.length} · Problemas encontrados: ${fallas}`);
  return salida.join('\n') + '\n';
}

async function correr() {
  if (!process.env.ANTHROPIC_API_KEY) { console.error('Falta ANTHROPIC_API_KEY'); process.exit(1); }
  const texto = await correrEscenarios();
  const dir = path.join(__dirname, '..', 'docs', 'pruebas');
  fs.mkdirSync(dir, { recursive: true });
  const archivo = path.join(dir, `${new Date().toISOString().slice(0, 10)}.md`);
  fs.writeFileSync(archivo, texto);
  console.log(texto);
  console.log(`\nGuardado en ${archivo}`);
}

module.exports = { revisar, ESCENARIOS, correrEscenarios };
if (require.main === module) correr();
