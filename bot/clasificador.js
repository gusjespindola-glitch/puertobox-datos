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
    motor = crear({ sim: d('sim.json'), sufijos: {}, intervenciones: d('intervenciones.json'), sinonimos: d('sinonimos.json'), notas: d('notas.json'), frecuentes: d('productos_frecuentes.json') });
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

// Secciones del Sistema Armonizado: primer y último capítulo de cada una (las notas de sección vienen en el texto del primer capítulo).
const SECCIONES = [['I', 1, 5], ['II', 6, 14], ['III', 15, 15], ['IV', 16, 24], ['V', 25, 27], ['VI', 28, 38], ['VII', 39, 40], ['VIII', 41, 43], ['IX', 44, 46], ['X', 47, 49], ['XI', 50, 63], ['XII', 64, 67], ['XIII', 68, 70], ['XIV', 71, 71], ['XV', 72, 83], ['XVI', 84, 85], ['XVII', 86, 89], ['XVIII', 90, 92], ['XIX', 93, 93], ['XX', 94, 96], ['XXI', 97, 97]];

/**
 * Notas legales de la sección y del capítulo (17/11/2026, Gustavo: "tomar en cuenta las notas de exclusión y la jerarquía").
 * Salen del Arancel Integrado de ARCA (notas.json). Son la base de la RGI 1: la partida se elige por su texto Y por estas notas.
 */
function notasDe(codigo) {
  const dig = String(codigo || '').replace(/\D/g, '');
  if (dig.length < 2) return { error: 'Pasá el capítulo (2 dígitos) o una posición.' };
  const cap = Number(dig.slice(0, 2));
  const notas = require('../src/arancel').leer('notas.json') || {};
  const dos = (n) => String(n).padStart(2, '0');
  const sec = SECCIONES.find(([, a, b]) => cap >= a && cap <= b);
  if (!sec) return { error: `El capítulo ${dos(cap)} no existe.` };
  const textoCap = notas[dos(cap)] || '';
  const primero = notas[dos(sec[1])] || '';
  const iCap = primero.search(new RegExp('(?:^|\\n)\\s*CAPITULO\\s+' + sec[1] + '\\s*\\n'));
  const deSeccion = /SECCION/i.test(primero) ? (iCap > 0 ? primero.slice(0, iCap) : primero) : '';
  let delCapitulo = textoCap;
  if (cap === sec[1] && iCap > 0) delCapitulo = textoCap.slice(iCap);
  const corto = (t, n) => (t.length > n ? t.slice(0, n) + '\n[…sigue: el texto completo está en el arancel de ARCA]' : t);
  return {
    seccion: sec[0], capitulos_de_la_seccion: `${dos(sec[1])} a ${dos(sec[2])}`,
    notas_de_seccion: corto(deSeccion.trim(), 9000) || 'Sin notas de sección en el archivo de ARCA.',
    notas_de_capitulo: corto(delCapitulo.trim(), 12000) || 'Sin notas de capítulo en el archivo de ARCA.',
  };
}

/** Una posición exacta de la base de ARCA (o null). */
function exacta(pos) {
  const lista = aperturas(String(pos).replace(/[^\dA-Z.]/gi, '').slice(0, 13));
  const limpio = String(pos).trim().toUpperCase();
  return lista.find((a) => a.posicion.toUpperCase() === limpio) || (lista.length === 1 ? lista[0] : null);
}

const clave = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/https?:\/\/\S+/g, (u) => u.split('?')[0]).replace(/[^a-z0-9/.:]+/g, ' ').trim().slice(0, 300);

