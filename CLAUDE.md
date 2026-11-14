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

Reglas fijas:
- Gustavo habla en castellano rioplatense informal. Un paso por vez, simple y directo.
- Nunca subas claves ni datos de clientes al repo.
- Los cambios se suben como PR y **el merge lo hace Claude** (decisión de Gustavo, 14/11/2026): no pedirle que apriete Merge. Antes de mergear: tests en verde y todos los commits subidos. Railway despliega solo.
