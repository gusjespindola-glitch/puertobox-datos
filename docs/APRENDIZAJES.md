# Aprendizajes y decisiones de PuertoBox

Memoria del proyecto. Cada vez que Gustavo decide o corrige algo, se anota acá con fecha. Lo más nuevo, arriba.

## Cómo trabajar con Gustavo
- Ir **de a un paso por vez** y esperar que confirme. Nada de cinco pasos juntos.
- Explicar simple, sin jerga técnica. Si algo no se entiende, reformular más corto.
- Recomendar una opción y decir por qué, sin comparaciones largas.
- **Avisar antes de cualquier costo** (planes pagos, recargas automáticas, vencimientos). Nada de sorpresas.
- Textos para copiar y pegar: siempre la versión completa.
- Las claves (Anthropic, YCloud) nunca van en el chat ni en el repo: se cargan solo en Railway.
- Gustavo es despachante matriculado: las reglas aduaneras las valida él, y su material del curso es la referencia.

## Decisiones del 13/11/2026

### Precio
- **Precio (opción C, decidida el 13/11 a la noche):** flete por el kilo cobrable del proveedor **sin el 15%**, más **gestión fija USD 20** por envío. Precio cerrado: el flete se respeta aunque la caja llegue hasta 15% más pesada; el riesgo lo cubre la gestión. Antes era peso + 15% y handling USD 10: Gustavo lo vio caro ("la merma por la medida es muy grande").
- El flete solo se ajusta si la caja llega **más de 15%** más pesada o grande (con foto de la balanza). En el peor caso nunca se pierde (mínimo USD 17 de ganancia, en 2 kg).
- **Nunca decir "si pesa menos, paga menos".**
- Al cliente no se le muestran las cuentas de kilos ni el margen: solo flete, handling, impuestos estimados y total.
- Impuestos y gasto administrativo los paga el cliente al courier; PuertoBox no los cobra.

### Bot de WhatsApp
- Corre en **Railway** (unos USD 5/mes) con **Claude Haiku 5.5** (centavos por conversación) y usa **YCloud** (plan Free) solo para pasar mensajes. Descartado: el AI Agent de YCloud, porque el Free no permite comprar créditos y el plan pago cuesta USD 39/mes.
- **No nombrar DHL.** Decir "courier aéreo express"; si preguntan, puede ser DHL, UPS o FedEx según el envío.
- **Tono profesional y cordial (13/11):** nada de "al toque", "joya", "che", "buenísimo" ni emojis. Saludo: "Hola, gracias por comunicarte con PuertoBox. ¿Qué producto querés importar desde China?". Se mantiene el "vos".
- **Saludar como PuertoBox**, sin presentarse como asistente o bot. Si preguntan si es un bot, dice la verdad (Gustavo revisa y cierra cada operación).
- **No derivar a Gustavo por errores técnicos**: el bot reintenta 3 veces y, si no puede, le pide al cliente que repita. Deriva solo para cerrar o pagar, cuando piden una persona, mayoristas, reclamos, marcas o intervenciones.
- **Una sola pregunta por mensaje** (corrección del 13/11, reemplaza a "dos datos"): el cliente no sabe de importación, hay que llevarlo de la mano. Preguntar primero si sabe el dato ("¿Sabés cuánto pesa?") y si no, pasarle el mensaje en inglés para el proveedor. Antes era: pedir como mucho dos datos por mensaje, en orden y con palabras simples (nada de "peso bruto", "volumétrico", "FOB"). Pedir todo junto marea al cliente (corrección del 13/11). Sin muletillas ("¡Genial!", "¡Anotado!", "Gracias").
- **El bot siempre responde.** Nunca dejar al cliente en visto: si la IA no devuelve texto, se reintenta; si el chat está derivado, el cliente recibe un aviso de espera (uno cada 3 h). Derivar por "duda" no pausa el bot.
- **Marcas reconocidas para reventa → no cotiza y deriva** (fraude marcario). Uso propio, hasta 3 unidades, sí.
- **Celulares y equipos con WiFi/Bluetooth/radio para reventa → ENACOM → deriva.**
- Comando `#borrar` desde el 698 para limpiar los chats de prueba.
- El número de Gustavo para avisos (OWNER_NUMBER) es el 698. Ojo: WhatsApp solo entrega esos avisos si el 698 le escribió al bot en las últimas 24 h. Está preparado el aviso por ntfy (variable NTFY_TOPIC).

- **Ubicación (13/11):** PuertoBox es de La Plata. No hay local ni retiro: solo envíos a domicilio. Empresa online sin depósito físico para bajar costos y que al cliente le salga más barato.

- **Web sin cotizador (13/11):** cotiza solo el bot. La web manda a WhatsApp.

