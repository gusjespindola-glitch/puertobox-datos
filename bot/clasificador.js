'use strict';
/**
 * Clasificador arancelario (15/11/2026, pedido de Gustavo: "no le podés errar a la posición").
 * Hace lo mismo que hace un despachante:
 *  1. Busca el producto COMPLETO como lo pasó el cliente (descripción, modelo, link) en internet
 *     → qué es técnicamente y qué código internacional (SA, 6 dígitos) le dan proveedores, aduanas y fallos.
 *  2. Con ese código busca en el arancel oficial de ARCA (base del nomenclador) todas las aperturas argentinas.
 *  3. Elige la apertura y el derecho sale SIEMPRE de la base de ARCA, nunca de la IA.
 * El resultado queda fijo en la charla (lead.posicion_fija) y en un caché por producto: el mismo producto no se reclasifica.
 * Si no está seguro, devuelve confianza "media"/"baja" y avisa a Gustavo con las alternativas para que confirme.
 */
const path = require('path');
const { crear } = require('../src/nomenclador');

const MODELO = process.env.CLASIFICADOR_MODEL || 'claude-sonnet-5-5';
const TOPE_DIA = Number(process.env.CLASIFICACIONES_WEB_DIA || 15); // tope de clasificaciones con búsqueda web por día (cuida el saldo)

let motor = null; let motorVersion = -1;
function getMotor() {
  const arancel = require('../src/arancel'); // arancel ARCA bajado solo (16/11) o el del repo
  if (motorVersion !== arancel.version()) { motor = null; motorVersion = arancel.version(); }
  if (!motor) {
    const d = (f) => JSON.parse(require('fs').readFileSync(arancel.ruta(f), 'utf8'));
    motor = crear({ sim: d('sim.json'), sufijos: {}, intervenciones: d('intervenciones.json'), sinonimos: d('sinonimos.json'), notas: {}, frecuentes: d('productos_frecuentes.json') });
  }
  return motor;
}

/** Todas las aperturas argentinas que empiezan con un código (4, 6 u 8 dígitos, con o sin puntos). Exacto, sin buscar palabras. */
function aperturas(codigo) {
  const sim = require('../src/arancel').leer('sim.json');
  const dig = String(codigo || '').replace(/\D/g, '');
  if (dig.length < 4) return [];
  const m = getMotor();
  return sim.p.filter((f) => f[0].replace(/\D/g, '').startsWith(dig)).slice(0, 40).map((f) => {
    const fila = m.buscar(f[0], 1)[0];
    return {
      posicion: f[0], die: f[1], impuestos_internos: f[2] || 0,
      descripcion: fila ? m.jerarquia(fila).slice(-3).join(' › ') : '',
      intervenciones_posibles: fila ? m.intervencionesDe(fila).map((i) => i.organismo) : [],
    };
  });
}

/** Una posición exacta de la base de ARCA (o null). */
function exacta(pos) {
  const lista = aperturas(String(pos).replace(/[^\dA-Z.]/gi, '').slice(0, 13));
  const limpio = String(pos).trim().toUpperCase();
  return lista.find((a) => a.posicion.toUpperCase() === limpio) || (lista.length === 1 ? lista[0] : null);
}

const clave = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/https?:\/\/\S+/g, (u) => u.split('?')[0]).replace(/[^a-z0-9/.:]+/g, ' ').trim().slice(0, 300);

const INSTRUCCIONES = `Sos un despachante de aduana argentino experto en clasificación arancelaria (Nomenclatura Común del MERCOSUR, Sistema Armonizado, Reglas Generales Interpretativas).
Tenés que encontrar la posición arancelaria correcta del producto que te pasan, completa, para importarlo a Argentina.
Cómo trabajás (igual que un despachante con Google y Tarifar):
1. Leé el producto COMPLETO: qué es, para qué sirve, de qué está hecho, si tiene batería, motor, Bluetooth/WiFi, si es un conjunto o juego (RGI 3 b: carácter esencial).
2. Buscá en internet el producto tal cual (nombre, modelo, link) y "HS code" / "partida arancelaria": fichas de proveedores, fallos de aduana (CBP rulings, BTI de la UE), nomencladores. Si el proveedor da un código, verificalo: muchas veces está mal.
3. Con el código de 6 dígitos más probable, usá la herramienta buscar_codigo para ver TODAS las aperturas argentinas reales (con su derecho de importación). Si dudás entre dos partidas, buscá las dos.
4. Elegí la apertura argentina que corresponde. Nunca elijas una apertura especial que no aplica (por ejemplo "presentados desmontados", "para uso aeronáutico", capacidades o tensiones que no son las del producto); si no hay una específica, la de "Las demás".
Respondé SOLO con un JSON, sin texto alrededor:
{"posicion":"XXXX.XX.XX.XXXL","nombre_tecnico":"...","por_que":"una o dos líneas","confianza":"alta|media|baja","alternativas":[{"posicion":"...","por_que":"..."}],"fuentes":["url", "..."]}
"alta" solo si el producto es claro y las fuentes coinciden. Si falta un dato que cambia la posición (material, si tiene batería, etc.), confianza "baja" y decí qué dato falta en por_que.`;

