'use strict';
/** Persistencia simple en un archivo JSON: conversaciones, pausas y leads. */
const fs = require('fs');

const HISTORIAL_MAX = 30; // mensajes por chat que se mandan a la IA
const PAUSA_HORAS = Number(process.env.PAUSA_HORAS || 24);
const RESET_HORAS = Number(process.env.RESET_HORAS || 48); // conversación nueva si el cliente vuelve después de 48 h

function crearStore(archivo) {
  let db = { chats: {}, leads: {}, vistos: [] };
  // Auditoría 15/11: antes, si un reinicio cortaba el archivo a mitad de escritura, arrancaba vacío y pisaba todo.
  // Ahora se escribe en un temporal y se renombra (nunca queda a medias), y se guarda la copia anterior (.bak).
  if (archivo) {
    const leer = (f) => { try { return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null; } catch { return undefined; } };
    const principal = leer(archivo);
    if (principal) db = principal;
    else if (principal === undefined) {
      const copia = leer(archivo + '.bak');
      try { fs.copyFileSync(archivo, `${archivo}.danado-${Date.now()}`); } catch { /* se guarda el dañado para revisar */ }
      if (copia) { db = copia; console.error('Datos: el archivo estaba dañado, se usó la copia anterior (.bak).'); } else console.error('Datos: archivo dañado y sin copia; se guardó aparte.');
    }
  }
  db.chats ||= {}; db.leads ||= {}; db.vistos ||= [];
  const guardar = () => {
    if (!archivo) return;
    const tmp = archivo + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db, null, 1));
    try { if (fs.existsSync(archivo)) fs.copyFileSync(archivo, archivo + '.bak'); } catch { /* sin copia esta vez */ }
    fs.renameSync(tmp, archivo);
  };
  const chat = (tel) => (db.chats[tel] ||= { mensajes: [], pausadoHasta: 0, motivoPausa: null });

  return {
    yaVisto(id) {
      if (db.vistos.includes(id)) return true;
      db.vistos.push(id); if (db.vistos.length > 2000) db.vistos.splice(0, 1000); guardar();
      return false;
    },
    historial: (tel) => chat(tel).mensajes,
    agregar(tel, role, content) {
      const c = chat(tel);
      if (role === 'user' && c.ultimo && Date.now() - c.ultimo > RESET_HORAS * 3600e3) {
        c.mensajes = [];
        if (db.leads[tel]) delete db.leads[tel].posicion_fija; // charla nueva: puede ser otro producto
      }
      c.ultimo = Date.now();
      if (role === 'user') { c.ultimoClienteEn = c.ultimo; c.avisoVentana = false; } // ventana de 24 h nueva
      c.mensajes.push({ role, content });
      if (c.mensajes.length > HISTORIAL_MAX) c.mensajes = c.mensajes.slice(-HISTORIAL_MAX);
      while (c.mensajes.length && c.mensajes[0].role !== 'user') c.mensajes.shift();
      guardar();
    },
    pausar(tel, motivo, horas = PAUSA_HORAS) {
      const c = chat(tel); c.pausadoHasta = Date.now() + horas * 3600e3; c.motivoPausa = motivo; guardar();
    },
    borrar(tel) { delete db.chats[tel]; guardar(); },
    reanudar(tel) { const c = chat(tel); c.pausadoHasta = 0; c.motivoPausa = null; guardar(); },
    estaPausado: (tel) => chat(tel).pausadoHasta > Date.now(),
    motivoPausa: (tel) => chat(tel).motivoPausa,
    avisoEsperaVencido(tel, horas) {
      const c = chat(tel);
      if (c.ultimoAvisoEspera && Date.now() - c.ultimoAvisoEspera < horas * 3600e3) return false;
      c.ultimoAvisoEspera = Date.now(); guardar(); return true;
    },
    guardarLead(tel, datos) {
      db.leads[tel] = { ...(db.leads[tel] || { telefono: tel, creado: new Date().toISOString() }), ...datos, actualizado: new Date().toISOString() };
      guardar();
    },
    leads: () => Object.values(db.leads),
    lead: (tel) => db.leads[tel],
    /** Guarda datos sueltos del chat (derivación, respuesta de Gustavo, recordatorios). */
    marcar(tel, datos) { Object.assign(chat(tel), datos); guardar(); },
    /** Cuenta las respuestas del bot en el día (hora argentina) y devuelve cuántas van. */
    contarRespuesta(tel) {
      const c = chat(tel); const hoy = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
      if (c.diaCuenta !== hoy) { c.diaCuenta = hoy; c.respuestasHoy = 0; }
      c.respuestasHoy += 1; guardar(); return c.respuestasHoy;
    },
    chats: () => Object.entries(db.chats).map(([telefono, c]) => ({ telefono, ...c })),
    // Presupuestos formales en PDF (15/11): uno por cliente, con número correlativo. Lo manda Gustavo.
    crearPresupuesto(tel) {
      const l = db.leads[tel];
      if (!l || !l.cotizacion || !l.cotizacion.r) return null;
      db.presupuestos ||= {};
      const existente = Object.values(db.presupuestos).find((p) => p.tel === tel && p.cotizacionEn === l.cotizacion.en);
      if (existente) return existente;
      db.meta ||= {}; db.meta.presuNro = (db.meta.presuNro || 0) + 1;
      const p = { token: require('crypto').randomBytes(16).toString('hex'), tel, nro: '0001-' + String(db.meta.presuNro).padStart(8, '0'), cotizacionEn: l.cotizacion.en, creado: new Date().toISOString(), cliente: {} };
      db.presupuestos[p.token] = p; l.presupuesto = p.token; guardar();
      return p;
    },
    presupuesto(token) { return (db.presupuestos || {})[token] || null; },
    presupuestoDe(tel) { const l = db.leads[tel]; return l && l.presupuesto ? (db.presupuestos || {})[l.presupuesto] || null : null; },
    actualizarPresupuesto(token, datos) { const p = (db.presupuestos || {})[token]; if (p) { Object.assign(p, datos); guardar(); } return p; },
    // Clasificación arancelaria (15/11): caché por producto y contador diario de búsquedas web.
    cacheClasificacion() { return (db.clasificaciones ||= {}); },
    guardarClasificacion(k, r) { (db.clasificaciones ||= {})[k] = { ...r, en: new Date().toISOString() }; guardar(); },
    contarClasificacion(dia, sumar = 0) { db.clasifDia ||= {}; if (sumar) { db.clasifDia = { [dia]: (db.clasifDia[dia] || 0) + sumar }; guardar(); } return db.clasifDia[dia] || 0; },
    meta(clave, valor) { db.meta ||= {}; if (valor !== undefined) { db.meta[clave] = valor; guardar(); } return db.meta[clave]; },
  };
}

module.exports = { crearStore };
