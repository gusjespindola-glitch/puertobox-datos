# Auditoría de lo que pidió Gustavo — 15/11/2026

Pedido: "Hacer una auditoría completa de lo que yo te pido y que siempre se cargue bien. No puedo estar controlando todo yo. Vos tenés que controlar que esté bien."

Cada fila dice qué pidió, cómo quedó y **qué lo controla solo** (sin que Gustavo tenga que revisar).

| # | Pedido | Estado | Control automático |
|---|---|---|---|
| 1 | Que el bot hable humano, como un asesor argentino, sin "Entendido/Comprendido/Dale" | Hecho (prompt + filtro de muletillas) | Tests del filtro; la prueba completa marca frases de plantilla y mensajes cortados |
| 2 | Que nunca erre la posición arancelaria (buscar el producto completo) | Hecho: clasificador con web + ARCA; DIE siempre de ARCA; posición fija por charla | Prueba completa: 17 productos con su posición correcta (15/11: 16/16) |
| 3 | Una sola base de precios; el bot sabe lo que se promociona | Hecho (negocio.json) | Tests de precios; la prueba completa revisa que no discuta la publicidad |
| 4 | Kilos enteros, nunca medios kilos | Hecho | Tests de kilo cobrable |
| 5 | Importa la empresa de transporte; CUIT de PuertoBox con USD 50 de gestión | Hecho | Tests de `cotizar` con CUIT de PuertoBox |
| 6 | Recargos: litio (30%) y cajas de más de 23 kg; máximo 50 kg por bulto | Hecho | Tests de recargos |
| 7 | Avisos al celu que lleguen, cortos (quién / quiere / vos) | Hecho (ntfy por JSON con reintento) | Tests de avisos; el aviso ahora dice si al presupuesto le falta algo |
| 8 | Contestar sin tener el chip | Hecho (/charlas, "Enviar desde el 6773") | Tests de /responder |
| 9 | Cotizador a mano en el nomenclador (peso real, volumétrico, medidas) | Hecho | Test del cotizador a mano |
| 10 | Presupuesto PDF tipo comprobante argentino | Hecho | Test del PDF (una hoja, número correlativo) |
| 11 | Los presupuestos los manda y autoriza solo Gustavo | Hecho: el bot nunca lo envía ni lo promete | El envío solo existe detrás del botón firmado (dos toques) |
| 12 | Presupuesto armado solo para cada cliente, listo para mandar con un botón | Hecho | Tests del flujo completo (cotiza → deriva → PDF → enviar) |
| 13 | **Que el presupuestador se abra siempre bien cargado** | **Rehecho el 15/11 a la tarde** (ver abajo) | Ver abajo |

## 13. Presupuestador siempre bien cargado

Qué falló hoy (charla del arrancador): primero abría en blanco (la charla era anterior al cambio); después la IA no sacó los datos; después mostraba un texto interno del bot ("Faltan el peso o el valor… no cotices") aunque el peso estaba, y no decía qué posición había elegido.

Cómo queda:

1. **El bot anota mientras charla** (`anotar_pedido`): cada vez que el cliente da o corrige un dato (producto, unidades, peso, valor, cajas, medidas, litio, link, nombre) queda guardado en ese momento. Peso por unidad × unidades = peso total, solo.
2. **El cotizador junta campo por campo**: lo que anotó o cotizó el bot (lo más nuevo primero) → la IA leyendo la charla (solo si falta algo) → un respaldo por texto (unidades, peso con caja, litio).
3. **Control cruzado** (pedido de Gustavo: "que revise el chat y se fije"): cada vez que se abre, la charla se relee entera (sin gastar de nuevo si no cambió) y se compara dato por dato con lo que anotó el bot; si no coincide, 🚩 con los dos números. Además se controla solo contra la charla: si las unidades no coinciden con lo último que dijo el cliente, si el peso no cierra con unidades × peso por unidad o si se habla de litio y no está tildado, aparece una 🚩 en rojo.
4. **Pantalla clara**: dice exactamente qué falta y marca el campo en rojo; el botón de enviar queda bloqueado ("Falta el valor…") hasta completarlo; muestra la posición con su DIE y el link del producto.
5. **El aviso al celu** ya dice "📄 Para el presupuesto falta: valor" o "datos completos, solo revisar y mandar".
6. **La prueba completa** (botón en /pendientes, ~USD 2-3) ahora también abre el presupuestador de cada charla de prueba y controla que cargue los números correctos (unidades, valor, peso, cajas, medidas, litio).

## Lo que sigue dependiendo de Gustavo

- Datos que el cliente nunca dio (por ejemplo, el valor en la charla del arrancador): se marcan en rojo, no se inventan.
- Posiciones dudosas (batería vs. compresor en el arrancador): se marcan "a confirmar".
- Confirmar con Howard el porcentaje del recargo de litio.
