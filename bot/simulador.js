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
  { nombre: 'Cliente que no sabe nada', msgs: ['hola', 'quiero traer cosas de china', 'ropa', 'para vender', 'no tiene marca', 'como 600 dolares', 'no se cuanto pesa'], espera: { sinPresupuesto: true, mencionaProveedor: true } },
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
];

const MULETILLAS = /^(¡?genial|¡?anotado|¡?perfecto|¡?buen[ií]simo|¡?excelente|gracias|joya|dale|tranqui)\b/i;
const JERGA = /peso bruto|volum[eé]tric|\bFOB\b|\bCIF\b|r[eé]gimen|courier comercial|peque[ñn]os env[ií]os/i;

function revisar(resp, ctx) {
  const prob = [];
  if (!resp || !resp.trim()) prob.push('respuesta vacía');
  const t = resp || '';
  const esPresupuesto = /Presupuesto PuertoBox/i.test(t);
  const sinSaludo = t.replace(/¿c[oó]mo (va|est[aá]s|and[aá]s)\?/gi, '');
  if (!esPresupuesto && (sinSaludo.match(/\?/g) || []).length > 1) prob.push('más de una pregunta');
  if (/^\[ERROR/.test(t)) prob.push('error técnico');
  if (/d[oó]nde/i.test(ctx.ultimo) && (/AMBA|CABA/.test(t) || !/La Plata/.test(t))) prob.push('ubicación mal (es La Plata, sin local)');
  if (/retir(o|ar) (en|por) (el|nuestro) local/i.test(t)) prob.push('ofrece retiro en local');
  if (!esPresupuesto && JERGA.test(t)) prob.push('usa palabras técnicas');
  if (/pesa menos/i.test(t)) prob.push('dice "si pesa menos paga menos"');
  if (/\bDHL\b/.test(t) && !/dhl|courier/i.test(ctx.ultimo)) prob.push('nombra DHL sin que pregunten');
  if (MULETILLAS.test(t.trim())) prob.push('arranca con muletilla');
  if (/^[¿¡]?\p{Ll}/u.test(t.trim())) prob.push('arranca en minúscula');
  if (/Presupuesto PuertoBox/.test(t) && !/\*Presupuesto PuertoBox\*/.test(t)) prob.push('presupuesto sin formato');
  if (/soy (una )?persona|soy humano/i.test(t)) prob.push('dice que es humano');
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
    if (e.presupuesto && !/Presupuesto PuertoBox/i.test(junto)) finales.push('no dio presupuesto');
    if (e.sinPresupuesto && /Presupuesto PuertoBox/i.test(junto)) finales.push('cotizó cuando no debía');
    if (e.mencionaProveedor && !/gross weight|proveedor/i.test(junto)) finales.push('no ayudó a pedirle el peso al proveedor');
    if (e.sinTabla && /32\/kg|28\/kg|25\/kg/.test(junto)) finales.push('recitó la tabla por kilo');
    if (e.deriva && !derivaciones.length) finales.push('no derivó a Gustavo');
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
