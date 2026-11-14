# Plan de anuncios en Meta (Facebook e Instagram) — 13/11/2026

## Decisión recomendada
Anuncios **Clic a WhatsApp** que abren el chat del bot (+54 9 221 682-6773), con el objetivo "Mensajes".

Por qué:
- El cliente cae directo en el bot, que lo guía y cotiza (no hay formulario ni web en el medio).
- Las conversaciones que empiezan desde un anuncio Clic a WhatsApp tienen una ventana gratis de mensajes de WhatsApp (desde el 28/09/2026 puede durar hasta 7 días), si el bot responde dentro de las 24 h. El bot responde en segundos.
- Los chats que llegan desde wa.me, la web o un QR no tienen esa ventana gratis: se pagan normal pasados los 1.000 mensajes de servicio gratis por mes.

## Antes de prender los anuncios (en orden) — estado al 13/11/2026 22:30
1. ✅ Pruebas del bot (corrida 3: 23 casos, 2 avisos ya corregidos).
2. **Avisos de clientes listos para cerrar**: instalar ntfy y cargar NTFY_TOPIC en Railway. Sin esto, si el 698 no le escribió al bot en las últimas 24 h, el aviso no llega y se pierde la venta.
3. Página de Facebook + Instagram @puertobox.ok en un Business Manager, con el número del bot vinculado a la página.
4. ✅ Web nueva publicada (puertobox.com.ar) + buscador + Search Console.
5. Railway en plan Hobby y **crédito de Anthropic con margen** (hoy USD 5 sin recarga automática: con anuncios se puede agotar y el bot deja de responder).

## Prueba inicial
- 7 días, presupuesto chico diario que Gustavo define. Medir: costo por conversación, % que llega a presupuesto, % que deriva "listo para cerrar".
- Público: Argentina, 25–50 años, intereses en importación, Alibaba, AliExpress, emprendimientos, tienda online, mayoristas, Tiendanube/Mercado Libre.
- 2 o 3 anuncios distintos; a los 3–4 días se apaga el peor.

## Ideas de anuncio (tono profesional)
1. **Precio cerrado:** "Importá desde China con precio de flete cerrado. Antes de comprar te decimos cuánto vas a pagar de impuestos. Despachante de aduana matriculado. Cotizá por WhatsApp."
2. **Caso real:** video o imagen con un ejemplo: "Remeras para tu emprendimiento: 5 kg, USD 300 al proveedor → flete USD 125 + gestión USD 20, impuestos estimados USD 320. Sin sorpresas." (números del bot, corrida del 14/11/2026; si cambian los precios, recalcular con /pruebas).
3. **Confianza:** "¿Primera vez que importás? Te guiamos paso a paso: qué podés traer, cuánto pesa, cuánto pagás. Un despachante de aduana revisa cada operación."

## Métricas a guardar
Cada semana, en `docs/marketing/AAAA-MM-DD.md`: gasto, conversaciones, presupuestos, ventas cerradas, costo por venta. La tarea de los lunes puede analizarlo si Gustavo pasa los números.
