'use strict';
/**
 * Presupuesto desde una charla (15/11/2026, Gustavo): "que al ir al presupuestador ya esté todo cargado con los datos del bot;
 * yo lo reviso, si está bien le mando". Nada se envía sin que Gustavo apriete el botón.
 *
 * 1. Si el bot ya cotizó (lead.cotizacion), se usan esos datos tal cual.
 * 2. Si no (charlas viejas o el bot no llegó a cotizar), una IA lee la charla y saca los datos que dijo el cliente.
 * 3. Posición: la fijada en la charla; si no hay, el clasificador (ARCA + web) con el producto.
 */
const { clasificar } = require('./clasificador');
const { ejecutar } = require('./tools');

const MODELO = process.env.MODELO_EXTRAER || process.env.CLASIFICADOR_MODEL || 'claude-sonnet-5-5';
const VERSION = 2; // si cambia, se vuelven a leer las charlas guardadas
const texto = (c) => (typeof c === 'string' ? c : Array.isArray(c) ? c.filter((b) => b && b.type === 'text').map((b) => b.text).join('\n') : '');

const INSTRUCCIONES = `Leés una charla de WhatsApp entre un cliente y el asistente de PuertoBox (importación courier desde China a Argentina).
Sacá los datos que dijo el cliente o que quedaron claros en la charla (por ejemplo, si PuertoBox le dijo que el producto tiene batería de litio, litio = true). Si un dato no está, poné null. No inventes valores.
Si dice "aprox" o "unas", usá ese número igual.
Si da el peso por unidad y la cantidad, calculá el peso total (kg_total = peso por unidad × unidades; usá el peso con caja si lo da).
Si da las medidas del producto y no las de la caja, NO las pongas como medidas de caja: dejá las medidas en null y anotalo en "notas".
Respondé SOLO con este JSON:
{"nombre": string|null, "producto": string|null (descripción completa: qué es, características, link si lo pasó), "unidades": number|null,
"kg_total": number|null, "valor_usd": number|null (valor total de la mercadería al proveedor), "cajas": number|null,
"largo_cm": number|null, "ancho_cm": number|null, "alto_cm": number|null, "litio": boolean (si tiene batería de litio),
"cuit_puertobox": boolean (si va con el CUIT de PuertoBox porque no tiene CUIT), "notas": string (una línea con lo que Gustavo tiene que saber o confirmar)}`;

async function extraerConIA(mensajes, fetchImpl) {
  const charla = mensajes.map((m) => `${m.role === 'user' ? 'Cliente' : 'PuertoBox'}: ${texto(m.content)}`).filter((l) => l.length > 12).join('\n').slice(-12000);
  const r = await fetchImpl('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODELO, max_tokens: 800, system: INSTRUCCIONES, messages: [{ role: 'user', content: charla }] }),
  });
  if (!r.ok) throw new Error(`IA ${r.status}`);
  const j = await r.json();
  const t = (j.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  const m = t.match(/\{[\s\S]*\}/);
  return m ? JSON.parse(m[0]) : {};
}

