# Precios y competencia

- `npm run precios` genera un informe con la ganancia por envío (normal y peor caso) y la comparación con la competencia. Correlo cada vez que cambies un precio en `data/precios_venta.json` o un costo de Howard.
- La competencia se carga en `data/referencias_mercado.json` (la tarea de los lunes la revisa y actualiza).
- Informes por fecha en esta carpeta. Lo más nuevo, arriba.

## Decisión del 13/11/2026 (noche): opción C
Sin el 15% sobre el peso y gestión de USD 20. Comparación de opciones (cobrás / ganás): 1 kg 65/26 · 2 kg 84/30 · 5 kg 145/42 · 10 kg 220/66 · 20 kg 380/102 · 30 kg 560/143. Peor caso (caja 15% más pesada) siempre positivo, mínimo USD 17.

## Hallazgos del 13/11/2026 (con la opción anterior: +15% y USD 10)
- **Envíos de menos de 2 kg: caros vs el mercado.** 1 kg se cotiza como 1,5 kg (por el 15% y el redondeo) y sale USD 58 con handling, contra unos USD 30 por kilo de la competencia (que suele cobrar mínimos y domicilio aparte).
- **Salto de tramo:** 8 kg (USD 247,50) sale más caro que 10 kg (USD 240). Pasa igual en 14,5 y 19,5 kg.
- **Desde 20 kg hay margen para subir:** cobrás unos USD 21/kg y la mediana publicada ronda los USD 28/kg.
- **Nunca se pierde plata** con los costos actuales, ni en el peor caso (caja 15% más pesada). La ganancia anda entre 32% y 40%.
- Ojo: faltan costos de DHL que no tenemos (gasto administrativo, zona alejada). Preguntar a Howard.