const INSTRUCCIONES = `Sos un despachante de aduana argentino experto en clasificación arancelaria (Nomenclatura Común del MERCOSUR, Sistema Armonizado y sus Reglas Generales Interpretativas, RGI).
Tenés que encontrar la posición arancelaria correcta del producto que te pasan, completa, para importarlo a Argentina.
Clasificás como un despachante, respetando la JERARQUÍA de las reglas y las NOTAS LEGALES. Un código que aparece en internet es solo una pista: nunca alcanza por sí solo.

Reglas Generales Interpretativas (en este orden; una regla se usa solo si la anterior no resuelve):
- RGI 1: los títulos de secciones, capítulos y subcapítulos son solo indicativos. La clasificación la determinan legalmente los TEXTOS DE LAS PARTIDAS y las NOTAS DE SECCIÓN Y DE CAPÍTULO. Si una nota dice que la sección o el capítulo "no comprende" algo, ese producto NO puede ir ahí, aunque el texto parezca encajar.
- RGI 2 a): un artículo incompleto o sin terminar va en la partida del artículo completo si ya tiene sus características esenciales; también si viene desmontado o sin montar. RGI 2 b): una materia incluye sus mezclas o artículos que la contienen; si hay más de una materia, se sigue la RGI 3.
- RGI 3 (cuando dos o más partidas sirven): a) la partida más específica gana sobre la más genérica (pero si cada una se refiere solo a una parte de las materias o de los artículos de un juego, se consideran igual de específicas); b) mezclas, manufacturas de varias materias y juegos o surtidos para la venta al por menor: por la materia o el artículo que les da el CARÁCTER ESENCIAL; c) si ninguna de las anteriores resuelve, la última partida por orden de numeración entre las que pueden tenerse en cuenta.
- RGI 4: lo que no se puede clasificar con las reglas anteriores va en la partida de los artículos más análogos.
- RGI 5: a) estuches y continentes hechos para un artículo determinado, de uso prolongado y presentados con él, van con el artículo (salvo que den el carácter esencial al conjunto); b) los envases que vienen con la mercadería van con ella si son los que se usan normalmente para ese tipo de mercadería.
- RGI 6: dentro de una partida, la subpartida se elige por los textos de las subpartidas y las notas de subpartida, aplicando las reglas anteriores, y SOLO se comparan subpartidas del mismo nivel (un guion con un guion, dos guiones con dos guiones). Las notas de sección y capítulo también valen salvo disposición en contrario.
- Regla General Complementaria (MERCOSUR): las RGI se aplican igual para elegir el ítem y el subítem de la NCM (8 dígitos) dentro de la subpartida, comparando solo los del mismo nivel.

BIBLIOGRAFÍA PRIMERO (17/11, Gustavo: "que haga como NotebookLM, que se basa en la bibliografía"): tus fuentes principales son el Tarifar de Gustavo (lo vigente: criterios de clasificación de ARCA, intervenciones, regímenes, novedades) y la bibliografía de su curso de despachante, que consultás con consultar_bibliografia. Si un criterio de clasificación de ARCA del Tarifar describe el mismo producto, manda ese criterio (varias veces, con distintas palabras: nombre técnico, partida, nota, regla). Fundamentá cada paso en lo que dice la bibliografía y citala así: [Vademécum – Módulo 4, pág. 802] o [Tarifar – Criterio de clasificación ARCA 21/25 (RG 5667/2025)]. Internet es solo para entender qué es el producto. OJO: las tablas de aranceles de la bibliografía pueden estar viejas y sus columnas no siempre son el DIE (por ejemplo, el 5,50 al lado de 8708.10 es otra columna): la posición SIM vigente, su letra y el DIE salen SOLO de buscar_codigo (ARCA), y las notas legales vigentes de ver_notas.
Cómo trabajás: la MARCHA SISTEMÁTICA del curso de despachante (Instituto de Capacitación Aduanera), de lo general a lo particular, sin saltear pasos y sin preconceptos ("cada mercadería tiene un lugar en la nomenclatura, pero sólo uno": se establece y se justifica, no se adivina).
1. INDIVIDUALIZÁ la mercadería: qué es, de qué está hecha, cómo se obtiene, cómo se llama técnicamente, cómo se presenta (a granel, por unidad, en envase para la venta al por menor, en juego o surtido, desmontada), para qué fue fabricada; si tiene batería, motor, Bluetooth/WiFi; si es parte o accesorio de otra cosa. La presentación cambia la clasificación (talco a granel → Cap. 25; talco de tocador en envase con indicaciones de uso → Cap. 33). Buscá en internet el producto tal cual (nombre, modelo, link), fichas técnicas, fallos de aduana (CBP rulings, BTI de la UE) y criterios de clasificación de ARCA. Un "HS code" del proveedor o de internet es solo una pista: muchas veces está mal.
2. Criterio: productos naturales por su ORIGEN; materias primas e insumos por su NATURALEZA o COMPOSICIÓN (no por la cantidad); manufacturas por su APLICABILIDAD, es decir para qué fueron fabricadas (no por el material ni por el uso que alguien les dé). Ese mismo criterio define el carácter esencial (RGI 3 b).
3. Elegí TODAS las secciones que podrían comprenderla (por origen, por material y por aplicabilidad) y con ver_notas leé sus NOTAS DE SECCIÓN; descartá las que la excluyen.
4. Elegí los capítulos posibles de las secciones que quedan y con ver_notas leé sus NOTAS DE CAPÍTULO (OBLIGATORIO para cada capítulo candidato). Orden de importancia: notas de sección, notas de capítulo, textos de partida. Las notas de exclusión ("no comprende…") resuelven la mitad de la clasificación. En partes y accesorios (secciones XVI y XVII, capítulo 90) las notas de la sección dicen dónde van: seguilas.
5. Leé los textos de TODAS las partidas del capítulo y elegí la partida (4 dígitos) por RGI 1; solo si no alcanza, RGI 2, después 3 a), 3 b), y recién al final 3 c) o 4 (son el último recurso, no un salvavidas). Partidas nominales y genéricas antes que las residuales ("Los demás"): la residual solo si no entra en ninguna específica.
   Notas Explicativas oficiales de las RGI: 3 a) la partida que NOMBRA el artículo gana a la de una familia (afeitadora eléctrica → 85.10, no 85.09) y la que lo describe con más precisión gana (alfombras para autos → 57.03, no 87.08). 3 b) solo para mezclas, manufacturas de varias materias, uniones de artículos y SURTIDOS: es surtido si a la vez son al menos dos artículos DIFERENTES que irían en partidas distintas (seis tenedores iguales no), juntos para una misma necesidad o actividad y acondicionados para la venta directa al usuario (caja, estuche); si no, cada artículo va por separado. El carácter esencial puede salir de la materia, el volumen, la cantidad, el peso, el valor o el papel en el uso. 2 a) desmontado solo si falta únicamente montar (tornillos, remaches, soldadura), sin acabados. 5 a) el estuche va con el artículo si está hecho a medida, es de uso prolongado y se vende normalmente con él.
6. Subpartida de un guion, después de dos guiones (RGI 6, notas de subpartida, solo comparando el mismo nivel). Después la subpartida regional y el ítem NCM (Regla General Complementaria) y la apertura argentina (SIM, con su letra): usá buscar_codigo para ver TODAS las aperturas reales con su derecho. Nunca elijas una apertura especial que no aplica (por ejemplo "presentados desmontados", "para uso aeronáutico", capacidades o tensiones que no son las del producto); si no hay una específica, la de "Las demás".
Respondé SOLO con un JSON, sin texto alrededor:
{"posicion":"XXXX.XX.XX.XXXL","nombre_tecnico":"...","por_que":"una o dos líneas","informe":"la clasificación explicada como la explicaría un despachante, paso por paso (individualización, secciones y notas, partida, subpartidas), en 8 a 15 líneas, con las citas de la bibliografía entre corchetes","marcha":"secciones consideradas → sección elegida → capítulos considerados → capítulo → partida → subpartida (por ejemplo: I, VIII, XII, XX → XII → 42, 64 → 64 → 64.03 → 6403.59)","rgi_aplicadas":"por ejemplo: RGI 1 y 6","notas_revisadas":"qué notas de sección/capítulo leíste y qué exclusión descartó algún capítulo (o 'sin exclusiones que apliquen')","confianza":"alta|media|baja","alternativas":[{"posicion":"...","por_que":"..."}],"fuentes":["url", "..."]}
Si la mercadería entra en dos posiciones con derechos distintos, NUNCA elijas la de menor derecho por conveniencia: una declaración dual la Aduana la cobra al mayor derecho; poné confianza "baja" y las dos en alternativas.
"alta" solo si el producto es claro, revisaste las notas y las fuentes coinciden. Si falta un dato que cambia la posición (material, si tiene batería, etc.), confianza "baja" y decí qué dato falta en por_que.`;