/** Respaldo sin IA: unidades, peso por unidad (prefiere "con caja") y litio, buscados en lo que escribió el cliente. */
function extraerSimple(mensajes) {
  const cli = mensajes.filter((m) => m.role === 'user').map((m) => texto(m.content)).join('\n').toLowerCase();
  const todo = mensajes.map((m) => texto(m.content)).join('\n').toLowerCase();
  const n = (x) => parseFloat(String(x).replace(',', '.'));
  const ultimo = (re) => { const t = [...cli.matchAll(new RegExp(re.source, 'g'))]; return t.length ? t[t.length - 1] : null; };
  const u = ultimo(/(\d+[.,]?\d*)\s*(unidades|unid\.?|u\.|pares|piezas|pcs)\b/);
  const unidades = u ? Math.round(n(u[1])) : null;
  const pesoDe = (re) => { const m = ultimo(re); if (!m) return null; const v = n(m[1]); return /^g/.test(m[2]) ? v / 1000 : v; };
  const porUnidad = pesoDe(/con caja[^\d\n]{0,15}(\d+[.,]?\d*)\s*(gramos|grs?|g|kg|kilos?)\b/) || pesoDe(/(\d+[.,]?\d*)\s*(gramos|grs?|g|kg|kilos?)\b[^\n]{0,15}con caja/) || pesoDe(/(\d+[.,]?\d*)\s*(gramos|grs?|g|kg|kilos?)\b/);
  const total = ultimo(/(\d+[.,]?\d*)\s*(kg|kilos?)\s*(en total|total)/) || ultimo(/(?:pedido|todo|total)[^\d\n]{0,15}(\d+[.,]?\d*)\s*(kg|kilos?)/);
  return {
    unidades, kg_total: total ? n(total[1]) : porUnidad && unidades ? Math.round(porUnidad * unidades * 100) / 100 : null,
    litio: /litio|lithium|li-?ion/.test(todo),
  };
}

const vacio = (d) => !d || !['unidades', 'kg_total', 'valor_usd', 'largo_cm'].some((k) => d[k]);

