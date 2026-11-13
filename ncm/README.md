# Base NCM propia

Fuente: **Anexo I del Decreto 557/2023** (NCM 2022 + Arancel Externo Común + reintegro), 10.392 posiciones a 8 dígitos.

| Archivo | Qué es |
|---|---|
| `ncm_2022_aec.csv` | Tabla completa parseada del PDF oficial (código, descripción, AEC, BK/BIT, RE, descripción con jerarquía) |
| `modificaciones.json` | Ajustes posteriores al decreto (Dec. 236/2025 textiles/calzado, Dec. 333/2025 celulares e internos). **Acá agregás cada cambio nuevo.** |
| `sinonimos.json` | Palabras de uso común → términos del arancel (zapatillas → calzado deporte). **Sumá las tuyas al clasificar.** |
| `ncm.json` | Base final (AEC + ajustes) que usan el buscador y la calculadora |
| `buscar.js` | Buscador por consola: `node ncm/buscar.js "auriculares"` |
| `parse_ncm.py` / `build.py` / `build_web.py` | Regeneran todo desde el PDF |

## Actualizar
1. Sale una norma que cambia derechos → agregala en `modificaciones.json`.
2. `python3 ncm/build.py && python3 ncm/build_web.py`
3. Commit.

Si sale una NCM nueva (enmienda del SA), se baja el anexo nuevo y se corre `parse_ncm.py`.

## Límites
- DIE = AEC + ajustes conocidos. Argentina tiene excepciones nacionales (LNE, BK, BIT) que pueden diferir. Las posiciones SIM a 11 dígitos con sufijos de valor, las intervenciones y licencias se confirman en **VUCE** (Central de Información, gratis).
- 3 posiciones sin AEC parseado (6113.00.00, 8480.30.00, 8708.22.00): completar a mano.
