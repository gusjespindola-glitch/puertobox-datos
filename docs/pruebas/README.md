# Pruebas del bot

El simulador tiene 30 escenarios (14/11: licuadoras para vender, auriculares bluetooth para vender, uso propio con más de 3 iguales y presupuesto sin medidas; el 13/11 se sumaron: juguetes y cargadores con certificación, caja de más de 23 kg, uso propio de más de USD 400, valor no creíble, plazo, forma de pago, audio, zona alejada y repuestos).

Se corren con `https://puertobox-datos-production.up.railway.app/pruebas?key=ADMIN_KEY` o `npm run simular`. Lo más nuevo, arriba.

## 13/11/2026 — corrida 2 (1 problema, venía de 14)
- Sin errores técnicos ni vistos. Ubicación, marcas, ENACOM, termos, perfumes, mayorista y "quiero avanzar": bien.
- Uso propio de 2 kg: preguntó cuántas cajas en vez de cotizar → ahora asume 1 caja y cotiza.
- Mensajes que arrancaban en minúscula después de sacar la muletilla ("¿qué tipo…") → corregido.
- Decía "courier comercial" al cliente y un presupuesto salió sin asteriscos → prompt y revisor ajustados.

## 13/11/2026 — corrida 1 (14 problemas)
- **Error grave:** cuando la IA pedía dos herramientas a la vez, el mensaje siguiente quedaba mal armado y la API devolvía error 400 → el cliente quedaba en visto. Corregido: toda herramienta pedida se ejecuta y responde, pase lo que pase con `stop_reason`; `max_tokens` 600 → 1024.
- Muletillas al arrancar ("Perfecto", "¡Buenísimo!", "Joya", "Dale", "Tranqui"): el modelo las pone igual pese al prompt. Corregido: se sacan por código antes de enviar.
- Inventó "Estamos en AMBA" cuando preguntaron dónde están. Corregido en el prompt (no inventar ubicación). Gustavo definió: La Plata, sin local ni retiro, solo envíos (online para bajar costos).
- Marca y celulares para revender: rechazaba pero seguía pidiendo datos para cotizar. Corregido: deriva, ofrece la alternativa sin marca y no pide más datos.
- "Quiero avanzar": cotizaba pero no derivaba. Corregido en el prompt.
- El revisor contaba el "¿cómo va?" del saludo como segunda pregunta: ajustado.

## Corrida 3 — 14/11/2026 (después de la base única)
- 23 escenarios, 2 avisos (los dos en "Termos para revender": nombró ANMAT/INAL y "courier comercial").
- Hallazgo extra (revisión manual): si el cliente no sabe el peso, no le pasó el mensaje en inglés para el proveedor.
- Arreglo: el prompt no nombra organismos al cliente y el mensaje en inglés es obligatorio; el simulador ahora marca ANMAT/INAL/SENASA y exige el mensaje en inglés.
- Precios OK con la base única (flete, volumétrico, gestión USD 20).