// Criterios que validó Gustavo (ncm/productos_frecuentes.json): el clasificador los respeta antes que cualquier fuente de internet.
function criteriosValidados() {
  try {
    const f = require(path.join(__dirname, '..', 'web', 'nomenclador', 'data', 'productos_frecuentes.json'));
    return (f.productos || []).map((p) => `- ${p.palabras.slice(0, 4).join(', ')} → ${p.prefijos.join(' / ')}: ${p.nota || ''}`).join('\n');
  } catch { return ''; }
}
const SYSTEM = () => `${INSTRUCCIONES}\n\nCriterios validados por nuestro despachante (si el producto es uno de estos, seguilos y no hace falta buscar en internet):\n${criteriosValidados()}`;

const herramientaBiblio = {
  name: 'consultar_bibliografia',
  description: 'Busca en el Tarifar de Gustavo (criterios de clasificación de ARCA, intervenciones, regímenes courier, impuestos internos y novedades del Boletín Oficial; se actualiza solo) y en la bibliografía de su curso de despachante (Vademécum módulos 1 a 5, Manual de Clasificación Arancelaria, RGI con sus Notas Explicativas y sus apuntes), y devuelve los fragmentos más relevantes con fuente y página. Usala ANTES de decidir: con el nombre técnico del producto, la partida candidata, la nota o la regla que querés verificar. Podés usarla varias veces con distintas palabras.',
  input_schema: { type: 'object', properties: { consulta: { type: 'string', description: 'Palabras a buscar (por ejemplo: "parachoques partes vehículos 87.08", "surtido venta al por menor carácter esencial")' } }, required: ['consulta'] },
};

