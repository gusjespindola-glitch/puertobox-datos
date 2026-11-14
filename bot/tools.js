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
    motor = crear({ sim: d('sim.json'), sufijos: {}, intervenciones: d('intervenciones.json'), sinonimos: d('sinonimos.json'), notas: {}, frecuentes: d('productos_frecuentes.json') });
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
    description: 'Calcula el presupuesto de PuertoBox: flete con precio cerrado + gestión fija (lo cobra PuertoBox) + impuestos y gasto administrativo estimados (los paga el cliente a la empresa de transporte). Usar SIEMPRE para dar precios.',
    input_schema: {
      type: 'object',
      properties: {
        kg: { type: 'number', description: 'Peso bruto TOTAL de todas las cajas, en kg' },
        cantidad_cajas: { type: 'number', description: 'Cantidad de cajas iguales (las medidas son de UNA caja). Si no se sabe, 1.' },
        valor_factura_usd: { type: 'number', description: 'Valor de la factura del proveedor en USD' },
        die: { type: 'number', description: 'Derecho de importación (%) de la posición elegida' },
        internos: { type: 'number', description: 'Impuestos internos (%) si la posición los tiene, si no 0' },
        regimen: { type: 'string', enum: ['personal', 'comercial'], description: 'personal = uso propio, hasta 3 unidades iguales; comercial = para revender' },
        sin_franquicia: { type: 'boolean', description: 'true si el cliente de uso propio ya usó sus envíos con beneficio del año' },
        unidades: { type: 'number', description: 'Cantidad TOTAL de unidades que trae (por ejemplo 100 remeras). Para revender, siempre que se sepa: con esto se calcula cuánto le queda cada unidad puesta en su casa.' },
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
      if (!res.length) return { aviso: 'Sin resultados. Probá con otras palabras (por ejemplo, de qué material es o para qué se usa) o derivá a Gustavo.' };
      const guia = m.buscar(input.producto, 1)[0]?.frecuente;
      return guia ? { como_elegir: guia + ' Elegí la que corresponda según lo que dijo el cliente; si no sabés el material o el tipo, preguntalo. Es orientativa: la confirma nuestro despachante.', posiciones: res } : res;
    }
    case 'cotizar': {
      // Controles antes de dar un precio: datos imposibles o pedidos que no se cotizan por acá.
      if (!(input.kg > 0) || !(input.valor_factura_usd > 0)) return { error: 'Faltan el peso o el valor (tienen que ser mayores a 0). Preguntáselos al cliente; no cotices.' };
      if (input.valor_factura_usd > NEG.tope_por_envio_usd) return { aviso: `Supera el tope de USD ${NEG.tope_por_envio_usd} por envío: no cotices. Seguí las reglas de pedidos grandes (juntá datos y derivá a Gustavo).` };
      const cajas = input.cantidad_cajas || 1;
      const conMedidas = !!(input.largo_cm && input.ancho_cm && input.alto_cm);
      const cajaPesada = input.kg / cajas > NEG.caja_max_kg;
      const r = presupuesto({
        kg: input.kg, cajas: input.cantidad_cajas || 1, largo: input.largo_cm, ancho: input.ancho_cm, alto: input.alto_cm,
        valorFactura: input.valor_factura_usd, die: input.die, internos: input.internos || 0, regimen: input.regimen,
        conFranquicia: !input.sin_franquicia,
      });
      // Lead cotizado (si todavía no avanzó a otro estado): así aparece en el seguimiento si el cliente no vuelve.
      const previo = ctx.store.lead ? ctx.store.lead(ctx.telefono) : null;
      if (!previo || !previo.estado || previo.estado === 'nuevo' || previo.estado === 'cotizado') {
        ctx.store.guardarLead(ctx.telefono, { estado: 'cotizado', kg: input.kg, valor_usd: input.valor_factura_usd, precio_usd: r.flete_puertobox_usd + r.handling_puertobox_usd });
      }
      const avisos = [];
      if (!conMedidas) avisos.push('No hay medidas de la caja: el flete se confirma con las medidas (una caja grande y liviana se cobra por tamaño). No lo presentes como firme y pasale al cliente el mensaje en inglés para el proveedor.');
      if (cajaPesada) avisos.push(`Hay cajas de más de ${NEG.caja_max_kg} kg: tienen recargo del courier que NO está en este flete. Recomendá dividirlas y no digas que el flete es firme.`);
      const totalPB = r.flete_puertobox_usd + r.handling_puertobox_usd;
      // Costo por unidad puesta en la casa del cliente: producto + flete + gestión + impuestos estimados, dividido las unidades.
      const unidades = Math.round(input.unidades || 0);
      const porUnidad = unidades > 0 ? {
        costo_por_unidad_usd: Math.round(((input.valor_factura_usd + totalPB + r.impuestos_estimados_usd.total) / unidades) * 100) / 100,
        producto_por_unidad_usd: Math.round((input.valor_factura_usd / unidades) * 100) / 100,
        unidades,
      } : {};
      return {
        flete_firme: conMedidas && !cajaPesada,
        ...porUnidad,
        ...(avisos.length ? { aviso: avisos.join(' ') } : {}),
        flete_puertobox_usd: r.flete_puertobox_usd,
        handling_puertobox_usd: r.handling_puertobox_usd,
        kg_presupuestado: r.kg_presupuestado,
        impuestos_y_gastos_estimados_usd: r.impuestos_estimados_usd.total,
        detalle_impuestos: r.impuestos_estimados_usd,
        total_puertobox_usd: totalPB,
        reglas: `El flete es PRECIO CERRADO: se respeta aunque la caja llegue hasta ${NEG.precio_cerrado_hasta_pct}% más pesada o grande; si supera eso, se ajusta con foto de la balanza. Se suma una gestión fija de USD ${NEG.gestion_usd} por envío. El cliente le paga a PuertoBox SOLO total_puertobox_usd (flete + gestión); los impuestos son un estimado aparte que cobra el courier: nunca los sumes al total de PuertoBox. Nunca digas que si pesa menos paga menos. No le muestres al cliente kg_presupuestado ni el margen: solo el flete. Flete + handling se pagan al pesarse, antes de que salga. El envío de la fábrica al depósito en ${NEG.deposito_china} NO está incluido: lo paga el cliente (ideal: que lo incluya el proveedor; si lo paga PuertoBox, se suma aparte a lo que cueste). Impuestos y gasto administrativo son ESTIMADOS y se pagan directo a la empresa de transporte cuando entrega el paquete (decí "la empresa de transporte"; puede ser DHL, UPS o FedEx, no nombres una salvo que pregunten).`,
      };
    }
    case 'registrar_lead':
      ctx.store.guardarLead(ctx.telefono, input);
      return { ok: true };
    case 'derivar_a_gustavo':
      ctx.store.guardarLead(ctx.telefono, { estado: input.motivo === 'listo_para_cerrar' ? 'listo_para_cerrar' : 'derivado', notas: input.resumen });
      // Solo se pausa el bot cuando Gustavo tiene que tomar el chat. En "duda" el bot sigue atendiendo.
      if (input.motivo !== 'duda') ctx.store.pausar(ctx.telefono, 'derivado');
      if (ctx.store.marcar) ctx.store.marcar(ctx.telefono, { derivadoEn: Date.now(), derivadoMotivo: input.motivo, derivadoResumen: input.resumen, recordatorios: 0 });
      ctx.derivaciones.push({ telefono: ctx.telefono, ...input });
      return input.motivo === 'duda'
        ? { ok: true, instruccion: 'Decile que ese punto lo confirma nuestro despachante (no digas el nombre de Gustavo) y seguí atendiendo vos el resto.' }
        : { ok: true, instruccion: 'Decile al cliente que nuestro despachante le escribe enseguida (no digas el nombre de Gustavo).' };
    default:
      return { error: `Herramienta desconocida: ${nombre}` };
  }
}

module.exports = { definiciones, ejecutar };
