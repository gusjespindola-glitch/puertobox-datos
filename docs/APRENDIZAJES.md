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
- **Flete firme**: se presupuesta con el peso cobrable del proveedor **+ 15%** de margen, más **handling fijo USD 10** por envío.
- El flete solo se ajusta si la caja llega **más de 15%** más pesada o grande (con foto de la balanza).
- **Nunca decir "si pesa menos, paga menos".**
- Al cliente no se le muestran las cuentas de kilos ni el margen: solo flete, handling, impuestos estimados y total.
- Impuestos y gasto administrativo los paga el cliente al courier; PuertoBox no los cobra.

### Bot de WhatsApp
- Corre en **Railway** (unos USD 5/mes) con **Claude Haiku 5.5** (centavos por conversación) y usa **YCloud** (plan Free) solo para pasar mensajes. Descartado: el AI Agent de YCloud, porque el Free no permite comprar créditos y el plan pago cuesta USD 39/mes.
- **No nombrar DHL.** Decir "courier aéreo express"; si preguntan, puede ser DHL, UPS o FedEx según el envío.
- **Saludar como PuertoBox**, sin presentarse como asistente o bot. Si preguntan si es un bot, dice la verdad (Gustavo revisa y cierra cada operación).
- **No derivar a Gustavo por errores técnicos**: el bot reintenta 3 veces y, si no puede, le pide al cliente que repita. Deriva solo para cerrar o pagar, cuando piden una persona, mayoristas, reclamos, marcas o intervenciones.
- Pedir **todos los datos que faltan en un solo mensaje**. Sin muletillas ("¡Genial!", "¡Anotado!", "Gracias").
- **Marcas reconocidas para reventa → no cotiza y deriva** (fraude marcario). Uso propio, hasta 3 unidades, sí.
- **Celulares y equipos con WiFi/Bluetooth/radio para reventa → ENACOM → deriva.**
- Comando `#borrar` desde el 698 para limpiar los chats de prueba.
- El número de Gustavo para avisos (OWNER_NUMBER) es el 698. Ojo: WhatsApp solo entrega esos avisos si el 698 le escribió al bot en las últimas 24 h. Está preparado el aviso por ntfy (variable NTFY_TOPIC).

### Errores que no hay que repetir
- Prometer en la web o en el bot algo que hace perder plata (la tolerancia del 15% sin cobrarla).
- Dejar textos de ejemplo ("PEGÁ_ACÁ_...") en plantillas que Gustavo pega tal cual: dar el valor exacto o decir explícitamente qué reemplazar.
- Mostrar claves en capturas: avisar antes de la pantalla que la muestra.
- Aprobar (merge) un PR mientras todavía se suben commits: terminar todo y recién después pasar el link.
- Cotizar sin revisar marca, intervenciones ni régimen.