### Nomenclador
- Gustavo quiere una herramienta tipo Tarifar/PCRAM para él (despachante) y para el bot: nomenclador + calculadora. Legislación, jurisprudencia y estadísticas, más adelante si se consiguen las bases.
- Posiciones: archivos oficiales de ARCA (Arancel Integrado), no VUCE. Las intervenciones no vienen en ARCA: tabla curada propia, siempre "confirmar en VUCE".
- Zapatillas deportivas = 6404.11 (no 6404.19, que son las urbanas). Las posiciones "presentados desmontados" tienen DIE 0%: no usarlas para calzado armado.

- Gustavo quiere estar actualizado como con Tarifar/PCRAM: revisión semanal de normas (tarea de los lunes) y acceso al nomenclador desde el celular (Railway, con clave).

### Precios y mejora continua
- Gustavo quiere: revisar la competencia todas las semanas, analizar si gana bien, poco o puede perder con cada precio nuevo, proponer variantes (sin estudios a fondo) y hacer pruebas del bot todo el tiempo. Todo se guarda en el repo (`docs/precios/`, `docs/pruebas/`).

### Errores que no hay que repetir
- Prometer en la web o en el bot algo que hace perder plata (la tolerancia del 15% sin cobrarla).
- Dejar textos de ejemplo ("PEGÁ_ACÁ_...") en plantillas que Gustavo pega tal cual: dar el valor exacto o decir explícitamente qué reemplazar.
- Mostrar claves en capturas: avisar antes de la pantalla que la muestra.
- Aprobar (merge) un PR mientras todavía se suben commits: terminar todo y recién después pasar el link.
- Cotizar sin revisar marca, intervenciones ni régimen.

