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
- **Una sola pregunta por mensaje** (corrección del 13/11, reemplaza a "dos datos"): el cliente no sabe de importación, hay que llevarlo de la mano. Preguntar primero si sabe el dato ("¿Sabés cuánto pesa?") y si no, pasarle el mensaje en inglés para el proveedor. Antes era: pedir como mucho dos datos por mensaje, en orden y con palabras simples (nada de "peso bruto", "volumétrico", "FOB"). Pedir todo junto marea al cliente (corrección del 13/11). Sin muletillas ("¡Genial!", "¡Anotado!", "Gracias").
- **El bot siempre responde.** Nunca dejar al cliente en visto: si la IA no devuelve texto, se reintenta; si el chat está derivado, el cliente recibe un aviso de espera (uno cada 3 h). Derivar por "duda" no pausa el bot.
- **Marcas reconocidas para reventa → no cotiza y deriva** (fraude marcario). Uso propio, hasta 3 unidades, sí.
- **Celulares y equipos con WiFi/Bluetooth/radio para reventa → ENACOM → deriva.**
- Comando `#borrar` desde el 698 para limpiar los chats de prueba.
- El número de Gustavo para avisos (OWNER_NUMBER) es el 698. Ojo: WhatsApp solo entrega esos avisos si el 698 le escribió al bot en las últimas 24 h. Está preparado el aviso por ntfy (variable NTFY_TOPIC).

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
