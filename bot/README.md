# Bot de WhatsApp de PuertoBox

Atiende a los clientes en **tu mismo número** (WhatsApp Coexistence), cotiza con la fórmula y la base SIM del repo, y te pasa el chat cuando el cliente está listo para cerrar.

## Qué hace

| El bot | Vos |
|---|---|
| Saluda, pregunta producto, valor, peso y uso | Recibís un aviso con el resumen cuando el cliente quiere avanzar |
| Busca la posición SIM y cotiza con la fórmula (28/kg + 55% o 70%) | Confirmás, cobrás y cerrás desde tu app de siempre |
| Explica plazos, pagos, prohibidos y datos del proveedor | Reclamos, mayoristas grandes y dudas raras |
| Registra cada lead (planilla descargable en CSV) | |

- **Si escribís vos en un chat desde la app, el bot se calla en ese chat** durante 24 h (se ajusta con `PAUSA_HORAS`).
- Para devolverle el chat al bot, escribí `#bot` en ese chat.
- Si le preguntan si es un bot, dice la verdad: es el asistente virtual de PuertoBox y vos cerrás cada operación.

Para cambiar cómo habla o qué responde, se edita `prompt.md`. No hace falta tocar código.

## Costos aproximados
- WhatsApp Cloud API: 1.000 mensajes de servicio gratis por mes por número; después, alrededor de USD 0,026 por mensaje.
- IA (Anthropic, modelo Haiku): unos centavos por conversación.
- Servidor: USD 5-7/mes (Railway o Render pago, para que no se duerma).

## Puesta en marcha

### 1. Cuentas
1. **Meta Business** (business.facebook.com) verificada con tus datos.
2. **Anthropic** (console.anthropic.com): crear una API key y cargar crédito.
3. **Railway** (railway.app) o **Render** (render.com) para el servidor.

### 2. Conectar tu número con Coexistence
1. En developers.facebook.com, crear una app de tipo *Business* y agregarle el producto **WhatsApp**.
2. Conectar tu número **existente de WhatsApp Business** con la opción de Coexistence (Embedded Signup: "conectar una cuenta de la app WhatsApp Business"). Se confirma desde la app con un código. Si Meta no ofrece la opción en tu cuenta, se hace a través de un proveedor (BSP) que tenga Coexistence.
3. Anotar el **Phone Number ID** y generar un **token permanente** (usuario del sistema en Business Settings con permiso `whatsapp_business_messaging`).
4. Mantené la app de WhatsApp Business abierta y en uso en tu celular. Si no la abrís por mucho tiempo, Meta puede desconectar la coexistencia.

### 3. Deploy
1. En Railway: *New Project → Deploy from GitHub repo* → `puertobox-datos`. Comando de inicio: `node bot/server.js`.
2. Variables de entorno:

| Variable | Qué es |
|---|---|
| `ANTHROPIC_API_KEY` | Tu API key de Anthropic |
| `ANTHROPIC_MODEL` | Opcional. Por defecto `claude-haiku-5-5` |
| `WHATSAPP_TOKEN` | Token permanente de Meta |
| `PHONE_NUMBER_ID` | ID del número en Meta |
| `VERIFY_TOKEN` | Una palabra secreta que elegís vos |
| `OWNER_NUMBER` | Tu número personal (formato 549XXXXXXXXXX) para recibir los avisos |
| `ADMIN_KEY` | Clave para descargar los leads |
| `DATA_FILE` | Ruta del archivo de datos (usar un volumen persistente) |

3. En Meta → WhatsApp → Configuración → Webhook: URL `https://TU-APP.up.railway.app/webhook`, token = `VERIFY_TOKEN`. Suscribir los campos **messages** y **smb_message_echoes**.

### 4. Probar antes de abrirlo
1. Escribile al número desde otro celular y probá: una cotización, un producto prohibido, "quiero avanzar".
2. Revisá que te llegue el aviso y que el bot se calle cuando contestás vos.
3. Leads: `https://TU-APP.up.railway.app/leads?key=ADMIN_KEY` (se abre en Excel).

**Aviso a tu número personal:** WhatsApp solo deja mandar texto libre dentro de las 24 h desde el último mensaje que le escribiste al número del negocio. Escribile "hola" una vez por día desde tu personal, o pedime que lo pase a una plantilla de utilidad aprobada.

## Desarrollo
- Tests: `node --test bot/test/*.test.js` (simulan conversaciones sin gastar API).
- Archivos: `server.js` (webhook), `agent.js` (IA), `tools.js` (cotizar, buscar posición, registrar lead, derivar), `store.js` (datos), `prompt.md` (personalidad y reglas).
