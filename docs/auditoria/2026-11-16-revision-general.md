# Revisión general del sistema — 16/11/2026

Pedido de Gustavo (14:25): "una revisión general de todo el sistema, bien profunda, bien concienzuda, a ver cómo vamos, qué errores encontramos".

Se revisó: motor de precios (`src/flete_directo.js`, `data/precios_venta.json`), base única (`src/negocio.js`, `data/negocio.json`, `data/faq.json`), herramientas del bot (`bot/tools.js`), prompt (`bot/prompt.md`), agente (`bot/agent.js`), store, clasificador, servidor (rutas y accesos), recordatorios, difusión, revisión nocturna, dólar, arancel, web pública renderizada, simulador y prueba completa, y la publicidad que corre en Meta (texto y lo que dice el video).

## Cómo vamos
- Tests: 192 → 203, todos en verde.
- Publicidad (Meta, 14 al 16/11): el reel de WhatsApp directo, el único prendido, lleva ARS 5.483 y 10 conversaciones (ARS 548 cada una). La imagen pausada había hecho 4 conversaciones a ARS 916. El texto del anuncio ya dice "desde 40 kg".
- Revisión nocturna: el 15/11 llegó como informe de error (ya arreglado). La primera revisión real es la de esta noche.

## Errores encontrados y arreglados (con prueba fija en `bot/test/revision-16-11.test.js`)
1. **Presupuesto sin unidades.** La regla de Gustavo ("todos los parámetros", 15/11 17:59) incluye las unidades, pero `cotizar` no las pedía y el prompt decía en otro lado "si no sabe cuántas son, cotizá igual como envío comercial". Sin unidades no se sabe el régimen ni el costo por unidad. Ahora la herramienta se niega. El cotizador a mano de Gustavo sigue sin exigirlas.
2. **/charlas perdía mensajes.** El store guardaba solo los últimos 30 mensajes por chat y borraba la charla entera si el cliente volvía después de 48 h. /charlas es la única forma de ver las charlas, así que en las charlas largas (bombachas) Gustavo perdía el principio. Ahora se guarda todo (hasta 400 mensajes) y el recorte se hace solo para la IA.
3. **Clasificador caído = 20% "a ojo" y sin aviso.** Si fallaba la clasificación, el bot cotizaba con un 20% inventado y Gustavo no se enteraba. Ahora busca en el arancel, marca "(a confirmar)" y a Gustavo le llega "confirmá la posición".
4. **Prompt con datos viejos:**
   - "Hoy es USD 19 el kilo con todo desde 20 kg": desde el 16/11 es desde 40 kg.
   - Ejemplos con "USD 18,87 el kilo con 23 kg": hoy 23 kg dan unos USD 19,74. Ahora los ejemplos no llevan números de precio.
   - "Con CUIT de PuertoBox la gestión es USD 50 en vez de 20": en envíos de más de 5 kg es en vez de 40.
   - "¿Aceptan batería de litio?" → "lo tengo que confirmar". Gustavo confirmó hoy que el courier las acepta.
5. **Duda común contradictoria:** a "¿Puedo vender por mayor?" le contestaba que para pedidos grandes se arma "contenedor o carga marítima". Desde el 14/11 se trabaja solo courier y los pedidos grandes se dividen en envíos de hasta USD 3.000. Corregido en el bot y en la web.
6. **Web:** la foto decía "Puerto Shanghai" y el depósito es en Shenzhen. "¿Necesito tener empresa?" decía "para uso propio / para revender": ahora se explica por unidades, que es la regla.
7. **Medición del anuncio:** solo se marcaban como "del anuncio" los chats que empezaban con el precargado viejo ("quiero cotizar un envío desde China") o que traían los datos del anuncio. Los anuncios usan desde el 15/11 "Hola, quiero traer de China:". Si WhatsApp no mandaba esos datos, el chat no se contaba y tampoco se le respetaba el precio del anuncio. Ahora se reconocen los dos textos.
8. **Lead con precio incompleto:** `precio_usd` era flete + gestión base, sin recargos de cajas o litio, sin la gestión de USD 50 con CUIT de PuertoBox y sin la del anuncio. Ahora guarda el total que se le cobra.
9. **Repo público:** la revisión nocturna podía subir el nombre del cliente cuando el bot lo saludaba ("Hola Agustín") y no estaba guardado en el lead. Ahora se saca. También manda solo la charla actual.
10. **Pruebas viejas:** el simulador esperaba presupuestos sin unidades ni medidas, que se derive un contenedor y el formato "Presupuesto PuertoBox". La prueba completa esperaba el resumen aparte que se sacó el 16/11. Las dos daban fallas falsas. Actualizadas.
11. **Piezas de publicidad:** `precio_render.py` escribía "desde 20 kg" (el inicio del tramo) en vez de "desde 40 kg" (desde donde vale USD 19 con gestión).
12. Detalles: el mensaje de respaldo decía "a la brevedad", que es una frase prohibida. Y el último mensaje de espera no quedaba guardado en /charlas.

## Lo que queda (no se arregla desde el código)
- **⚠️ El video del reel que corre dice "USD 19/KG FLETE + GESTIÓN desde 20 kg"** (leído con Lena). El texto ya está bien. El bot respeta ese precio a los del anuncio hasta el 23/11. Antes de esa fecha hay dos opciones: video nuevo con "desde 40 kg" o extender la fecha en `negocio.json → anuncio_anterior.hasta`.
- Railway: pasar a Hobby antes del ~13/12, porque si no se apagan el bot y la web.
- YCloud: tildar el evento `whatsapp.message.updated` en el webhook. Sin eso no avisa cuando una foto no se entrega.
- Litio: el courier lo acepta; falta que Howard confirme el recargo (está en 30%).
- Ventas: todavía no se mide quién pagó (falta el botón "Pagó"). Sin eso no hay costo por venta del anuncio.
- Limpieza: `web/landing/`, `web/cotizador.html`, `web/presupuestador.html`, `web/ncm.html`, `web/sitio/index_original.html` y `ycloud-agent/` (salvo el automático del 698) no los sirve nadie. `web/landing` tiene la tabla vieja con medios kilos.
- Menor: el webhook lee el cuerpo entero antes de verificar la firma (sin tope de tamaño). Riesgo bajo.
- El simulador con los escenarios nuevos no se corrió desde acá porque falta la clave. Se puede correr con `/pruebas`, que gasta centavos (no es la prueba completa).
