'use strict';
/** Herramientas del agente: usan el motor de precios y la base SIM del repo. */
const path = require('path');
const { presupuesto } = require('../src/flete_directo');
const { crear } = require('../src/nomenclador');
const NEG = require('../src/negocio').datos();

// Mismos datos que el Nomenclador PuertoBox (web/nomenclador/data), generados desde ARCA.
let motor = null;
function getMotor() {
  if (!motor) {
    const d = (f) => require(path.join(__dirname, '..', 'web', 'nomenclador', 'data', f));
    motor = crear({ sim: d('sim.json'), sufijos: {}, intervenciones: d('intervenciones.json'), sinonimos: d('sinonimos.json'), notas: {} });
  }
  return motor;
}

const definiciones = [
  {
    name: 'buscar_posicion',
    description: 'Busca posiciones arancelarias SIM (Argentina, datos oficiales ARCA) para un producto. Devuelve hasta 5 candidatas con su derecho de importación (DIE %), impuestos internos e intervenciones posibles (orientativas: si aparece ANMAT, INAL, ANMAT/INAL envases, SENASA, ENACOM o SIDIP y es para revender, derivá a Gustavo).',
    input_schema: { type: 'object', properties: { producto: { type: 'string', description: 'Descripción del producto o posición' } }, required: ['producto'] },
  },
  {
    name: 'cotizar',
    description: 'Calcula el presupuesto de PuertoBox: flete con precio cerrado + gestión fija (lo cobra PuertoBox) + impuestos y gasto administrativo estimados (los paga el cliente al courier). Usar SIEMPRE para dar precios.',
    input_schema: {
      type: 'object',
      properties: {
        kg: { type: 'number', description: 'Peso bruto TOTAL de todas las cajas, en kg' },
        cantidad_cajas: { type: 'number', description: 'Cantidad de cajas iguales (las medidas son de UNA caja). Si no se sabe, 1.' },
        valor_factura_usd: { type: 'number', description: 'Valor de la factura del proveedor en USD' },
        die: { type: 'number', description: 'Derecho de importación (%) de la posición elegida' },
        internos: { type: 'number', description: 'Impuestos internos (%) si la posición los tiene, si no 0' },
        regimen: { type: 'string', enum: ['personal', 'comercial'], description: 'personal = uso propio, hasta 3 unidades iguales; comercial = para revender' },
        largo_cm: { type: 'number' }, ancho_cm: { type: 'number' }, alto_cm: { type: 'number' },
      },
      required: ['kg', 'valor_factura_usd', 'die', 'regimen'],
    },
  },
  {
    name: 'registrar_lead',
    description: 'Guarda o actualiza los datos del cliente en la planilla de leads.',
    input_schema: {
      type: 'object',
      properties: {
        nombre: { type: 'string' }, producto: { type: 'string' }, posicion: { type: 'string' },
        kg: { type: 'number' }, valor_usd: { type: 'number' }, precio_usd: { type: 'number' },
        tipo: { type: 'string', enum: ['personal', 'emprendedor', 'desconocido'] },
        estado: { type: 'string', enum: ['nuevo', 'cotizado', 'listo_para_cerrar', 'rechazado', 'derivado'] },
        notas: { type: 'string' },
      },
    },
  },
  {
    name: 'derivar_a_gustavo',
    description: 'Avisa a Gustavo para que tome el chat (cierre de venta, mayoristas, reclamos, dudas). Después de llamarla, el bot deja de responder en ese chat.',
    input_schema: {
      type: 'object',
      properties: {
        motivo: { type: 'string', enum: ['listo_para_cerrar', 'mayorista', 'reclamo', 'duda', 'pide_humano'] },
        resumen: { type: 'string', description: 'Resumen completo para Gustavo: producto, posición, kg, valor, precio, tipo de cliente, nombre' },
      },
      required: ['motivo', 'resumen'],
    },
  },
];

