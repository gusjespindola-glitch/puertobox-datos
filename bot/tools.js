'use strict';
/** Herramientas del agente: usan el motor de precios y la base SIM del repo. */
const path = require('path');
const { presupuesto } = require('../src/flete_directo');
const { crear } = require('../src/nomenclador');
const NEG = require('../src/negocio').datos();

// Mismos datos que el Nomenclador PuertoBox (web/nomenclador/data), generados desde ARCA.
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

const definiciones = [
  {
    name: 'clasificar_producto',
    description: 'Encuentra la posición arancelaria correcta como lo hace un despachante: busca el producto COMPLETO en internet, verifica el código en el arancel oficial de ARCA y devuelve la posición con su derecho de importación (die) e impuestos internos sacados de ARCA. Usala SIEMPRE antes del primer presupuesto de un producto. La posición queda fija en la charla: si la volvés a llamar con el mismo producto, devuelve la misma.',
    input_schema: {
      type: 'object',
      properties: {
        producto_completo: { type: 'string', description: 'TODO lo que dijo el cliente del producto, tal cual: nombre, modelo, para qué sirve, materiales, si tiene batería/Bluetooth/WiFi, el link si lo mandó y el código HS si lo dio el proveedor.' },
        cambiar_producto: { type: 'boolean', description: 'true solo si el cliente pasó a cotizar OTRO producto distinto en la misma charla.' },
        dato_nuevo: { type: 'boolean', description: 'true si el cliente aclaró un dato del MISMO producto que cambia la clasificación (material, tipo de prenda, si tiene batería, uso) después de la primera clasificación. Se puede una sola vez. Pasá producto_completo con todos los datos.' },
      },
      required: ['producto_completo'],
    },
  },
  {
    name: 'buscar_posicion',
    description: 'Solo para consultas rápidas o si clasificar_producto falla. Busca posiciones arancelarias SIM (Argentina, datos oficiales ARCA) por palabras o por código. Devuelve hasta 5 candidatas con su derecho de importación (DIE %), impuestos internos e intervenciones posibles (orientativas: si aparece ANMAT, INAL, ANMAT/INAL envases, SENASA, ENACOM o SIDIP y es para revender, derivá a Gustavo).',
    input_schema: { type: 'object', properties: { producto: { type: 'string', description: 'Descripción del producto o posición' } }, required: ['producto'] },
  },
  {
    name: 'cotizar',
    description: 'Calcula el presupuesto de PuertoBox: flete con precio cerrado + gestión fija (lo cobra PuertoBox) + impuestos y gasto administrativo estimados (los paga el cliente a la empresa de transporte). Usar SIEMPRE para dar precios.',
    input_schema: {
      type: 'object',
      properties: {
        kg: { type: 'number', description: 'Peso bruto TOTAL de todas las cajas, en kg' },
        cantidad_cajas: { type: 'number', description: 'Cantidad de cajas iguales (las medidas son de UNA caja). Obligatorio: si no se sabe, preguntalo.' },
        valor_factura_usd: { type: 'number', description: 'Valor de la factura del proveedor en USD' },
        die: { type: 'number', description: 'Derecho de importación (%) de la posición elegida' },
        internos: { type: 'number', description: 'Impuestos internos (%) si la posición los tiene, si no 0' },
        regimen: { type: 'string', enum: ['personal', 'comercial'], description: 'Por cantidad, nunca por el uso: personal = pequeño envío, hasta 3 unidades iguales; comercial = más de 3 unidades iguales (o si no se sabe).' },
        sin_franquicia: { type: 'boolean', description: 'true si el cliente de uso propio ya usó sus envíos con beneficio del año' },
        unidades: { type: 'number', description: 'Obligatorio: cantidad TOTAL de unidades que trae (por ejemplo 100 remeras). Sin esto no se cotiza: con esto se calcula cuánto le queda cada unidad puesta en su casa. Si el cliente cambió el peso o el pedido, tiene que ser la cantidad NUEVA (preguntala), nunca la vieja.' },
        con_cuit_puertobox: { type: 'boolean', description: 'true si el cliente no tiene CUIT y lo traemos con el CUIT de PuertoBox: gestión más alta, envío en Argentina aparte e impuestos que se le pagan a PuertoBox.' },
        con_bateria_litio: { type: 'boolean', description: 'true si el producto trae batería de litio incorporada (carga peligrosa: la aerolínea cobra un recargo sobre el flete).' },
        kg_por_unidad: { type: 'number', description: 'Peso de UNA unidad (con su caja) si el cliente lo dijo. Sirve para controlar que unidades y peso total cierren.' },
        largo_cm: { type: 'number', description: 'Largo de UNA caja (cajas iguales). Si son cajas de distintos tamaños, usá bultos.' }, ancho_cm: { type: 'number' }, alto_cm: { type: 'number' },
        bultos: {
          type: 'array',
          description: 'Solo si vienen cajas de DISTINTOS tamaños: un renglón por cada tipo de caja (cuántas hay de ese tamaño, sus medidas y, si se sabe, cuánto pesa cada una). Con bultos no hace falta cantidad_cajas ni largo/ancho/alto. kg sigue siendo el peso total de todo.',
          items: { type: 'object', properties: { cantidad: { type: 'number' }, largo_cm: { type: 'number' }, ancho_cm: { type: 'number' }, alto_cm: { type: 'number' }, kg_por_caja: { type: 'number' } }, required: ['cantidad', 'largo_cm', 'ancho_cm', 'alto_cm'] },
        },
        precio_venta_unidad: { type: 'number', description: 'A cuánto vende (o piensa vender) el cliente CADA unidad en Argentina, si lo dijo. Con esto se calcula cuánto le queda de ganancia por unidad.' },
        moneda_venta: { type: 'string', enum: ['ARS', 'USD'], description: 'Moneda de precio_venta_unidad: ARS si lo dijo en pesos (lo normal), USD si lo dijo en dólares.' },
      },
      required: ['kg', 'valor_factura_usd', 'die', 'regimen'], // + cantidad_cajas y medidas, o bultos (se controla abajo)
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
        quiere: { type: 'string', description: 'UNA línea corta (máx. 12 palabras) con lo que pide el cliente, en simple. Ej: "Cotización de 100 y 300 trípodes Bluetooth" o "Pagar el envío de remeras".' },
        para_vos: { type: 'string', description: 'UNA línea corta (máx. 12 palabras) con lo que tiene que hacer Gustavo. Ej: "Decirle si se puede homologar en ENACOM" o "Pasarle los datos para pagar".' },
        resumen: { type: 'string', description: 'Datos para Gustavo, cortos y en una línea cada uno: producto, unidades, kg, valor, posición, presupuesto dado, nombre.' },
      },
      required: ['motivo', 'quiere', 'para_vos', 'resumen'],
    },
  },
];

