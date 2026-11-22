# PuertoBox — estado al 22/11/2026

Versión corta, con lo vigente. Lo anterior completo (13/11 al 17/11, con el detalle de cada arreglo) está en `docs/historial/ESTADO-hasta-2026-11-17.md`. **No leerlo entero:** buscar ahí con `grep` solo el tema que haga falta.

## Gasto (22/11, Gustavo: "se me está gastando todo el saldo y no me gusta")
- **Saldo de Anthropic del bot:** se gastó en unos 2 días. Causas encontradas: (1) el clasificador de posiciones usa Sonnet y desde el 17/11 da hasta 14 vueltas (bibliografía + notas de capítulo obligatorias) reenviando todo sin caché: unos USD 0,30-0,50 por producto, no 0,05; (2) las pruebas del 15 al 17/11 (prueba completa, 10 autopruebas de links, intervenciones v1-v3, simulador) corrieron con la misma plata.
- **Arreglo (PR del 22/11):** `bot/gasto.js` mide lo que gasta cada llamada (tokens reales que devuelve la API, precios de la doc oficial) por día y por parte. Se ve al pie de **/pendientes** y en el resumen de las 9 ("Gasto de IA ayer"). **Tope diario** `GASTO_IA_TOPE_DIA` (USD 0,40 por defecto, se cambia en Railway): pasado el tope, las charlas siguen igual y lo demás (clasificador, archivos, links, revisiones) pasa a Haiku sin búsqueda web; llega un aviso por ntfy. El clasificador ahora marca caché en cada vuelta (lo reenviado se cobra al 5%).
- **Saldo de este chat (Claude):** la tarea "Reunión diaria del equipo" seguía prendida aunque Gustavo la descartó el 16/11 (todos los días, Opus, 8 agentes a la vez). **Pausada el 22/11.** El 22/11 las 3 tareas diarias fallaron por tope de uso. ESTADO.md pasó de 70 KB a esta versión corta para que cada sesión gaste menos al leerlo.
- **Regla:** no correr pruebas con la IA real (prueba completa, simulador, autopruebas, subir `VERSION` de intervenciones o `VERSION_PRUEBA` de links) sin avisarle a Gustavo cuánto cuesta.

## Tareas programadas (consumen el saldo del chat de Claude)
- Activas: **Mejora diaria del bot** (8:47), **Criterios de clasificación ARCA** (3:17), **Novedades y precios** (lunes 6:59). Todas con Opus.
- Pausada: **Reunión diaria del equipo** (22/11). Diseño en `docs/equipo/README.md`.

## Bot de WhatsApp (andando)
- Línea del bot **+54 9 221 682-6773**; Gustavo (avisos y WhatsApp Business) 221 698-2199.
- Código `bot/` (prompt `bot/prompt.md`, herramientas `bot/tools.js`). Precios en `data/precios_venta.json → flete_directo`, reglas en `data/negocio.json`, dudas en `data/faq.json` (base única: cambiás ahí y cambia bot, web y páginas).
- Railway: proyecto "sublime-amazement", servicio `puertobox-datos`, volumen `/data`, despliega solo con cada merge a `main`. **El trial vence ~13/12: pasar a Hobby (USD 5/mes) antes o se apaga el bot y la web.**
- Variables: ANTHROPIC_API_KEY, YCLOUD_API_KEY, BUSINESS_NUMBER, OWNER_NUMBER, ADMIN_KEY, DATA_FILE, YCLOUD_WEBHOOK_SECRET, NTFY_TOPIC, GROQ_API_KEY; opcionales PAUSA_HORAS, CLASIFICADOR_MODEL, CLASIFICACIONES_WEB_DIA (15), GASTO_IA_TOPE_DIA (0,40).
- IA: charlas con Haiku 5.5; clasificador, archivos y revisión nocturna con Sonnet 5.5 (pasan a Haiku si se pasa el tope). Anthropic **sin recarga automática**.
- Paneles (abren con cookie después de entrar una vez): puertobox.com.ar/charlas, /pendientes, nomenclador `/nomenclador/` (buscador, buscador con IA, cotizador a mano). Avisos por ntfy (el nombre del tema nunca va al repo).
- Hace: pide los datos juntos (valor, peso, medidas y cajas, unidades) o proforma; lee fotos, PDF, Excel, audios y links de Alibaba (alibaba.fr/.co.uk); clasifica con `clasificar_producto` (web + notas + bibliografía; derecho siempre de ARCA); cotiza con `cotizar` (presupuesto armado por el programa, peso volumétrico explicado); deriva casos difíciles, marcas para reventa, ENACOM, pedidos de más de USD 3.000; empujón único entre 4 y 22 h; presupuesto formal PDF; difusión con plantilla; revisión nocturna 23 h (rama `aprendizaje-bot`) y correcciones desde /charlas.
- Decisiones de precio vigentes: flete por kilo cobrable entero, gestión USD 20 (hasta 5 kg) / USD 40 (más de 5 kg), USD 50 con CUIT de PuertoBox, recargo USD 45 por caja de más de 23 kg (máx. 50 kg), litio +30% del flete (a confirmar con Howard). Costo real: el más barato de UPS/FedEx (UPS hasta 9 kg, FedEx desde 10 kg).

## Publicidad
- Meta (Lena, cuenta act_857973830564446; nunca Cotidiano ni Trevan): corre el reel de WhatsApp directo. Plan: `docs/marketing/meta-plan-2026-11-16.md`. Conjunto "Pruebas" creado y pausado.
- ⚠️ **El reel tiene en la imagen "USD 19/kg desde 20 kg"**; el bot lo respeta a los del anuncio hasta el **23/11** (`negocio.json → anuncio_anterior`). Reemplazar el video o extender la fecha.
- TikTok/Instagram: guiones en `docs/marketing/contenido/`; Gustavo graba la voz, Claude arma los videos.
- Estudios EE.UU. (Miami) del 16-17/11: links en el historial. Falta el costo por kilo desde Miami.

## A validar por Gustavo
- Recargo por batería de litio (número exacto de Howard). Mensaje armado: `docs/howard/consultas-2026-11-15.md`.
- Factura B por el 100% y cargadores de 220 V; scrubs (textiles: ¿derivar?); casco de marca 1 unidad; calzado (cap. 64) con etiquetado en courier.
- Buscador con IA: confirmar en Railway que cita 📖 Vademécum o Manual.
- Antidumping de anteojos de sol (Res. 588/2012) y las 3 propuestas de precio de `docs/precios/2026-11-16.md`.
- Archivar posteos viejos con precios anteriores (Facebook/Instagram).

## Pendientes
1. Railway a Hobby antes del 13/12.
2. Reel con precio viejo antes del 23/11.
3. Mirar en /pendientes el gasto real de IA de los próximos días y ajustar el tope si hace falta.
4. Apagar el AI Agent de YCloud (Inbox > Assignment) si se renueva su crédito.
5. Instagram del bot: frenado en la verificación de Meta (detalle en el historial).
6. Curso: seguir con `docs/curso/README.md` (prioridad: clasificación, Manual 2.ª parte).
7. Limpieza: `ycloud-agent/`, README viejo, `ncm/fuentes_arca/nom.txt` duplicado.
