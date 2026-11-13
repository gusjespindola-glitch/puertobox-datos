# Base de posiciones SIM (Argentina)

Fuente oficial y gratuita: **ARCA — Arancel Integrado y Sufijos de Valor**
(https://www.afip.gob.ar/aduana/arancelIntegrado/). Es la misma base que consume VUCE.

Versión cargada: ver `sim_meta.json` (fecha de los archivos y cantidad de posiciones).

| Archivo | Qué es |
|---|---|
| `fuentes_arca/` | Los 3 archivos originales de ARCA (capítulos, nomenclador, sufijos) |
| `sim.csv` | Todas las posiciones SIM (11 dígitos + control) con DIE, DII, DE, reintegros, unidad, impuestos internos y descripción con jerarquía. Se abre en Excel. |
| `sim_compacto.json` | Base compacta para el buscador y la calculadora |
| `sufijos.json` | Sufijos de valor por capítulo / partida / subpartida / SIM |
| `modificaciones.json` | Lo que ARCA no trae en estos archivos: **impuestos internos** (Dec. 333/2025) |
| `sinonimos.json` | Palabras comunes → términos del arancel. **Sumá las tuyas.** |
| `buscar.js` | `node ncm/buscar.js "auriculares"` o `node ncm/buscar.js 8518.30` |
| `../web/ncm.html` | Buscador para el celular (datos embebidos) |

## Actualizar
1. Bajá los 3 archivos nuevos de ARCA y ponelos en `ncm/fuentes_arca/` (reemplazando los viejos).
2. `bash ncm/actualizar.sh`
3. Commit.

## Límites
- Intervenciones, licencias y requisitos de terceros organismos no vienen en estos archivos: se consultan en VUCE por posición.
- La clasificación final es responsabilidad del despachante.