function ejecutar(nombre, input, ctx) {
  switch (nombre) {
    case 'buscar_posicion': {
      const m = getMotor();
      const res = m.buscar(input.producto, 15).filter((f) => !f.c.startsWith('00')).slice(0, 5).map((f) => ({
        posicion: f.c, die: f.die, impuestos_internos: f.ii, descripcion: m.jerarquia(f).slice(-3).join(' › '),
        intervenciones_posibles: m.intervencionesDe(f).map((i) => i.organismo),
      }));
      return res.length ? res : { aviso: 'Sin resultados. Probá con otras palabras o derivá a Gustavo.' };
    }
    case 'cotizar': {
      // Tope del courier: USD 3.000 FOB POR ENVÍO (sin límite de envíos para vender). Si el pedido pasa el tope, se divide en varios envíos.
      const tope = NEG.tope_por_envio_usd;
      const envios = Math.max(1, Math.ceil((input.valor_factura_usd || 0) / tope));
      const cajas = input.cantidad_cajas || 1;
      const uno = presupuesto({
        kg: input.kg / envios, cajas: Math.max(1, Math.ceil(cajas / envios)), largo: input.largo_cm, ancho: input.ancho_cm, alto: input.alto_cm,
        valorFactura: input.valor_factura_usd / envios, die: input.die, internos: input.internos || 0, regimen: envios > 1 ? 'comercial' : input.regimen,
      });
      const x = (n) => Math.round(n * envios * 100) / 100;
      const r = envios === 1 ? uno : {
        flete_puertobox_usd: x(uno.flete_puertobox_usd), handling_puertobox_usd: x(uno.handling_puertobox_usd), kg_presupuestado: uno.kg_presupuestado * envios,
        impuestos_estimados_usd: Object.fromEntries(Object.entries(uno.impuestos_estimados_usd).map(([k, v]) => [k, x(v)])),
        total_estimado_usd: x(uno.total_estimado_usd),
      };
      const extra = envios > 1
        ? ` PEDIDO DIVIDIDO: el courier permite hasta USD ${tope} por envío, así que este pedido va en ${envios} envíos separados (cada uno con su propia factura del proveedor de hasta USD ${tope}, y al menos una caja por envío). Explicáselo al cliente en una línea, mostrá los TOTALES (ya suman los ${envios} envíos) y aclará que la gestión es por envío. Si tiene menos cajas que envíos, pedile que le pida al proveedor separarlo en ${envios} cajas.`
        : '';
      return {
        envios,
        flete_puertobox_usd: r.flete_puertobox_usd,
        handling_puertobox_usd: r.handling_puertobox_usd,
        kg_presupuestado: r.kg_presupuestado,
        impuestos_y_gastos_estimados_usd: r.impuestos_estimados_usd.total,
        detalle_impuestos: r.impuestos_estimados_usd,
        total_estimado_usd: r.total_estimado_usd,
        reglas: `El flete es PRECIO CERRADO: se respeta aunque la caja llegue hasta ${NEG.precio_cerrado_hasta_pct}% más pesada o grande; si supera eso, se ajusta con foto de la balanza. Se suma una gestión fija de USD ${NEG.gestion_usd} por envío (mostrala como "Gestión PuertoBox"). Nunca digas que si pesa menos paga menos. No le muestres al cliente kg_presupuestado ni el margen: solo el flete. Flete + handling se pagan al pesarse, antes de que salga. Impuestos y gasto administrativo son ESTIMADOS y se pagan directo al courier al llegar (puede ser DHL, UPS o FedEx; no nombres uno salvo que pregunten).${extra}`,
      };
    }
    case 'registrar_lead':
      ctx.store.guardarLead(ctx.telefono, input);
      return { ok: true };
    case 'derivar_a_gustavo':
      ctx.store.guardarLead(ctx.telefono, { estado: input.motivo === 'listo_para_cerrar' ? 'listo_para_cerrar' : 'derivado', notas: input.resumen });
      // Solo se pausa el bot cuando Gustavo tiene que tomar el chat. En "duda" el bot sigue atendiendo.
      if (input.motivo !== 'duda') ctx.store.pausar(ctx.telefono, 'derivado');
      ctx.derivaciones.push({ telefono: ctx.telefono, ...input });
      return input.motivo === 'duda'
        ? { ok: true, instruccion: 'Decile que ese punto lo confirma Gustavo y seguí atendiendo vos el resto.' }
        : { ok: true, instruccion: 'Decile al cliente que Gustavo le escribe enseguida.' };
    default:
      return { error: `Herramienta desconocida: ${nombre}` };
  }
}

module.exports = { definiciones, ejecutar };