const herramientaNotas = {
  name: 'ver_notas',
  description: 'Devuelve las notas legales de la SECCIÓN y del CAPÍTULO del arancel (ARCA) para un capítulo: exclusiones ("no comprende"), definiciones y reglas de partes y accesorios. Usala para cada capítulo candidato ANTES de elegir la posición (RGI 1).',
  input_schema: { type: 'object', properties: { capitulo: { type: 'string', description: 'Capítulo de 2 dígitos o una posición (por ejemplo 95 o 9503.00)' } }, required: ['capitulo'] },
};

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
  const BIB = require('./bibliografia'); const conBiblio = BIB.disponible();
  const tools = [herramientaBiblio, herramientaNotas, herramientaCodigo];
  const capsVistos = new Set(); let reclamoNotas = false; let biblioUsada = false; let biblioOk = null; let reclamoBiblio = false;
  if (conWeb) tools.unshift({ type: 'web_search_20250305', name: 'web_search', max_uses: 3 });
  const messages = [{ role: 'user', content: `Producto (tal cual lo pasó el cliente):\n${producto}` }];
  for (let vuelta = 0; vuelta < 14; vuelta++) {
    let res;
    try {
      res = await llamar({ model: MODELO, max_tokens: 3000, system: [{ type: 'text', text: SYSTEM(), cache_control: { type: 'ephemeral' } }], tools, messages }, fetchImpl);
    } catch (e) {
      // Si la búsqueda web no está habilitada en la cuenta, se clasifica igual con el arancel.
      if (conWeb && /web_search|server tool|not enabled|not allowed/i.test(e.message)) return clasificarConIA(producto, fetchImpl, false);
      throw e;
    }
    const contenido = res.content || [];
    messages.push({ role: 'assistant', content: contenido });
    if (res.stop_reason === 'pause_turn') continue; // la búsqueda web sigue en otra vuelta
    const usos = contenido.filter((b) => b.type === 'tool_use' && (b.name === 'buscar_codigo' || b.name === 'ver_notas' || b.name === 'consultar_bibliografia'));
    if (usos.length) {
      const resultados = [];
      for (const b of usos) {
        if (b.name !== 'consultar_bibliografia') continue;
        const r = await BIB.consultar(b.input && b.input.consulta);
        biblioUsada = true; if (biblioOk === null || !r.error) biblioOk = !r.error;
        resultados.push([b.id, r]);
      }
      const deBiblio = new Map(resultados);
      messages.push({ role: 'user', content: usos.map((b) => {
        if (b.name === 'consultar_bibliografia') return { type: 'tool_result', tool_use_id: b.id, content: JSON.stringify(deBiblio.get(b.id)) };
        if (b.name === 'ver_notas') {
          const cap = String((b.input && b.input.capitulo) || '').replace(/\D/g, '').slice(0, 2);
          if (cap.length === 2) capsVistos.add(cap);
          return { type: 'tool_result', tool_use_id: b.id, content: JSON.stringify(notasDe(b.input && b.input.capitulo)) };
        }
        return { type: 'tool_result', tool_use_id: b.id, content: JSON.stringify(aperturas(b.input && b.input.codigo)) };
      }) });
      continue;
    }
    const texto = contenido.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
    const r = sacarJSON(texto);
    if (!r) return { error: 'El clasificador no devolvió una posición.' };
    // 17/11 (Gustavo): como NotebookLM, la clasificación se apoya en su bibliografía. Si no la consultó, se le pide una vez.
    if (conBiblio && !biblioUsada && !reclamoBiblio) {
      reclamoBiblio = true;
      messages.push({ role: 'user', content: 'Antes de confirmar: no consultaste la bibliografía del curso. Usá consultar_bibliografia (nombre técnico, partida candidata, notas que la definen), fundamentá con citas y respondé de nuevo con el JSON.' });
      continue;
    }
    // 17/11 (Gustavo): no se elige una posición sin leer las notas de su sección y capítulo (RGI 1).
    const capElegido = String(r.posicion || '').replace(/\D/g, '').slice(0, 2);
    if (capElegido.length === 2 && !capsVistos.has(capElegido)) {
      if (!reclamoNotas) {
        reclamoNotas = true;
        messages.push({ role: 'user', content: `Antes de confirmar: no leíste las notas del capítulo ${capElegido}. Usá ver_notas con ${capElegido}, revisá las exclusiones y respondé de nuevo con el JSON.` });
        continue;
      }
      return { ...r, notas_no_revisadas: true, confianza: 'baja' };
    }
    return r;
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
    // 16/11 (revisión general): antes, si fallaba, el bot cotizaba con un 20% "a ojo" y Gustavo no se enteraba.
    // Ahora: el bot busca en el arancel con buscar_posicion, marca "(a confirmar)" y a Gustavo le llega el aviso.
    const sinClasificar = (motivo) => {
      if (ctx.derivaciones) ctx.derivaciones.push({ telefono: ctx.telefono, motivo: 'confirmar_posicion', resumen: `Producto: ${producto.slice(0, 200)}\nEl clasificador no pudo elegir la posición (${String(motivo || '').slice(0, 120)}). El bot cotiza con la que encuentre en el arancel, marcada "(a confirmar)".` });
      return { error: 'No pude clasificar ahora. Usá buscar_posicion con el producto, elegí la posición que corresponda y su derecho (die) de ARCA, y en el presupuesto poné la posición con "(a confirmar)". Nuestro despachante ya recibió el aviso para confirmarla.', detalle: motivo };
    };
    if (!ia || ia.error) return sinClasificar(ia && ia.error);
    // 4. El derecho sale de la base de ARCA, nunca de la IA. Si la posición no existe, no se usa.
    const fila = exacta(ia.posicion);
    if (!fila) return sinClasificar(`la posición ${ia.posicion} no existe en el arancel de ARCA`);
    r = {
      posicion: fila.posicion, die: fila.die, internos: fila.impuestos_internos, descripcion_arancel: fila.descripcion,
      intervenciones_posibles: fila.intervenciones_posibles, nombre_tecnico: ia.nombre_tecnico, por_que: ia.por_que, rgi_aplicadas: ia.rgi_aplicadas, notas_revisadas: ia.notas_revisadas, marcha: ia.marcha,
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
    ctx.derivaciones.push({ telefono: ctx.telefono, motivo: 'confirmar_posicion', resumen: `Producto: ${producto.slice(0, 200)}\nPropuesta: ${r.posicion} (DIE ${r.die}%) – ${r.por_que || ''}${r.marcha ? `\nMarcha: ${String(r.marcha).slice(0, 200)}` : ''}${r.rgi_aplicadas ? `\nReglas: ${r.rgi_aplicadas}` : ''}${r.notas_revisadas ? `\nNotas: ${String(r.notas_revisadas).slice(0, 200)}` : ''}${alt ? `\nOtras: ${alt}` : ''}\nConfianza: ${r.confianza}` });
  }
  return {
    ...fija,
    instruccion: r.confianza === 'alta'
      ? 'Usá esta posición y este derecho (die) en `cotizar`. Queda fija para toda la charla.'
      : 'Usá esta posición y este derecho en `cotizar`, pero en el presupuesto poné la posición con "(a confirmar)": nuestro despachante la está revisando. Si en por_que falta un dato del producto (material, batería, etc.), preguntáselo al cliente.',
  };
}

