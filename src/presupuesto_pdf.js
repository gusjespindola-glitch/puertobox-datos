'use strict';
/**
 * Presupuesto formal en PDF (comprobante tipo argentino "X", no válido como factura).
 * 15/11/2026, Gustavo: se arma solo con los datos de la charla cuando el cliente confirma, y lo manda ÉL con un botón.
 * El bot nunca lo envía por su cuenta. Mismo contenido que el del cotizador del nomenclador.
 */
const PDFDocument = require('pdfkit');

const PB = { titular: 'Gustavo Espíndola', rol: 'Despachante de Aduana matriculado · ARCA', ciudad: 'La Plata, Buenos Aires', web: 'puertobox.com.ar', mail: 'info@puertobox.com.ar', wa: '+54 9 221 682-6773' };
const n2 = (x) => Number(x || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const kg = (x) => `${Number(x || 0).toLocaleString('es-AR', { maximumFractionDigits: 2 })} kg`;
const fecha = (d) => d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Argentina/Buenos_Aires' });

/** Datos del presupuesto a partir de la última cotización guardada en el lead. */
function armarDatos({ nro, lead, cliente = {}, ahora = new Date(), validezDias = 7 }) {
  const c = lead && lead.cotizacion;
  if (!c) return null;
  const { input, r } = c;
  const vence = new Date(ahora.getTime() + validezDias * 864e5);
  const vol = input.largo_cm && input.ancho_cm && input.alto_cm ? Math.round((input.largo_cm * input.ancho_cm * input.alto_cm / 5000) * (input.cantidad_cajas || 1) * 100) / 100 : null;
  const items = [[`Flete aéreo courier China a domicilio (${r.kg_presupuestado} kg cobrables)`, r.flete_puertobox_usd]];
  if (r.recargo_cajas_usd) items.push(['Recargo de la aerolínea por cajas de más de 23 kg', r.recargo_cajas_usd]);
  if (r.recargo_litio_usd) items.push(['Recargo de la aerolínea por batería de litio (carga peligrosa)', r.recargo_litio_usd]);
  items.push([input.con_cuit_puertobox ? 'Gestión de importación con CUIT de PuertoBox' : 'Gestión de importación y seguimiento', r.handling_puertobox_usd]);
  const d = r.detalle_impuestos || {};
  const imp = [[`Derecho de importación (${input.die || 0}%) y tasa de estadística`, d.derechos_y_tasa], ['IVA', d.iva]];
  if (d.internos) imp.push(['Impuestos internos', d.internos]);
  imp.push(['Gasto administrativo de la empresa de transporte (con IVA)', d.gasto_administrativo]);
  const condiciones = [
    'Los servicios de PuertoBox se abonan al 100% cuando la mercadería ingresa al depósito en Shenzhen y se pesa, antes de su despacho.',
    (r.flete_firme ? 'Precio cerrado: el flete se respeta aunque la caja llegue hasta un 15% más pesada o grande que lo informado. Si supera ese margen, se ajusta con foto de balanza y medidas.' : 'El flete se confirma con las medidas y el peso de las cajas al ingresar al depósito.') + ' El peso se cobra por kilo entero.',
    'El envío desde la fábrica hasta el depósito en Shenzhen no está incluido; se recomienda que lo incluya el proveedor.',
    'Los impuestos son una estimación sobre la posición indicada. Los liquida y cobra la empresa de transporte al entregar y pueden variar por tipo de cambio, valoración o clasificación aduanera.' + (input.con_cuit_puertobox ? ' Por ingresar con CUIT de PuertoBox, el cliente abona los impuestos a PuertoBox antes del despacho; el envío dentro de Argentina se cobra aparte.' : ''),
    'La factura del proveedor debe reflejar el valor real de la mercadería.' + (r.recargo_litio_usd ? ' Para productos con batería de litio, el proveedor debe enviar la hoja de seguridad (MSDS) y el informe de ensayo UN38.3.' : ''),
    `Presupuesto válido hasta el ${fecha(vence)}. Sujeto a disponibilidad de espacio y a las condiciones de la empresa de transporte.`,
  ];
  return {
    nro, fecha: fecha(ahora), vence: fecha(vence),
    cliente: { nombre: cliente.nombre || lead.nombre || '', doc: cliente.doc || '', dom: cliente.dom || '', iva: cliente.iva || '' },
    mercaderia: {
      desc: lead.producto || '', posicion: (lead.posicion_fija && lead.posicion_fija.posicion) || lead.posicion || 'a confirmar',
      valor: input.valor_factura_usd, unidades: input.unidades || null, peso_real: input.kg, vol, kg_cob: r.kg_presupuestado,
      bultos: input.largo_cm && input.ancho_cm && input.alto_cm ? `${input.cantidad_cajas || 1} × ${input.largo_cm}×${input.ancho_cm}×${input.alto_cm} cm` : `${input.cantidad_cajas || 1} (medidas a confirmar)`,
      envio: input.regimen === 'personal' ? 'Pequeño envío (hasta 3 unidades iguales)' : 'Courier comercial',
    },
    items, total: r.total_puertobox_usd, imp, impTotal: r.impuestos_y_gastos_estimados_usd,
    costoUnidad: r.costo_por_unidad_usd || null, unidades: r.unidades || null, condiciones,
  };
}

/** Devuelve el PDF (Buffer). */
function pdf(D) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 36, info: { Title: `Presupuesto PuertoBox ${D.nro}`, Author: 'PuertoBox' } });
    const partes = []; doc.on('data', (b) => partes.push(b)); doc.on('end', () => resolve(Buffer.concat(partes))); doc.on('error', reject);
    const INK = '#1b2333', MUT = '#5b6475', RED = '#c8102e', L = 36, W = doc.page.width - 72;
    const R = L + W;
    // Encabezado: emisor | X | presupuesto
    const y0 = 36, hH = 108, c1 = W * 0.44, c2 = 70;
    doc.lineWidth(1.2).strokeColor(INK).rect(L, y0, W, hH).stroke();
    doc.moveTo(L + c1, y0).lineTo(L + c1, y0 + hH).stroke(); doc.moveTo(L + c1 + c2, y0).lineTo(L + c1 + c2, y0 + hH).stroke();
    doc.font('Helvetica-Bold').fontSize(20).fillColor(INK).text('Puerto', L + 12, y0 + 12, { continued: true }).fillColor(RED).text('Box');
    doc.font('Helvetica-Bold').fontSize(9).fillColor(INK).text(PB.titular, L + 12, y0 + 40);
    doc.font('Helvetica').fontSize(8.5).fillColor(MUT);
    [PB.rol, PB.ciudad, `${PB.web} · ${PB.mail}`, `WhatsApp ${PB.wa}`].forEach((t, i) => doc.text(t, L + 12, y0 + 53 + i * 12, { width: c1 - 20 }));
    const xX = L + c1 + (c2 - 46) / 2;
    doc.rect(xX, y0 + 12, 46, 46).stroke();
    doc.font('Helvetica-Bold').fontSize(32).fillColor(INK).text('X', xX, y0 + 19, { width: 46, align: 'center' });
    doc.font('Helvetica').fontSize(6.5).fillColor(MUT).text('Documento no válido como factura', L + c1 + 4, y0 + 64, { width: c2 - 8, align: 'center' });
    const xP = L + c1 + c2 + 12;
    doc.font('Helvetica-Bold').fontSize(15).fillColor(INK).text('PRESUPUESTO', xP, y0 + 12);
    doc.font('Helvetica-Bold').fontSize(9.5).text(`N° ${D.nro}`, xP, y0 + 36);
    doc.font('Helvetica').fontSize(9).fillColor(MUT);
    [`Fecha: ${D.fecha}`, `Válido hasta: ${D.vence}`, 'Moneda: dólares estadounidenses (USD)'].forEach((t, i) => doc.text(t, xP, y0 + 52 + i * 13));
    // Recuadros de datos (dos columnas)
    const caja = (y, pares) => {
      const filas = Math.ceil(pares.length / 2), h = 12 + filas * 14;
      doc.rect(L, y, W, h).stroke();
      pares.forEach(([k, v], i) => {
        const x = L + 12 + (i % 2) * (W / 2), yy = y + 8 + Math.floor(i / 2) * 14;
        doc.font('Helvetica').fontSize(8.5).fillColor(MUT).text(`${k}: `, x, yy, { continued: true }).fillColor(INK).text(String(v || '—'), { width: W / 2 - 24, lineBreak: false, ellipsis: true });
      });
      return y + h;
    };
    let y = caja(y0 + hH, [['Cliente', D.cliente.nombre], ['CUIT/DNI', D.cliente.doc], ['Domicilio', D.cliente.dom], ['Condición IVA', D.cliente.iva]]);
    const titulo = (t) => { y += 14; doc.font('Helvetica-Bold').fontSize(8).fillColor(MUT).text(t.toUpperCase(), L, y, { characterSpacing: 0.6 }); y += 13; };
    titulo('Mercadería');
    const m = D.mercaderia;
    y = caja(y, [['Descripción', m.desc], ['Posición arancelaria', m.posicion], ['Valor de la mercadería (FOB)', `USD ${n2(m.valor)}`], ['Unidades', m.unidades || '—'],
      ['Peso real', `${kg(m.peso_real)}${m.vol ? ` · volumétrico ${kg(m.vol)}` : ''}`], ['Bultos', m.bultos], ['Envío', m.envio], ['Peso cobrable', kg(m.kg_cob)]]);
    const tabla = (filas, conTotal) => {
      filas.forEach(([t, v], i) => {
        const tot = conTotal && i === filas.length - 1;
        if (tot) { doc.moveTo(L, y - 2).lineTo(R, y - 2).lineWidth(1.2).strokeColor(INK).stroke(); }
        doc.font(tot ? 'Helvetica-Bold' : 'Helvetica').fontSize(tot ? 10 : 9.5).fillColor(INK).text(t, L + 6, y + 3, { width: W - 120 });
        doc.text(`USD ${n2(v)}`, R - 110, y + 3, { width: 104, align: 'right' });
        y += 19;
        if (!tot) doc.moveTo(L, y - 1).lineTo(R, y - 1).lineWidth(0.5).strokeColor('#e3e7ee').stroke();
      });
    };
    titulo('Detalle de servicios PuertoBox');
    tabla(D.items);
    y += 6;
    doc.rect(L, y, W, 34).fill(INK);
    doc.font('Helvetica').fontSize(10).fillColor('#ffffff').text('TOTAL A ABONAR A PUERTOBOX', L + 14, y + 12);
    doc.font('Helvetica-Bold').fontSize(16).text(`USD ${n2(D.total)}`, R - 200, y + 9, { width: 186, align: 'right' });
    y += 34;
    titulo('Impuestos y gastos de importación estimados — no los cobra PuertoBox');
    const yImp = y; doc.rect(L, yImp, W, (D.imp.length + 1) * 19 + 8).fillAndStroke('#f4f6fa', '#e3e7ee'); y += 4;
    tabla([...D.imp, ['Total estimado (se abona a la empresa de transporte al recibir)', D.impTotal]], true);
    y += 6;
    if (D.costoUnidad) { doc.font('Helvetica-Bold').fontSize(9.5).fillColor(INK).text(`Costo estimado por unidad puesta en su domicilio: USD ${n2(D.costoUnidad)}`, L, y, { continued: true }).font('Helvetica').fillColor(MUT).text(` (mercadería + servicios + impuestos estimados ÷ ${D.unidades} u.)`); y += 16; }
    titulo('Condiciones');
    doc.font('Helvetica').fontSize(8).fillColor('#3c4556');
    D.condiciones.forEach((t, i) => { doc.text(`${i + 1}. ${t}`, L, y, { width: W }); y = doc.y + 3; });
    y += 18;
    doc.font('Helvetica').fontSize(8.5).fillColor(MUT).text(`Emitido por PuertoBox · ${PB.web}`, L, y + 12);
    doc.moveTo(R - 210, y).lineTo(R, y).lineWidth(0.8).strokeColor(INK).stroke();
    doc.fillColor(INK).text(PB.titular, R - 210, y + 5, { width: 210, align: 'center' }).fillColor(MUT).text(PB.rol, R - 210, doc.y, { width: 210, align: 'center' });
    doc.end();
  });
}

module.exports = { armarDatos, pdf };