- 13/11/2026: Gustavo: "Cotizá gratis" no puede llevar a un cotizador de la web; tiene que ir directo al WhatsApp del bot. Sacar de la web todo lo innecesario (formulario, sección repetida, links muertos). La web se sirve desde el repo con un Worker que lee `web/sitio/index.html`, para no tener que subirla a mano.
- 13/11/2026: el Worker de la web usa archivos subidos ("Automatic deployment on upload"); pegar código en el editor no cambia lo que se ve. Se actualiza subiendo el index.html nuevo con New deployment. Desde el celular el editor de Cloudflare no deja pegar: hacerlo desde la PC.
- 13/11/2026: Gustavo: "si cambio una cosa, que cambie todo". Base única: precios en precios_venta.json, contacto y reglas en negocio.json; bot, web y páginas leen de ahí. Nada que complique; todo lo que traiga clientes.
- 13/11/2026: dominio conectado a Railway con el botón Connect (Cloudflare). Antes hubo que sacar puertobox.com.ar y www del Worker (registro AAAA 100:: con candado). El trial de Railway permite un solo dominio propio.
- 13/11/2026: Gustavo no tiene local (trabaja desde su casa): nada de Perfil de Google ni dirección publicada. Sí al bot en Instagram.
- 13/11/2026: no pedir cargas de saldo "por las dudas": primero medir el gasto real. El bot gasta menos de 1 centavo por conversación.
- 13/11/2026: al crear claves de API, poner vencimiento "Nunca" (la consola propone 30 días y el bot se cortaría).
- 13/11/2026: Gustavo quiere que el bot responda solo las dudas comunes (Responsable Inscripto, monotributista, vender por mayor, CUIT, envíos por año). Monotributo para vender: SÍ, tranquilamente (Gustavo 13/11 23:00): la nacionalización la hace el courier, la mercadería le llega ya nacionalizada; no hace falta ser RI ni inscribirse como importador (hasta USD 3.000 por envío). Pendiente que Gustavo confirme qué responder sobre usar el CUIT de otro (o el suyo).
- Gustavo dicta por voz: el texto llega con palabras cambiadas ("quit" = CUIT, "Rob" = bot, "responsable escrito" = inscripto, "meteorista" = monotributista). Interpretar y confirmar lo dudoso.
- 13/11/2026 (Gustavo): el tope de courier es USD 3.000 POR ENVÍO (por vuelo), no por pedido ni por año; peso 50 kg por bulto, total sin límite. Un pedido de USD 8.000 = 3 envíos, no se deriva. El bot divide solo (`cotizar`) y cotiza el total. Se deriva solo desde USD 15.000 (dato en negocio.json, a confirmar por Gustavo) o marítimo/contenedor. Error mío: había puesto "más de 50 kg o más de USD 3.000 = mayorista".
- 13/11/2026 23:04 (Gustavo): una cosa es lo que permite la norma y otra lo que se puede hacer. El cliente/proveedor no va a querer separar un pedido en varios vuelos → NO ofrecer dividir. Pedido > USD 3.000 = lo cotiza Gustavo (el bot junta datos). Revertido el split automático.
- 13/11/2026: Gustavo pide que lo normativo lo investigue yo, actualizado, sin pedirle que busque. Resultado: SIDIP hoy = solo celulares; courier comercial sin percepciones (DI, TE, IVA).
- 14/11/2026: Gustavo pidió un estudio completo (bot, web, precios) pensando en su método de venta. Errores encontrados que no hay que repetir: webhook sin verificar firma (permitía falsificar comandos de Gustavo), tramos de precio donde pesar menos costaba más, y "flete firme" sin medidas o con cajas de más de 23 kg. Informe: `docs/auditoria/2026-11-14-completa.md`.
- 14/11/2026 (Gustavo): electrodomésticos y máquinas que tocan alimentos (licuadoras, pavas, procesadoras, robots de cocina) NO llevan el permiso de envases (confirmado: instructivo ENV de ANMAT excluye electrodomésticos de uso doméstico, accesorios, repuestos y maquinaria). Para vender se cotizan con aviso de seguridad eléctrica. El permiso sanitario es solo para envases y utensilios sueltos.
- 14/11/2026 (Gustavo): la portada de la web tiene que mostrar los números del modelo actual. Muestra el kilo con la gestión incluida (usd_kg_total_desde), igual que el bot.
- 14/11/2026 (Gustavo): el merge de los PR lo hago yo, siempre. No pedirle que confirme ni que apriete Merge. Cuando algo necesite que él haga un paso (Railway, YCloud), explicarlo de a un paso, con dónde tocar exactamente.
- 14/11/2026 (Gustavo): el envío de la fábrica al depósito en Shenzhen (movimiento interno en China) lo paga el cliente; no está en el flete ni en la gestión. Lo ideal es que lo incluya el proveedor (el mensaje en inglés se lo pide). Si lo paga PuertoBox, se le suma al cliente aparte, a lo que cueste. Dato en negocio.json (`envio_interno_china`, `deposito_china`).
- 14/11/2026 (Gustavo): el presupuesto tiene que dejar claro qué le paga el cliente a PuertoBox (flete + gestión = "Total a PuertoBox"). Los impuestos del courier van aparte, como dato estimado ("no se paga a PuertoBox"). Nunca un total que sume las dos cosas.
- 14/11/2026 (Gustavo): si una mejora implica pagar, mejor no por ahora; seguir con lo que hay. Audios de WhatsApp: quedan para más adelante (la opción gratis es Groq/Whisper).
- 14/11/2026 (Gustavo): audios sí, si es gratis. Se hizo con Groq (Whisper, plan gratis sin tarjeta).
- 14/11/2026 (Gustavo): quiere un asistente que le recuerde clientes sin atender, los importantes y los olvidados. Y un solo aviso por cosa: no WhatsApp + ntfy a la vez (era mucho). Se hizo: todo por ntfy, recordatorios con importantes primero, resumen a las 9, silencio de 22 a 8, comandos #pendientes y #listo.
- 14/11/2026 (Gustavo): no se acuerda de comandos; todo tiene que ser intuitivo. Se reemplazaron por botones en la notificación de ntfy («Ya lo atendí», «Ver pendientes»). No darle comandos para memorizar.
- 14/11/2026 (Gustavo): el asistente en lenguaje natural para su número ("Jarvis") quedó sin efecto. Alcanza con los avisos de ntfy y sus botones.
- 14/11/2026: con la factura real de UPS de Gustavo (8,5 kg desde Corea) se vio que Aduana usa el flete declarado por el courier (~USD 2,50/kg, igual que en la de FedEx), no lo que cobra PuertoBox. Error mío: estimaba impuestos con nuestro flete de venta y los inflaba hasta el triple. Corregido y con test contra la factura.
- 14/11/2026: revisión 2. Errores que no hay que repetir: endpoint (Instagram) que procesa sin verificar firma aunque el canal no esté activo; links de acción que se ejecutan con GET (las vistas previas los disparan); avisos que dependen de un estado ("cotizado") que nadie marca. Hacer muchos merges seguidos reinicia el bot: juntar cambios.
- 14/11/2026 (Gustavo): no le andaba #borrar (el celular lo corrige o lo dice por audio). Desde su número ahora se entiende "borrar", "reiniciar", "empezar de nuevo" (con o sin #, texto o audio) y "pendientes" / "¿quién me falta atender?".
- 14/11/2026 (Gustavo): quiere verificar en INPI la marca que trae el cliente. El buscador de INPI está en el Portal de Trámites con clave fiscal (sin acceso automático). Se hizo: con marca no reconocida para vender, el bot pregunta el nombre, cotiza y le pasa a Gustavo "Verificar marca en INPI: X" antes de cerrar. Marcas famosas: como antes, no cotiza.
- 14/11/2026 (Gustavo): al cliente no se le dice su nombre: "nuestro despachante" (singular: hoy es uno solo; "nuestros despachantes" sería engañoso). Los impuestos se pagan a "la empresa de transporte que te entrega el paquete": no "courier" (palabra técnica) ni "aerolínea" (no es verdad, la factura la hace DHL/UPS/FedEx). La web mantiene su nombre y matrícula en el pie (credencial).