/**
 * Buscador con IA del nomenclador (17/11/2026, Gustavo: "que si pego lo que pide el cliente se busque la posición como en la IA de Chrome").
 * Mismo clasificador que el bot (internet + notas legales + marcha sistemática), pero sin charla: devuelve la posición exacta de ARCA.
 */
const cacheManual = new Map(); const usoManual = { dia: '', n: 0 };
const TOPE_MANUAL = Number(process.env.CLASIFICACIONES_MANUAL_DIA || 40);
async function clasificarManual(texto, fetchImpl = fetch) {
  const producto = String(texto || '').trim().slice(0, 3000);
  if (producto.length < 3) return { error: 'Pegá lo que pidió el cliente (producto, materiales, para qué sirve, link si hay).' };
  const k = clave(producto);
  if (cacheManual.has(k)) return { ...cacheManual.get(k), de_cache: true };
  const hoy = new Date().toISOString().slice(0, 10);
  if (usoManual.dia !== hoy) { usoManual.dia = hoy; usoManual.n = 0; }
  if (usoManual.n >= TOPE_MANUAL) return { error: `Llegaste al tope de ${TOPE_MANUAL} búsquedas con IA por hoy (cuida el saldo). Mañana se renueva.` };
  usoManual.n++;
  let ia;
  try { ia = await clasificarConIA(producto, fetchImpl, true); } catch (e) { return { error: 'La IA no respondió: ' + String(e.message).slice(0, 160) }; }
  if (!ia || ia.error) return { error: (ia && ia.error) || 'La IA no devolvió una posición.' };
  const fila = exacta(ia.posicion);
  if (!fila) return { error: `La IA propuso ${ia.posicion}, pero esa posición no existe en el arancel de ARCA. Probá agregando más datos del producto.`, propuesta: ia };
  const r = {
    posicion: fila.posicion, die: fila.die, internos: fila.impuestos_internos, descripcion_arancel: fila.descripcion,
    intervenciones_posibles: fila.intervenciones_posibles, nombre_tecnico: ia.nombre_tecnico, por_que: ia.por_que, informe: ia.informe, marcha: ia.marcha,
    rgi_aplicadas: ia.rgi_aplicadas, notas_revisadas: ia.notas_revisadas,
    confianza: ['alta', 'media', 'baja'].includes(ia.confianza) ? ia.confianza : 'baja', notas_no_revisadas: !!ia.notas_no_revisadas,
    alternativas: (ia.alternativas || []).slice(0, 3).map((a) => { const f = exacta(a.posicion); return f ? { posicion: f.posicion, die: f.die, descripcion_arancel: f.descripcion, por_que: a.por_que } : null; }).filter(Boolean),
    fuentes: (ia.fuentes || []).slice(0, 4),
  };
  cacheManual.set(k, r);
  return r;
}

module.exports = { clasificarManual, clasificar, aperturas, exacta, clave, clasificarConIA, notasDe, INSTRUCCIONES };
