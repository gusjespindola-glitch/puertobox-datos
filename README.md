# PuertoBox — Base de datos de tarifas y reglas de courier

Fuente única de verdad para la calculadora de puertobox.com.ar: regímenes aduaneros, alícuotas por rubro, costos del consolidador, recargos y precios de venta. Más un motor de cálculo (`src/calc.js`) que los usa.

**Actualizado:** 12/11/2026

## Estructura

| Archivo | Qué tiene | Quién lo cambia |
|---|---|---|
| `data/regimenes.json` | Pequeños envíos y courier comercial: franquicia USD 400, 5 envíos/año, tope USD 3.000, 50 kg/bulto, 3 unidades de la misma especie, tasa estadística, IVA, percepciones | Cuando cambie la norma |
| `data/categorias.json` | Derechos, impuestos internos e intervenciones por rubro (celulares, ropa, notebooks, etc.) | Cuando cambie un arancel |
| `data/forwarder.json` | **Tus costos**: tramos por kilo del consolidador, recargo por sobrepeso de bulto, gastos admin por tramo de CIF, pasarela, tipo de cambio RMB | Cuando el proveedor cambie precios |
| `data/precios_venta.json` | **Tu lista de precios** al cliente | Vos |
| `data/referencias_mercado.json` | Tarifas de la competencia y recargos express de referencia (DHL) | Cada tanto |
| `src/calc.js` | Motor de cotización | — |
| `test/calc.test.js` | Casos de prueba | — |

## Cómo se calcula

1. **Peso facturable** = suma por bulto del mayor entre real y volumétrico (L×A×H ÷ 5000), redondeado hacia arriba. Mínimo 1 kg.
2. **Costo de flete** = kg × tarifa del proveedor según el tramo de la **salida consolidada** (11 USD/kg desde 20 kg; 13 USD/kg de 10 a 20 kg; menos de 10 kg se consulta). Litio: ×1,30.
3. **Sobrepeso de bulto** (aerolínea): cada bulto de más de 23 kg suma 250 RMB × 1,3 × tipo de cambio (~USD 44,85).
4. **CIF** = FOB + flete **real** + seguro 1%. No existe opción para declarar un flete menor.
5. **Gastos admin del proveedor** = CIF × 20% (CIF < USD 500) o 9,5% (CIF ≥ 500), más IVA 21%. Pasarela 3%.
6. **Tributos**:
   - Pequeños envíos con cupo: si FOB ≤ 400, sin derechos ni tasa. Si FOB > 400, derechos y tasa 3% solo sobre la fracción excedente. IVA siempre sobre el total.
   - Cupo de 5 envíos agotado o courier comercial: derechos y tasa sobre todo el CIF.
   - IVA = (CIF + derechos + tasa) × 21%. Impuestos internos según rubro (ej. celulares 9,5%).
7. **Precio al cliente** = flete (25 USD/kg) + sobrepeso + gestión (fee 10 USD + admin trasladado) + tributos.
8. **Ganancia** = lo que cobrás por flete y gestión − costo de flete, admin y pasarela. Los tributos se cobran y se pagan igual: no son ganancia.

## Uso

```js
const { cotizar } = require('./src/calc');
const c = cotizar({
  regimen: 'pequenos_envios',      // o 'courier_comercial'
  categoria: 'ropa',               // id de data/categorias.json
  fob: 80,
  bultos: [{ kg: 2, largo: 30, ancho: 20, alto: 10 }],
  litio: false,
  enviosUsadosAnio: 0,
  kgSalidaConsolidada: 50          // kilos totales de la salida semanal
});
console.log(c.cliente.total, c.ganancia);
```

Tests: `node --test test/calc.test.js`

## Pendiente de confirmar con el proveedor

- [x] Los 11 USD/kg son **solo flete** (sin despacho ni impuestos).
- [x] Guía individual a nombre de quien se indique.
- [x] Sobrepeso: por **caja** de más de 23 kg.
- [x] Volumétrico: mayor entre real y volumétrico, divisor 5000.
- [ ] Gastos admin: los calcula la **línea courier**. Falta el umbral exacto de valor y los porcentajes reales.
- [ ] Tarifa para 13 a 20 kg y para menos de 10 kg.
- [ ] Recargo por batería de litio (hoy +30%).
- [ ] Plazo depósito China → entrega.
- [ ] Percepciones en courier comercial: las fuentes no coinciden (por defecto están desactivadas en `regimenes.json`).

## Avisos

- Las alícuotas por rubro son **orientativas**. El derecho real depende del NCM exacto: verificalo antes de confirmar una operación. Ropa y calzado: fuentes recientes indican 20% (Dec. 236/2025), otras siguen citando 35%.
- Con gastos admin del 20% sobre CIF chico, la "gestión" pesa mucho en mercadería de valor (ej. celular de USD 300: ~USD 86 de gestión). Revisalo con el proveedor.

## Fuentes principales

- ARCA, Régimen de Courier: https://servicioscf.afip.gob.ar/publico/sitio/contenido/novedad/ver.aspx?id=5939
- Decreto 604/2026: https://www.midireccioneuropea.com/decreto-604-2026-argentina-franquicia-400-dolares-correo-y-courier/
- Courier comercial: https://comercioyjusticia.info/factor/postal-courier-y-exporta-simple-el-nuevo-ecosistema-argentino-de-comercio-exterior-de-baja-escala/
- Celulares, Dec. 333/2025: https://chequeado.com/el-explicador/eliminacion-de-aranceles-a-la-importacion-de-celulares-como-impacta-la-medida-y-cual-es-el-peso-de-los-impuestos-sobre-el-precio-final/
- Aranceles por rubro 2026: https://servidos.ar/calculadora-importacion
- Percepciones: https://www.shippar.net/cotizador-importacion · https://www.despachantesargentinos.com/detalle_noticia.php?id=43868
- Recargos DHL Argentina: https://mydhl.express.dhl/ar/es/ship/surcharges.html