/** Datos para cargar el cotizador con lo que habló el bot. */
async function datosDeCharla(tel, { store, fetchImpl = fetch, nuevo = false }) {
  const c = store.chats().find((x) => x.telefono === tel);
  if (!c) return { error: 'No encuentro esa charla.' };
  const lead = store.lead(tel) || {};
  // Fuentes, de la más confiable a la menos (16/11: "si ya interpretaste el peso, volcalo cuando lo interpreta el bot"):
  //  1. lo que anotó o cotizó el bot (la más nueva de las dos primero), 2. la IA leyendo la charla, 3. el respaldo por texto.
  const desdeCotizacion = lead.cotizacion && lead.cotizacion.input ? (() => { const i = lead.cotizacion.input; return { _en: lead.cotizacion.en, unidades: i.unidades, kg_total: i.kg, valor_usd: i.valor_factura_usd, cajas: i.cantidad_cajas, largo_cm: i.largo_cm, ancho_cm: i.ancho_cm, alto_cm: i.alto_cm, litio: i.con_bateria_litio, cuit_puertobox: i.con_cuit_puertobox, regimen: i.regimen }; })() : null;
  const pe = lead.pedido || null;
  const desdePedido = pe ? { _en: pe.actualizado, unidades: pe.unidades, kg_total: pe.kg_total, valor_usd: pe.valor_usd, cajas: pe.cantidad_cajas, largo_cm: pe.largo_cm, ancho_cm: pe.ancho_cm, alto_cm: pe.alto_cm, litio: pe.con_bateria_litio, cuit_puertobox: pe.con_cuit_puertobox, link: pe.link } : null;
  const delBot = [desdeCotizacion, desdePedido].filter(Boolean).sort((a, b) => String(b._en || '').localeCompare(String(a._en || '')));
  const CAMPOS = ['unidades', 'kg_total', 'valor_usd', 'cajas', 'largo_cm', 'ancho_cm', 'alto_cm', 'regimen', 'link'];
  const completo = (d) => ['unidades', 'kg_total', 'valor_usd', 'largo_cm'].every((k) => d[k]);
  let d = {};
  const llenar = (src) => { if (!src) return; for (const k of CAMPOS) if (!d[k] && src[k]) d[k] = src[k]; d.litio = !!(d.litio || src.litio); d.cuit_puertobox = !!(d.cuit_puertobox || src.cuit_puertobox); if (!d.notas && src.notas) d.notas = src.notas; };
  delBot.forEach(llenar);
  let fuente = delBot.length ? (desdeCotizacion && delBot[0] === desdeCotizacion ? 'cotizacion' : 'bot') : 'charla';
  // Lo que el bot no anotó lo busca en la charla (con caché para no gastar dos veces).
  if (!completo(d)) {
    let ia = null;
    if (!nuevo && lead.extraida && lead.extraida.hasta === c.ultimo && lead.extraida.v === VERSION) ia = lead.extraida.datos;
    else {
      let error = '';
      try { ia = await extraerConIA(c.mensajes, fetchImpl); } catch (e) { ia = {}; error = e.message; }
      if (error) ia.notas = `No pude leer bien la charla (${error}): revisá los datos.${ia.notas ? ' ' + ia.notas : ''}`;
      if (!vacio(ia)) store.guardarLead(tel, { extraida: { v: VERSION, hasta: c.ultimo, datos: ia } });
    }
    const antes = JSON.stringify(d);
    llenar(ia);
    llenar(extraerSimple(c.mensajes));
    if (JSON.stringify(d) !== antes && fuente !== 'charla') fuente += '+charla';
    d.nombre = ia.nombre; d.producto = ia.producto;
  }
  d.nombre = lead.nombre || d.nombre || null;
  d.producto = lead.producto || d.producto || null;
  // Control: lo que cargó contra lo que dice la charla. Si no cierra, se avisa (no se corrige solo).
  const alertas = [];
  const simple = extraerSimple(c.mensajes);
  if (simple.unidades && d.unidades && simple.unidades !== d.unidades) alertas.push(`En la charla aparecen ${simple.unidades} unidades y se cargaron ${d.unidades}: revisá cuál es la última.`);
  if (d.unidades && d.kg_total && pe && pe.kg_por_unidad && Math.abs(pe.kg_por_unidad * d.unidades - d.kg_total) > d.kg_total * 0.25) alertas.push(`${d.unidades} unidades de ${pe.kg_por_unidad} kg son unos ${Math.round(pe.kg_por_unidad * d.unidades * 10) / 10} kg y se cargaron ${d.kg_total} kg.`);
  if (simple.litio && !d.litio) alertas.push('En la charla se habla de batería de litio y no está tildado.');
  // Posición: la de la charla; si no hay, el clasificador con el producto completo.
  let pos = lead.posicion_fija || null;
  if (!pos && d.producto) {
    try { const r = await clasificar({ producto_completo: d.producto }, { store, telefono: tel, fetchImpl }); if (!r.error) pos = r; } catch { /* queda a confirmar */ }
  }
  const regimen = d.regimen || (d.unidades && d.unidades <= 3 ? 'personal' : 'comercial');
  const faltan = [];
  if (!d.valor_usd) faltan.push('valor de la mercadería');
  if (!d.kg_total) faltan.push('peso');
  if (!(d.largo_cm && d.ancho_cm && d.alto_cm)) faltan.push('medidas de la caja');
  if (!pos) faltan.push('posición arancelaria');
  return {
    fuente, alertas, telefono: tel, nombre: d.nombre || '', producto: d.producto || '', notas: d.notas || '',
    posicion: pos ? pos.posicion : '', die: pos ? pos.die : null, internos: pos ? pos.internos || 0 : 0,
    posicion_a_confirmar: !!pos && pos.confianza !== 'alta' && !pos.confirmada,
    input: { valor: d.valor_usd || '', kg: d.kg_total || '', cajas: d.cajas || 1, largo: d.largo_cm || '', ancho: d.ancho_cm || '', alto: d.alto_cm || '', unid: d.unidades || '', reg: regimen, litio: !!d.litio, cuit: !!d.cuit_puertobox },
    faltan,
    link: d.link || ((c.mensajes.filter((m) => m.role === 'user').map((m) => texto(m.content)).join(' ').match(/https?:\/\/[^\s]+/) || [])[0]) || '',
    ventana_horas: Math.max(0, Math.round(24 - (Date.now() - (c.ultimoClienteEn || 0)) / 3600e3)),
  };
}

