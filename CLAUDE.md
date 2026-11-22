# Instrucciones para Claude en este repo

Antes de hacer cualquier cosa, leé en este orden:
1. `ESTADO.md` (corto): qué está andando y qué falta.
2. `docs/APRENDIZAJES.md`: leé entera solo la sección "Cómo trabajar con Gustavo" y las últimas 15 líneas; para el resto, buscá con `grep` el tema de la tarea (decisiones de Gustavo y errores a no repetir). Es larga: leerla entera gasta el saldo de Gustavo (22/11).
3. `docs/curso/README.md`: material del curso de despachante ya revisado y qué se aplicó.
El historial completo está en `docs/historial/`: solo `grep`, nunca entero.

Gasto (22/11, Gustavo: "se me está gastando todo el saldo"): no correr pruebas con la IA real (prueba completa, simulador, autopruebas) sin avisarle antes cuánto cuestan. ESTADO.md tiene que seguir corto: lo resuelto o viejo pasa a `docs/historial/`.

Después de cada cambio o cada cosa nueva que aprendas:
- Actualizá `ESTADO.md` (estado y pendientes), en pocas líneas.
- Anotá en `docs/APRENDIZAJES.md` toda decisión o corrección de Gustavo, con fecha.
- Si leíste material del curso, agregá o completá su resumen en `docs/curso/` y marcalo en el índice.
- Corré los tests: `npm test`.

Publicidad: usá las skills de `.claude/skills` (de coreyhaines31/marketingskills, MIT), con el contexto de `.claude/product-marketing.md`: `ad-creative` para proponer, evaluar o apagar anuncios; `competitor-profiling` para estudiar a la competencia; `offers` para armar la oferta; `ads` para decidir si un anuncio sigue, se apaga o se le sube plata; `sms` para mensajes y plantillas de WhatsApp (difusión, empujón, reactivar); `social` para guiones de reels de TikTok/Instagram; `customer-research` para leer las charlas y sacar dudas y objeciones; `referrals` para recomendaciones y postventa; `conversion-tracking` para medir ventas y mandarle a Meta qué charla terminó en venta; `ab-testing` para armar pruebas con hipótesis y regla de corte; `video` para guiones y edición de reels. Gustavo aprobó las 8 primeras (15/11/2026) y autorizó sumar las que falten (16/11/2026: conversion-tracking, ab-testing, video); no sumar otras sin preguntarle. Para Meta, seguir `docs/marketing/meta-plan-2026-11-16.md`.

Reglas fijas:
- Gustavo habla en castellano rioplatense informal. Un paso por vez, simple y directo.
- Nunca subas claves ni datos de clientes al repo.
- Los cambios se suben como PR y **el merge lo hace Claude** (decisión de Gustavo, 14/11/2026): no pedirle que apriete Merge. Antes de mergear: tests en verde y todos los commits subidos. Railway despliega solo.