function ejecutar(nombre, input, ctx) {
  switch (nombre) {
    case 'clasificar_producto':
      return require('./clasificador').clasificar(input, ctx); // async: busca en internet y en ARCA
    case 'buscar_posicion': {
      const m = getMotor();
      const res = m.buscar(input.producto, 15).filter((f) => !f.c.startsWith('00')).slice(0, 5).map((f) => ({
        posicion: f.c, die: f.die, impuestos_internos: f.ii, descripcion: m.jerarquia(f).slice(-3).join(' › '),
        intervenciones_posibles: m.intervencionesDe(f).map((i) => i.organismo),
        // Criterios de clasificación de ARCA para esa posición (16/11): pesan más que la descripción del arancel.
        ...(() => { const cr = require('../src/criterios').dePosicion(f.c); return cr.length ? { criterios_arca: cr.map((c) => `Criterio ${c.criterio} (${c.norma}): ${c.desc}`) } : {}; })(),
      }));
      const parecidos = require('../src/criterios').buscar(input.producto, 3);
      if (!res.length) return { aviso: 'Sin resultados. Probá con otras palabras (por ejemplo, de qué material es o para qué se usa) o derivá a Gustavo.' };
      const guia = m.buscar(input.producto, 1)[0]?.frecuente;
      const extra = parecidos.length ? { criterios_arca_parecidos: parecidos.map((c) => `${c.pos}: criterio ${c.criterio} (${c.norma}) para "${c.desc}"`) } : {};
      if (guia) return { como_elegir: guia + ' Elegí la que corresponda según lo que dijo el cliente; si no sabés el material o el tipo, preguntalo. Es orientativa: la confirma nuestro despachante.', posiciones: res, ...extra };
      return parecidos.length ? { posiciones: res, ...extra } : res;
    }
    case 'cotizar': {
      // Controles antes de dar un precio: datos imposibles o pedidos que no se cotizan por acá.
      if (!(input.kg > 0) || !(input.valor_factura_usd > 0)) return { error: 'Faltan el peso o el valor (tienen que ser mayores a 0). Preguntáselos al cliente; no cotices.' };
      if (input.valor_factura_usd > NEG.tope_por_envio_usd) return { aviso: `Supera el tope de USD ${NEG.tope_por_envio_usd} por envío: dividilo en ${Math.ceil(input.valor_factura_usd / NEG.tope_por_envio_usd)} envíos de hasta USD ${NEG.tope_por_envio_usd} (repartí el valor, los kilos y las cajas enteras lo más parejo posible) y llamá cotizar una vez por cada envío. Mostrá cada envío y el total.` };
      // Sin todos los parámetros no hay presupuesto (Gustavo 15/11 17:59: "no podemos pasar presupuestos sin todos los parámetros";
      // un cliente de difusores recibió un presupuesto sin medidas de la caja).
      // Cajas de distintos tamaños (16/11): se normalizan los renglones y se reemplazan cantidad y medidas.
      const bultosOk = Array.isArray(input.bultos) ? input.bultos.filter((b) => b && b.cantidad > 0) : [];
      if (bultosOk.length) {
        if (bultosOk.some((b) => !(b.largo_cm > 0 && b.ancho_cm > 0 && b.alto_cm > 0))) return { error: 'Falta medir alguna caja: cada tipo de caja necesita largo, ancho y alto en cm. No cotices ni des ningún número: pedile al cliente las medidas que faltan.' };
        input = { ...input, cantidad_cajas: bultosOk.reduce((t, b) => t + Math.round(b.cantidad), 0), largo_cm: bultosOk[0].largo_cm, ancho_cm: bultosOk[0].ancho_cm, alto_cm: bultosOk[0].alto_cm, bultos: bultosOk.map((b) => ({ cantidad: Math.round(b.cantidad), largo_cm: b.largo_cm, ancho_cm: b.ancho_cm, alto_cm: b.alto_cm, ...(b.kg_por_caja > 0 ? { kg_por_caja: b.kg_por_caja } : {}) })) };
      } else if (input.bultos) { input = { ...input, bultos: undefined }; }
      if (!(input.cantidad_cajas > 0)) return { error: 'Falta cuántas cajas son. No cotices ni des ningún número: preguntale al cliente si viene en una caja o en varias.' };
      if (!(input.largo_cm > 0 && input.ancho_cm > 0 && input.alto_cm > 0)) return { error: 'Faltan las medidas de la caja (largo, ancho y alto en cm). No cotices ni des ningún número, ni aproximado: pedíselas al cliente; si no las sabe, pasale el mensaje en inglés para el proveedor.' };
      // 16/11 (revisión general): la regla de Gustavo del 15/11 17:59 incluye las unidades ("todos los parámetros"),
      // pero solo estaba en el texto. Sin unidades no se sabe el régimen ni el costo por unidad. El cotizador a mano de Gustavo no la exige.
      if (!ctx.manual && !(input.unidades > 0)) return { error: 'Falta cuántas unidades son en total. No cotices ni des ningún número: preguntáselo al cliente (si son productos distintos, cuántas de cada uno).' };
      // Unidades y peso tienen que cerrar (15/11: 10 arrancadores de 0,9 kg cotizados como 23 kg → el costo por unidad salió inflado).
      if (input.unidades > 0 && input.kg_por_unidad > 0) {
        const esperado = input.unidades * input.kg_por_unidad;
        if (Math.abs(input.kg - esperado) / esperado > 0.3) {
          return { error: `No cierran unidades y peso: ${input.unidades} unidades de ${input.kg_por_unidad} kg son unos ${Math.round(esperado * 10) / 10} kg, no ${input.kg} kg. No cotices: preguntale al cliente (una sola pregunta) cuántas unidades entran en ${input.kg} kg, y después cuánto paga por ese pedido.` };
        }
      }
      // La posición elegida en la charla manda: el derecho no puede cambiar de un presupuesto a otro (15/11: 35% y después 20%).
      const leadPos = ctx.store.lead ? ctx.store.lead(ctx.telefono) : null;
      const fija = leadPos && leadPos.posicion_fija;
      if (fija) { input = { ...input, die: fija.die, internos: fija.internos || 0 }; }
      const cajas = input.cantidad_cajas || 1;
      const conMedidas = !!(input.largo_cm && input.ancho_cm && input.alto_cm);
      // Sin cantidad de cajas no se sabe cuánto pesa cada una: no se cobra recargo ni se pide dividir (15/11, auditoría de charlas: 30 kg sin cajas sumaba USD 45).
      const cajasDadas = input.cantidad_cajas > 0 || !!(input.largo_cm && input.ancho_cm && input.alto_cm); // con medidas de una caja, se sabe que es una
      // Con cajas distintas y el peso de cada una, se controla caja por caja; si no, con el promedio.
      const pesosPorCaja = input.bultos && input.bultos.every((b) => b.kg_por_caja > 0) ? input.bultos.map((b) => ({ kg: b.kg_por_caja, n: b.cantidad })) : [{ kg: input.kg / cajas, n: cajas }];
      const cajaPesada = cajasDadas && pesosPorCaja.some((x) => x.kg > NEG.caja_max_kg);
      const r = presupuesto({
        kg: input.kg, cajas: input.cantidad_cajas || 1, largo: input.largo_cm, ancho: input.ancho_cm, alto: input.alto_cm,
        bultos: input.bultos ? input.bultos.map((b) => ({ cantidad: b.cantidad, largo: b.largo_cm, ancho: b.ancho_cm, alto: b.alto_cm })) : null,
        valorFactura: input.valor_factura_usd, die: input.die, internos: input.internos || 0, regimen: input.regimen,
        conFranquicia: !input.sin_franquicia,
      });
      // Lead cotizado (si todavía no avanzó a otro estado): así aparece en el seguimiento si el cliente no vuelve.
      const previo = ctx.store.lead ? ctx.store.lead(ctx.telefono) : null;
      if (!previo || !previo.estado || previo.estado === 'nuevo' || previo.estado === 'cotizado') {
        ctx.store.guardarLead(ctx.telefono, { estado: 'cotizado', kg: input.kg, valor_usd: input.valor_factura_usd });
      }
      // Última cotización completa en el lead: con esto se arma solo el presupuesto formal en PDF (15/11).
      if (ctx.store.guardarLead) ctx.store.guardarLead(ctx.telefono, { cotizacion: { en: new Date().toISOString(), input: { kg: input.kg, cantidad_cajas: cajas, largo_cm: input.largo_cm, ancho_cm: input.ancho_cm, alto_cm: input.alto_cm, ...(input.bultos ? { bultos: input.bultos } : {}), valor_factura_usd: input.valor_factura_usd, die: input.die, internos: input.internos || 0, regimen: input.regimen, unidades: input.unidades, con_cuit_puertobox: !!input.con_cuit_puertobox, con_bateria_litio: !!input.con_bateria_litio, ...(input.precio_venta_unidad > 0 ? { precio_venta_unidad: input.precio_venta_unidad, moneda_venta: input.moneda_venta || 'ARS' } : {}) }, r: null } });
      const avisos = [];
      // 15/11 (prueba completa): 18 kg en 2 cajas de 60x40x40 se cobran como 39 kg y el cliente no se enteraba por qué le salía el doble.
      if (conMedidas && r.kg_presupuestado > input.kg * 1.3) avisos.push(`Las cajas son grandes para lo que pesan: se cobran como ${String(r.kg_presupuestado).replace('.', ',')} kg en vez de ${String(input.kg).replace('.', ',')} kg. Decíselo al cliente en una línea, simple ("las cajas son grandes para lo que pesan, por eso el flete se cobra por tamaño") y sugerile pedirle al proveedor cajas más chicas o más llenas: así baja el flete.`);
      if (cajaPesada) avisos.push(`Hay cajas de más de ${NEG.caja_max_kg} kg: el máximo por bulto del courier es ${NEG.caja_max_kg} kg. Decile que el proveedor tiene que dividirlas y no digas que el flete es firme.`);
      // Cajas de más de 23 kg: la aerolínea cobra un recargo por caja (data/forwarder.json → sobrepeso_bulto). Se le cobra al cliente (Gustavo 15/11: "cobramos lo que corresponda").
      const sob = require('../data/forwarder.json').recargos?.sobrepeso_bulto || require('../data/forwarder.json').sobrepeso_bulto;
      const tc = require('../data/forwarder.json').tipo_cambio.rmb_a_usd;
      const recargoCajas = sob && cajasDadas ? pesosPorCaja.reduce((t, x) => t + (x.kg > sob.umbral_kg && x.kg <= NEG.caja_max_kg ? Math.ceil(sob.monto_rmb * sob.factor * tc) * x.n : 0), 0) : 0;
      if (recargoCajas) avisos.push(`Cajas de más de ${sob.umbral_kg} kg: la aerolínea cobra un recargo por caja, ya sumado (recargo_cajas_usd). Mostralo en una línea aparte en el presupuesto ("Recargo por cajas de más de ${sob.umbral_kg} kg: USD X") y decile que si el proveedor arma cajas de hasta ${sob.umbral_kg} kg, se ahorra ese recargo.`);
      // Batería de litio: carga peligrosa, recargo sobre el flete (data/forwarder.json → recargos.bateria_litio).
      const lit = require('../data/forwarder.json').recargos?.bateria_litio;
      const recargoLitio = input.con_bateria_litio && lit ? Math.ceil(r.flete_puertobox_usd * (lit.valor - 1)) : 0;
      if (recargoLitio) avisos.push(`Trae batería de litio: carga peligrosa, la aerolínea cobra un recargo de ${Math.round((lit.valor - 1) * 100)}% sobre el flete, ya sumado (recargo_litio_usd). Mostralo en una línea aparte y pedí la hoja de seguridad (MSDS) y el informe UN38.3 de la batería.`);
      // Con el CUIT de PuertoBox (Gustavo 15/11): gestión más alta; llega a PuertoBox y se reenvía (envío en Argentina aparte).
      // Precio del anuncio que sigue corriendo (16/11): a los que vienen del anuncio, en el rango publicado, se les respeta.
      const aa = NEG.anuncio_anterior;
      const chatOrigen = ctx.store.chats ? (ctx.store.chats().find((c) => c.telefono === ctx.telefono) || {}).origen : null;
      const respetaAnuncio = !!(aa && chatOrigen === 'anuncio' && new Date().toISOString().slice(0, 10) <= aa.hasta && r.kg_presupuestado >= aa.desde_kg && r.kg_presupuestado <= aa.hasta_kg && aa.gestion_usd < r.handling_puertobox_usd);
      const handling = input.con_cuit_puertobox ? NEG.gestion_cuit_puertobox_usd : respetaAnuncio ? aa.gestion_usd : r.handling_puertobox_usd;
      if (input.con_cuit_puertobox) avisos.push(`Va con el CUIT de PuertoBox: la gestión es USD ${handling} (no ${r.handling_puertobox_usd}), porque llega a nuestro domicilio y se lo reenviamos. Aclarale en una línea que el envío dentro de Argentina se cobra aparte, a lo que cueste, y que los impuestos estimados nos los paga a nosotros antes de que le despachemos la caja (no a la empresa de transporte).`);
      const totalPB = r.flete_puertobox_usd + handling + recargoCajas + recargoLitio;
      // Costo por unidad puesta en la casa del cliente: producto + flete + gestión + impuestos estimados, dividido las unidades.
      const unidades = Math.round(input.unidades || 0);
      const porUnidad = unidades > 0 ? {
        costo_por_unidad_usd: Math.round(((input.valor_factura_usd + totalPB + r.impuestos_estimados_usd.total) / unidades) * 100) / 100,
        producto_por_unidad_usd: Math.round((input.valor_factura_usd / unidades) * 100) / 100,
        unidades,
      } : {};
      // Ganancia por unidad (15/11, Gustavo aprobó "hablar de ganancia, no de costo"): precio de venta − costo puesto en su casa.
      const dolar = require('../src/dolar').valor(); // se actualiza solo (src/dolar.js); respaldo: negocio.json
      if (porUnidad.costo_por_unidad_usd && input.precio_venta_unidad > 0 && dolar > 0) {
        const ventaUsd = input.moneda_venta === 'USD' ? input.precio_venta_unidad : input.precio_venta_unidad / dolar;
        const gan = ventaUsd - porUnidad.costo_por_unidad_usd;
        porUnidad.ganancia_por_unidad_usd = Math.round(gan * 100) / 100;
        porUnidad.ganancia_por_unidad_ars = Math.round((gan * dolar) / 100) * 100;
        porUnidad.costo_por_unidad_ars = Math.round((porUnidad.costo_por_unidad_usd * dolar) / 100) * 100;
        porUnidad.margen_sobre_costo_pct = Math.round((gan / porUnidad.costo_por_unidad_usd) * 100);
        porUnidad.dolar_usado_ars = dolar;
        avisos.push(`Ganancia: mostrala en una o dos líneas y en la moneda en que te habló el cliente: "Cada unidad te queda en unos $${porUnidad.costo_por_unidad_ars.toLocaleString('es-AR')} puesta en tu casa; si la vendés a $X, te quedan unos $${porUnidad.ganancia_por_unidad_ars.toLocaleString('es-AR')} por unidad (${porUnidad.margen_sobre_costo_pct}% sobre el costo)." Aclarale que es estimado, con dólar oficial de $${dolar}, y que no descuenta comisiones de venta (Mercado Libre, envío) ni tu monotributo.${gan <= 0 ? ' OJO: no le queda ganancia: decíselo con honestidad y sin vueltas.' : ''}`);
      }
      const resultado = {
        ...(fija ? { posicion: fija.posicion, posicion_a_confirmar: fija.confianza !== 'alta' && !fija.confirmada } : { posicion: 'a confirmar' }),
        flete_firme: conMedidas && !cajaPesada,
        ...porUnidad,
        ...(avisos.length ? { aviso: avisos.join(' ') } : {}),
        flete_puertobox_usd: r.flete_puertobox_usd,
        handling_puertobox_usd: handling,
        kg_presupuestado: r.kg_presupuestado,
        impuestos_y_gastos_estimados_usd: r.impuestos_estimados_usd.total,
        detalle_impuestos: r.impuestos_estimados_usd,
        ...(recargoCajas ? { recargo_cajas_usd: recargoCajas } : {}),
        ...(recargoLitio ? { recargo_litio_usd: recargoLitio } : {}),
        total_puertobox_usd: totalPB,
        // Para cuando el cliente pregunta "¿cuánto me sale el kilo?" o compara con la publicidad (que dice el kilo con la gestión incluida).
        usd_por_kilo_con_gestion: Math.round((totalPB / r.kg_presupuestado) * 100) / 100,
        reglas: `El flete es PRECIO CERRADO: se respeta aunque la caja llegue hasta ${NEG.precio_cerrado_hasta_pct}% más pesada o grande; si supera eso, se ajusta con foto de la balanza. Se suma la gestión por envío (${NEG.gestion_texto}), ya incluida en total_puertobox_usd. El cliente le paga a PuertoBox SOLO total_puertobox_usd (flete + gestión); los impuestos son un estimado aparte que cobra el courier: nunca los sumes al total de PuertoBox. Nunca digas que si pesa menos paga menos. No le muestres al cliente kg_presupuestado ni el margen: solo el flete. Flete + handling se pagan al pesarse, antes de que salga. El envío de la fábrica al depósito en ${NEG.deposito_china} NO está incluido: lo paga el cliente (ideal: que lo incluya el proveedor; si lo paga PuertoBox, se suma aparte a lo que cueste). Impuestos y gasto administrativo son ESTIMADOS y se pagan directo a la empresa de transporte cuando entrega el paquete (decí "la empresa de transporte"; puede ser DHL, UPS o FedEx, no nombres una salvo que pregunten).`,
      };
      // precio_usd = lo que de verdad se le cobra (antes no sumaba recargos, gestión con CUIT de PuertoBox ni la del anuncio).
      if (ctx.store.guardarLead && ctx.store.lead) { const l = ctx.store.lead(ctx.telefono) || {}; if (l.cotizacion) ctx.store.guardarLead(ctx.telefono, { precio_usd: totalPB, cotizacion: { ...l.cotizacion, r: { ...resultado, reglas: undefined, aviso: undefined } } }); }
      return resultado;
    }
    case 'registrar_lead':
      ctx.store.guardarLead(ctx.telefono, input);
      return { ok: true };
    case 'derivar_a_gustavo':
      ctx.store.guardarLead(ctx.telefono, { estado: input.motivo === 'listo_para_cerrar' ? 'listo_para_cerrar' : 'derivado', notas: input.resumen });
      // Solo se pausa el bot cuando Gustavo tiene que tomar el chat. En "duda" el bot sigue atendiendo.
      if (input.motivo !== 'duda') ctx.store.pausar(ctx.telefono, 'derivado');
      if (ctx.store.marcar) ctx.store.marcar(ctx.telefono, { derivadoEn: Date.now(), derivadoMotivo: input.motivo, derivadoResumen: input.resumen, derivadoQuiere: input.quiere || '', derivadoParaVos: input.para_vos || '', recordatorios: 0 });
      // Cliente que confirmó y ya tiene presupuesto por chat: se arma solo el presupuesto formal (lo manda Gustavo con un botón).
      const presuFormal = input.motivo === 'listo_para_cerrar' && ctx.store.crearPresupuesto ? ctx.store.crearPresupuesto(ctx.telefono) : null;
      ctx.derivaciones.push({ telefono: ctx.telefono, ...input, ...(presuFormal ? { presupuesto: presuFormal.nro } : {}) });
      return input.motivo === 'duda'
        ? { ok: true, instruccion: 'Decile que ese punto lo confirma nuestro despachante (no digas el nombre de Gustavo) y seguí atendiendo vos el resto.' }
        : { ok: true, instruccion: 'Decile al cliente que nuestro despachante le escribe enseguida (no digas el nombre de Gustavo).' };
    default:
      return { error: `Herramienta desconocida: ${nombre}` };
  }
}

module.exports = { definiciones, ejecutar };