/**
 * Gustavo revisó el cotizador y apretó "Enviar": se recotiza con SUS números (quedan como cotización de la charla),
 * se arma el presupuesto formal y se manda el PDF por WhatsApp desde el 6773.
 */
async function enviarDesdeCotizador(tel, f, { store, enviarDoc, baseUrl }) {
  const c = store.chats().find((x) => x.telefono === tel);
  if (!c) return { error: 'No encuentro esa charla.' };
  if (Date.now() - (c.ultimoClienteEn || 0) > 24 * 3600e3) return { error: 'Pasaron más de 24 h desde su último mensaje: WhatsApp no deja mandarle el PDF.' };
  const num = (k) => { const v = parseFloat(String(f[k] ?? '').replace(',', '.')); return Number.isFinite(v) && v > 0 ? v : undefined; };
  if (!num('valor') || !num('kg')) return { error: 'Faltan el valor o el peso.' };
  if (!String(f.posicion || '').trim()) return { error: 'Falta elegir la posición arancelaria en la ficha de arriba.' };
  // La posición que eligió Gustavo queda fija y confirmada en la charla.
  const posicion = String(f.posicion || '').trim();
  store.guardarLead(tel, {
    nombre: f.cli || (store.lead(tel) || {}).nombre, producto: f.prod || (store.lead(tel) || {}).producto,
    posicion_fija: { posicion: posicion || 'a confirmar', die: parseFloat(f.die) || 0, internos: parseFloat(f.ii) || 0, confianza: 'alta', confirmada: !!posicion },
    ...(posicion ? { posicion } : {}),
  });
  const input = {
    kg: num('kg'), valor_factura_usd: num('valor'), die: parseFloat(f.die) || 0, internos: parseFloat(f.ii) || 0,
    regimen: f.reg === 'personal' ? 'personal' : 'comercial', sin_franquicia: f.sinfr === '1', cantidad_cajas: num('cajas') || 1,
    largo_cm: num('largo'), ancho_cm: num('ancho'), alto_cm: num('alto'), unidades: num('unid'),
    con_bateria_litio: f.litio === '1', con_cuit_puertobox: f.cuit === '1',
  };
  const r = await ejecutar('cotizar', input, { store, telefono: tel, derivaciones: [] });
  if (r.error) return { error: r.error };
  const p = store.crearPresupuesto(tel);
  if (!p) return { error: 'No se pudo armar el presupuesto.' };
  store.actualizarPresupuesto(p.token, { cliente: { nombre: f.cli || '', doc: f.doc || '', dom: f.dom || '', iva: f.iva || '' } });
  const caption = `Te paso el presupuesto formal N° ${p.nro}. Cualquier duda, te la respondo por acá.`;
  try { await enviarDoc(tel, `${baseUrl}/presupuesto/${p.token}.pdf`, `Presupuesto PuertoBox ${p.nro}.pdf`, caption); } catch (e) { return { error: `WhatsApp no lo aceptó (${String(e.message).slice(0, 90)}). Probá de nuevo en un rato.` }; }
  const ahora = Date.now();
  store.agregar(tel, 'assistant', `[Gustavo] ${caption} (PDF)`);
  store.pausar(tel, 'gustavo_respondio');
  if (store.marcar) store.marcar(tel, { gustavoRespondioEn: ahora, recordatorios: 0, presupuestoEnviadoEn: ahora, ...(c.derivadoEn ? {} : { derivadoEn: ahora - 1, derivadoMotivo: 'listo_para_cerrar', derivadoResumen: 'Le mandaste el presupuesto formal.' }) });
  store.actualizarPresupuesto(p.token, { enviado: new Date(ahora).toISOString() });
  return { ok: true, nro: p.nro, total: r.total_puertobox_usd, link: `/presupuesto/${p.token}.pdf` };
}

module.exports = { datosDeCharla, enviarDesdeCotizador, extraerConIA, extraerSimple, INSTRUCCIONES };
