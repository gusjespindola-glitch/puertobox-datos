'use strict';
/** Persistencia simple en un archivo JSON: conversaciones, pausas y leads. */
const fs = require('fs');

const HISTORIAL_MAX = 30; // mensajes por chat que se mandan a la IA
const PAUSA_HORAS = Number(process.env.PAUSA_HORAS || 24);
const RESET_HORAS = Number(process.env.RESET_HORAS || 48); // conversación nueva si el cliente vuelve después de 48 h

function crearStore(archivo) {
  let db = { chats: {}, leads: {}, vistos: [] };
  if (archivo && fs.existsSync(archivo)) {
    try { db = JSON.parse(fs.readFileSync(archivo, 'utf8')); } catch { /* archivo dañado: arrancar vacío */ }
  }
  const guardar = () => { if (archivo) fs.writeFileSync(archivo, JSON.stringify(db, null, 1)); };
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
      if (role === 'user' && c.ultimo && Date.now() - c.ultimo > RESET_HORAS * 3600e3) c.mensajes = [];
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
    meta(clave, valor) { db.meta ||= {}; if (valor !== undefined) { db.meta[clave] = valor; guardar(); } return db.meta[clave]; },
  };
}

module.exports = { crearStore };
