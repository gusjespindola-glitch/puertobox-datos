'use strict';
/** Herramientas del agente: usan el motor de precios y la base SIM del repo. */
const path = require('path');
const { presupuesto } = require('../src/flete_directo');
const { crear } = require('../ncm/motor_busqueda');

let motor = null;
function getMotor() {
  if (!motor) {
    motor = crear(require(path.join(__dirname, '..', 'ncm', 'sim_compacto.json')),
      require(path.join(__dirname, '..', 'ncm', 'sinonimos.json')));
  }
  return motor;
}

const definiciones = [
  {
    name: 'buscar_posicion',
    description: 'Busca posiciones arancelarias SIM (Argentina, datos ARCA) para un producto. Devuelve hasta 5 candidatas con su derecho de importación (DIE %) e impuestos internos.',
    input_schema: { type: 'object', properties: { producto: { type: 'string', description: 'Descripción del producto o posición' } }, required: ['producto'] },
  },
  {
    name: 'cotizar',
    description: 'Calcula el presupuesto de PuertoBox: flete firme (lo cobra PuertoBox) + impuestos y gasto administrativo estimados (los paga el cliente al courier). Usar SIEMPRE para dar precios.',
    input_schema: {
      type: 'object',
      properties: {
        kg: { type: 'number', description: 'Peso bruto total que declara el proveedor, en kg' },
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
      const res = m.buscar(input.producto, 5).map((f) => ({
        posicion: f.c, die: f.die, impuestos_internos: f.ii, descripcion: m.texto(f).slice(-3).join(' › '),
      }));
      return res.length ? res : { aviso: 'Sin resultados. Probá con otras palabras o derivá a Gustavo.' };
    }
    case 'cotizar': {
      const r = presupuesto({
        kg: input.kg, largo: input.largo_cm, ancho: input.ancho_cm, alto: input.alto_cm,
        valorFactura: input.valor_factura_usd, die: input.die, internos: input.internos || 0, regimen: input.regimen,
      });
      return {
        flete_puertobox_usd: r.flete_puertobox_usd,
        kg_presupuestado: r.kg_presupuestado,
        impuestos_y_gastos_estimados_usd: r.impuestos_estimados_usd.total,
        detalle_impuestos: r.impuestos_estimados_usd,
        total_estimado_usd: r.total_estimado_usd,
        reglas: 'El flete es firme (incluye 15% de tolerancia sobre lo que declara el proveedor). Si la caja llega más de 15% más pesada o grande, se ajusta con foto de la balanza. Si llega más chica, se cobra menos. Impuestos y gasto administrativo son ESTIMADOS y se pagan directo al courier (DHL) al llegar.',
      };
    }
    case 'registrar_lead':
      ctx.store.guardarLead(ctx.telefono, input);
      return { ok: true };
    case 'derivar_a_gustavo':
      ctx.store.guardarLead(ctx.telefono, { estado: input.motivo === 'listo_para_cerrar' ? 'listo_para_cerrar' : 'derivado', notas: input.resumen });
      ctx.store.pausar(ctx.telefono, 'derivado');
      ctx.derivaciones.push({ telefono: ctx.telefono, ...input });
      return { ok: true, instruccion: 'Decile al cliente que Gustavo le escribe enseguida.' };
    default:
      return { error: `Herramienta desconocida: ${nombre}` };
  }
}

module.exports = { definiciones, ejecutar };
