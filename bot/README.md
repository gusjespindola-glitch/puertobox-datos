# Bot de WhatsApp de PuertoBox

Atiende a los clientes en **una línea propia del bot** conectada por **YCloud**, cotiza con la tarifa de flete y la base SIM del repo, y te avisa cuando el cliente está listo para cerrar.

> Tu número actual (+54 9 221 698-2199) **no** se pudo conectar por coexistencia: Meta lo rechaza con el error #3441034. Por eso el bot usa un número nuevo.

## Qué hace

| El bot | Vos |
|---|---|
| Saluda y pide producto, valor, peso, medidas, uso y código postal | Recibís un aviso con el resumen cuando el cliente quiere avanzar |
| Busca la posición SIM y presupuesta: flete firme (+15% de tolerancia) + impuestos estimados | Confirmás, cobrás y cerrás |
| Explica régimen personal o comercial, pagos y prohibidos | Reclamos, mayoristas grandes y dudas raras |
| Registra cada lead (planilla CSV) | |

**Comandos desde tu número personal** (escribiéndole al número del bot):
- `#pausa 549XXXXXXXXXX` → el bot se calla en ese chat.
- `#bot 549XXXXXXXXXX` → el bot vuelve a atender ese chat.

Para cambiar cómo habla o qué responde, se edita `prompt.md`. Para cambiar tarifas, `data/precios_venta.json` (bloque `flete_directo`).

## Puesta en marcha

1. **Número nuevo**: chip prepago que **nunca** se haya usado en WhatsApp (o borrá su cuenta de WhatsApp antes).
2. **YCloud** → WhatsApp Manager → WhatsApp accounts → **WhatsApp Business API → Get started**. En la ventana de Meta: "Ingresar un nuevo número", poné el número nuevo y verificá con el código por SMS.
3. **Anthropic** (console.anthropic.com) → API Keys → crear una clave y cargar USD 5 de crédito.
4. **Railway** (railway.app) → New Project → Deploy from GitHub repo → `puertobox-datos`. Se inicia solo con `npm start`. Agregá un volumen montado en `/data`.
5. **Variables en Railway:**

| Variable | Qué es |
|---|---|
| `ANTHROPIC_API_KEY` | Clave de Anthropic |
| `YCLOUD_API_KEY` | YCloud → Developers → API Keys |
| `BUSINESS_NUMBER` | Número del bot, formato 549XXXXXXXXXX |
| `OWNER_NUMBER` | Tu número personal, formato 549XXXXXXXXXX |
| `ADMIN_KEY` | Clave para descargar los leads |
| `DATA_FILE` | `/data/data.json` |

6. **Webhook en YCloud** → Developers → Webhooks → nuevo endpoint: `https://TU-APP.up.railway.app/webhook`, evento `whatsapp.inbound_message.received`.
7. **Probar** desde otro celular: una cotización, un prohibido y "quiero avanzar". Leads en `https://TU-APP.up.railway.app/leads?key=ADMIN_KEY`.

**Aviso a tu número personal:** WhatsApp solo deja mandar texto libre dentro de las 24 h desde el último mensaje que le escribiste al número del bot. Mandale "hola" una vez por día desde tu personal.

**Costos:** YCloud plan Free + mensajes de servicio gratis de Meta; IA unos centavos por conversación; Railway unos USD 5 por mes.

## Desarrollo
- Tests: `node --test bot/test/*.test.js` (simulan conversaciones sin gastar API).
- Archivos: `server.js` (webhook), `agent.js` (IA), `tools.js` (cotizar, buscar posición, registrar lead, derivar), `store.js` (datos), `prompt.md` (personalidad y reglas).