// Criterios que validó Gustavo (ncm/productos_frecuentes.json): el clasificador los respeta antes que cualquier fuente de internet.
function criteriosValidados() {
  try {
    const f = require(path.join(__dirname, '..', 'web', 'nomenclador', 'data', 'productos_frecuentes.json'));
    return (f.productos || []).map((p) => `- ${p.palabras.slice(0, 4).join(', ')} → ${p.prefijos.join(' / ')}: ${p.nota || ''}`).join('\n');
  } catch { return ''; }
}
const SYSTEM = () => `${INSTRUCCIONES}\n\nCriterios validados por nuestro despachante (si el producto es uno de estos, seguilos y no hace falta buscar en internet):\n${criteriosValidados()}`;

const herramientaCodigo = {
  name: 'buscar_codigo',
  description: 'Devuelve todas las aperturas del arancel argentino (ARCA) que empiezan con ese código (4, 6 u 8 dígitos), con su derecho de importación (die %), impuestos internos e intervenciones posibles.',
  input_schema: { type: 'object', properties: { codigo: { type: 'string', description: 'Código SA/NCM, por ejemplo 8507.60 o 850760' } }, required: ['codigo'] },
};

async function llamar(body, fetchImpl) {
  const r = await fetchImpl('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Anthropic ${r.status}: ${await r.text()}`);
  return r.json();
}

function sacarJSON(t) {
  const m = String(t || '').match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

/** Clasificación con IA + búsqueda web + base de ARCA. Devuelve { posicion, die, ... } o { error }. */
async function clasificarConIA(producto, fetchImpl, conWeb = true) {
  const tools = [herramientaCodigo];
  if (conWeb) tools.unshift({ type: 'web_search_20250305', name: 'web_search', max_uses: 3 });
  const messages = [{ role: 'user', content: `Producto (tal cual lo pasó el cliente):\n${producto}` }];
  for (let vuelta = 0; vuelta < 8; vuelta++) {
    let res;
    try {
      res = await llamar({ model: MODELO, max_tokens: 1500, system: [{ type: 'text', text: SYSTEM(), cache_control: { type: 'ephemeral' } }], tools, messages }, fetchImpl);
    } catch (e) {
      // Si la búsqueda web no está habilitada en la cuenta, se clasifica igual con el arancel.
      if (conWeb && /web_search|server tool|not enabled|not allowed/i.test(e.message)) return clasificarConIA(producto, fetchImpl, false);
      throw e;
    }
    const contenido = res.content || [];
    messages.push({ role: 'assistant', content: contenido });
    if (res.stop_reason === 'pause_turn') continue; // la búsqueda web sigue en otra vuelta
    const usos = contenido.filter((b) => b.type === 'tool_use' && b.name === 'buscar_codigo');
    if (usos.length) {
      messages.push({ role: 'user', content: usos.map((b) => ({ type: 'tool_result', tool_use_id: b.id, content: JSON.stringify(aperturas(b.input && b.input.codigo)) })) });
      continue;
    }
    const texto = contenido.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
    return sacarJSON(texto) || { error: 'El clasificador no devolvió una posición.' };
  }
  return { error: 'El clasificador no terminó.' };
}

/**
 * Herramienta del bot. ctx: { telefono, store, derivaciones, fetchImpl }.
 * input: { producto_completo, cambiar_producto }
 */
async function clasificar(input, ctx) {
  const producto = String(input.producto_completo || '').trim();
  if (producto.length < 3) return { error: 'Pasá el producto completo como lo escribió el cliente (descripción, modelo, materiales, link).' };
  const lead = ctx.store.lead ? ctx.store.lead(ctx.telefono) : null;
  // 1. Misma charla: la posición ya elegida no cambia (salvo que el cliente cambie de producto).
  // 16/11 (charla de bombachas): clasificó "ropa interior de dama" antes de saber el material, quedó 6108.21 (algodón)
  // y el cliente después dijo "sintético". Si la posición no la confirmó Gustavo y no es de confianza alta, el bot puede
  // reclasificar UNA vez con el dato nuevo del cliente.
  const reclasifica = input.dato_nuevo && lead && lead.posicion_fija && !lead.posicion_fija.confirmada && lead.posicion_fija.confianza !== 'alta' && !lead.posicion_fija.reclasificada;
  if (lead && lead.posicion_fija && !input.cambiar_producto && !reclasifica) return { ...lead.posicion_fija, ya_fijada: true, instruccion: 'Es la misma posición que ya usaste en esta charla. Usala igual en todos los presupuestos.' };
  // 2. Caché por producto (posiciones ya clasificadas o confirmadas por Gustavo).
  const cache = ctx.store.cacheClasificacion ? ctx.store.cacheClasificacion() : {};
  const k = clave(producto);
  let r = cache[k];
  if (!r) {
    // 3. Tope diario de búsquedas web (cuida el saldo de Anthropic).
    const hoy = new Date().toISOString().slice(0, 10);
    const usadas = ctx.store.contarClasificacion ? ctx.store.contarClasificacion(hoy) : 0;
    const conWeb = usadas < TOPE_DIA;
    let ia;
    try { ia = await clasificarConIA(producto, ctx.fetchImpl || fetch, conWeb); } catch (e) { ia = { error: e.message }; }
    if (ctx.store.contarClasificacion && conWeb) ctx.store.contarClasificacion(hoy, 1);
    if (!ia || ia.error) return { error: 'No pude clasificar ahora. Cotizá con "posición a confirmar" y derecho del 20%, y avisá que nuestro despachante la confirma.', detalle: ia && ia.error };
    // 4. El derecho sale de la base de ARCA, nunca de la IA. Si la posición no existe, no se usa.
    const fila = exacta(ia.posicion);
    if (!fila) return { error: `La posición ${ia.posicion} no existe en el arancel de ARCA. Cotizá con "posición a confirmar" y derecho del 20%.` };
    r = {
      posicion: fila.posicion, die: fila.die, internos: fila.impuestos_internos, descripcion_arancel: fila.descripcion,
      intervenciones_posibles: fila.intervenciones_posibles, nombre_tecnico: ia.nombre_tecnico, por_que: ia.por_que,
      confianza: ['alta', 'media', 'baja'].includes(ia.confianza) ? ia.confianza : 'baja',
      alternativas: (ia.alternativas || []).slice(0, 3).map((a) => { const f = exacta(a.posicion); return f ? { posicion: f.posicion, die: f.die, por_que: a.por_que } : null; }).filter(Boolean),
      fuentes: (ia.fuentes || []).slice(0, 3),
      busqueda_web: conWeb,
    };
    if (ctx.store.guardarClasificacion) ctx.store.guardarClasificacion(k, r);
  }
  const fija = { ...r, producto, ...(reclasifica ? { reclasificada: true, antes: lead.posicion_fija.posicion } : {}) };
  if (ctx.store.guardarLead) ctx.store.guardarLead(ctx.telefono, { posicion_fija: fija, posicion: r.posicion });
  // 5. Si no está segura, Gustavo confirma (aviso sin pausar el chat).
  if (r.confianza !== 'alta' && ctx.derivaciones && !r.confirmada) {
    const alt = r.alternativas.map((a) => `${a.posicion} (${a.die}%)`).join(', ');
    ctx.derivaciones.push({ telefono: ctx.telefono, motivo: 'confirmar_posicion', resumen: `Producto: ${producto.slice(0, 200)}\nPropuesta: ${r.posicion} (DIE ${r.die}%) – ${r.por_que || ''}${alt ? `\nOtras: ${alt}` : ''}\nConfianza: ${r.confianza}` });
  }
  return {
    ...fija,
    instruccion: r.confianza === 'alta'
      ? 'Usá esta posición y este derecho (die) en `cotizar`. Queda fija para toda la charla.'
      : 'Usá esta posición y este derecho en `cotizar`, pero en el presupuesto poné la posición con "(a confirmar)": nuestro despachante la está revisando. Si en por_que falta un dato del producto (material, batería, etc.), preguntáselo al cliente.',
  };
}

module.exports = { clasificar, aperturas, exacta, clave, clasificarConIA, INSTRUCCIONES };
