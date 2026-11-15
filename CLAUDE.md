# Instrucciones para Claude en este repo

Antes de hacer cualquier cosa, leé en este orden:
1. `ESTADO.md`: qué está andando y qué falta.
2. `docs/APRENDIZAJES.md`: decisiones de Gustavo, cómo trabajar con él y errores a no repetir.
3. `docs/curso/README.md`: material del curso de despachante ya revisado y qué se aplicó.

Después de cada cambio o cada cosa nueva que aprendas:
- Actualizá `ESTADO.md` (estado y pendientes).
- Anotá en `docs/APRENDIZAJES.md` toda decisión o corrección de Gustavo, con fecha.
- Si leíste material del curso, agregá o completá su resumen en `docs/curso/` y marcalo en el índice.
- Corré los tests: `npm test`.

Publicidad: usá las skills de `.claude/skills` (de coreyhaines31/marketingskills, MIT), con el contexto de `.claude/product-marketing.md`: `ad-creative` para proponer, evaluar o apagar anuncios; `competitor-profiling` para estudiar a la competencia; `offers` para armar la oferta; `ads` para decidir si un anuncio sigue, se apaga o se le sube plata; `sms` para mensajes y plantillas de WhatsApp (difusión, empujón, reactivar); `social` para guiones de reels de TikTok/Instagram; `customer-research` para leer las charlas y sacar dudas y objeciones; `referrals` para recomendaciones y postventa. Gustavo aprobó esas 8 (15/11/2026); no sumar otras sin preguntarle.

Reglas fijas:
- Gustavo habla en castellano rioplatense informal. Un paso por vez, simple y directo.
- Nunca subas claves ni datos de clientes al repo.
- Los cambios se suben como PR y **el merge lo hace Claude** (decisión de Gustavo, 14/11/2026): no pedirle que apriete Merge. Antes de mergear: tests en verde y todos los commits subidos. Railway despliega solo.
