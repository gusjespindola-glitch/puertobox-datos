# Courier 2025 – Importación II (Lic. Pamela Padilla)

Fuente: Drive del curso, `Módulo II/COURIER 2025 - IMPO II.pdf` (13 diapositivas). Leído el 13/11/2026.
Ojo: es anterior al **Decreto 604/2026** (franquicia USD 400 unificada correo/courier). Verificar vigencia de cada punto.

## Modalidades

| | Courier general | Pequeños envíos | Muestras |
|---|---|---|---|
| Valor límite | USD 3.000 FOB por envío | USD 3.000 FOB por envío | USD 3.000 FOB por envío |
| Peso | 50 kg por bulto, total sin límite | ídem | ídem |
| Volumen | sin límite en el régimen (ver prestador) | ídem | ídem |
| Envíos por año | sin límite | **5 por año por sujeto** | sin límite |
| Cantidades | sin límite | **3 unidades de la misma especie** | cantidad usual para ese fin |
| Prohibiciones | aplican todas | solo las no económicas | solo las no económicas |
| Destinatarios | personas humanas y jurídicas | personas humanas y jurídicas | personas humanas y jurídicas |
| Mercadería | con o sin fin comercial | **sin fin comercial** | concepto art. 560 C.A. |
| Tributos | según NCM: DI, TE, IVA 21%, internos, antidumping | según NCM, **franquicia USD 400** (paga IVA 21%) | según NCM: DI, TE, IVA, internos |
| Observaciones | **No ingresan** mercaderías alcanzadas por **SIDIP**, **intervenciones de terceros organismos** ni regímenes tributarios especiales. Los **reglamentos técnicos ingresan** pero se controlan en plaza. | **Exceptuadas** de Lealtad Comercial, SIDIP, ANMAT e INAL. **No exceptuadas**: SEDRONAR y ANMAC. | El prestador declara la ventaja INUMUE. Exceptuadas SIDIP y terceros organismos cuando se indica. |

También: muestras para ensayo de laboratorio (USD 3.000, USD 10.000 para certificaciones), envíos para investigación científica (Ley 25.613, certificado ROECYT).

## Cálculo (ejemplo del curso)
FOB 1.168,75 · flete 46,46 (el de la factura o un % del consolidado) · seguro 1% sobre FOB + flete = 12,15.

- **Pequeños envíos:** base de DI y TE = (FOB − 400) + flete + seguro = 827,36 → DI 2% 16,55 · TE 3% 24,82. IVA 21% sobre CIF + DI + TE = 266,43. Tributos 307,80. Hasta USD 400 FOB: **solo IVA**.
- **Courier general:** base = CIF completo 1.227,36 → DI 24,55 · TE 36,82 · IVA 270,63. Tributos 332,00.
- Cada prestador cobra aparte sus servicios de desaduanaje (gasto documental).

## Mercadería retenida
Siempre **requiere despachante**. Persona humana sin fin comercial → Res. 3172/2011. El resto (comercial o persona jurídica) → régimen general.

## Consideraciones de la docente
- Inversión inicial para aprovechar el régimen: unos USD 5.000. El marítimo conviene desde unos USD 8.000.
- **Evitar marcas registradas (fraude marcario).**
- Depósitos en USA/China para reembalar, etiquetar o **sacar cargadores**.
- Productos típicos: smartwatches, procesadores, repuestos de máquinas, pequeñas máquinas, impresoras.

## Qué se aplicó en PuertoBox
- `src/flete_directo.js`: pequeños envíos ahora calcula derechos sobre (FOB − 400) + flete + seguro, como el curso. Antes prorrateaba y daba de menos. Test con el ejemplo exacto en `test/flete_directo.test.js`.
- `bot/prompt.md`: reventa con intervención de terceros organismos (ANMAT, INAL, envases para alimentos, SENASA) → no cotiza y deriva. Reglamentos técnicos (eléctricos, juguetes) → cotiza y avisa de la certificación. Marcas registradas para reventa → deriva. Uso propio exento de ANMAT/INAL/Lealtad, nunca ANMAC/SEDRONAR.
