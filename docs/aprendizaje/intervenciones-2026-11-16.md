# ¿Podía el bot? — [número]
Charlas revisadas: 9 · Gustavo escribió en: 6 · El bot podía solo: 1 · Podía con un cambio: 4 · Necesitaban a Gustavo: 4

## Resumen en 3 líneas
- El bot derivó varias charlas por motivos que no requerían a Gustavo (dudas resueltas con reglas que ya tiene, pedidos de datos que sí podía pedir solo) y en otras dio respuestas incorrectas (precios viejos, cotizó sin tener todos los datos, mezcló impuestos con el total).
- Gustavo intervino para validar marcas, decidir excepciones (cajas de madera, pieza de más de 50 kg, división de envíos, fletes con el valor de muestras) y para cerrar con clientes que el bot no logró guiar.
- Los cambios de mayor impacto son: cortar los presupuestos a un solo formato, tomar bien los datos de cajas y pesos, y responder las preguntas de precio por kilo con el número del presupuesto y no con publicaciones viejas.

## Charla por charla

### Charla 1 — Mats, pesas y bolsos (marca propia)
- **Por qué intervino Gustavo:** el bot derivó por motivo "mayorista" y nunca llegó a cerrar el presupuesto; Gustavo no escribió en la charla.
- **Qué hizo Gustavo:** nada; el chat quedó con el bot.
- **¿Podía el bot?:** Sí, con un cambio.
- **Qué le falta al bot:** tomar el peso con claridad (preguntó "298 kh" y luego "¿298 kg o 29,8?" y tomó 298 kg sin revisar que son 15 cajas de un pedido liviano); no mezclar el presupuesto con "Posición a confirmar" repetido; el mensaje en inglés se cortó; no debió asumir que la marca era importable sin el dictamen de Gustavo, por eso sí corresponde derivar la marca; dar respuesta a "¿es aéreo o marítimo?" sin volver a pedir medidas en el mismo mensaje. Además, respondió "No cotizamos carga marítima" y luego derivó con un tono de "para un pedido de este tamaño…", que es una promesa que el bot no puede cumplir.
- **Después de Gustavo:** el bot debió retomar tras la marca, pidiendo solo las medidas de la caja, que faltaban.

### Charla 2 — Ropa de marcas conocidas
- **Por qué intervino Gustavo:** el bot derivó por motivo "duda" al detectar prendas de marcas conocidas; Gustavo no escribió.
- **Qué hizo Gustavo:** nada.
- **¿Podía el bot?:** Sí, con un cambio.
- **Qué le falta al bot:** la regla de marca reconocida sí está; lo que falló fue el manejo del cliente: el bot ya había frenado el pedido y luego le pidió "las prendas sin marca" sin haber confirmado la cantidad. Además, el cierre de seguimiento ("el presupuesto es gratis y sin compromiso") es una frase prohibida por el prompt. La derivación era correcta, pero la respuesta final al cliente debió ser una línea.
- **Después de Gustavo:** el caso quedó rechazado por el cliente; no había nada que retomar.

### Charla 3 — Trípode con Bluetooth para reventa (Zona Norte)
- **Por qué intervino Gustavo:** el bot derivó por motivo "duda" por homologación ENACOM; Gustavo no escribió.
- **Qué hizo Gustavo:** nada.
- **¿Podía el bot?:** Sí, con un cambio.
- **Qué le falta al bot:** la regla es clara (Bluetooth de más de 3 unidades = ENACOM, derivar), así que la derivación fue correcta. Lo que sobra es la respuesta a las preguntas de régimen y de quién figura como importador: el prompt dice que el cliente no figura como importador y que para reventa no hay que decir "a nombre de quien compra, con su CUIT". Eso es un dato incorrecto. Además el bot contestó dos preguntas sobre batería y depósito que no debía prometer.
- **Después de Gustavo:** el bot podía cerrar la charla tras la derivación, sin prometer nada más.

### Charla 4 — Mineras ASIC y silenciadores
- **Por qué intervino Gustavo:** el bot derivó por motivo "duda" (silenciadores y mineras). Gustavo escribió varias veces: pidió reenvío de imágenes, dio el presupuesto de sopladores y pidió la proforma de las mineras.
- **Qué hizo Gustavo:** revisó las proformas, armó el presupuesto de 80 sopladores en 2 envíos y pidió la proforma de las mineras.
- **¿Podía el bot?:** No, necesitaba a Gustavo.
- **Qué le falta al bot:** la herramienta de lectura de imágenes y documentos falló varias veces (los archivos llegaron como "no se pudo leer"); el bot respondió "pasame el precio en texto" sin tener el dato; la división en envíos de más de USD 3.000 debe hacerla el bot cuando tiene todos los datos, pero acá necesitó la revisión de Gustavo porque el caso mezclaba dos productos, un producto de intervención ambigua (silenciadores, sin modelo ni materiales) y datos de peso que salieron de una proforma no legible.
- **Después de Gustavo:** el bot debía quedar como canal de seguimiento pidiendo la proforma de las mineras de 24 kg, no cotizarlas.

### Charla 5 — Máquinas de depilación de más de 50 kg
- **Por qué intervino Gustavo:** el bot rechazó la carga por tamaño (correcto) y Gustavo se metió a pedir medidas y valor FOB; el cliente respondió con audio.
- **Qué hizo Gustavo:** pidió medidas y valor FOB; luego preguntó cuántas máquinas quería traer.
- **¿Podía el bot?:** No, necesitaba a Gustavo.
- **Qué le falta al bot:** la regla dice que las piezas de más de 50 kg no entran por courier y que hay que decirlo sin pedir datos; el cliente insistió con "por metro cúbico" y "por kilo", que es una consulta de carga marítima o de consolidado, y eso el bot no puede manejarlo. Además, la respuesta del bot al cliente en la primera derivación no fue la misma que la regla pide (sugirió otro producto).
- **Después de Gustavo:** Gustavo debía decidir si el cliente tiene algo para courier o no.

### Charla 6 — Ropa interior sintética (360 unidades)
- **Por qué intervino Gustavo:** el bot derivó por "pide_humano" tras que el cliente comparó con su courier; Gustavo escribió al final para ofrecer mejorar el precio.
- **Qué hizo Gustavo:** confirmó que el cliente había visto el presupuesto, le preguntó cuánto cobraba su courier y le avisó que compactar la caja bajaría unos USD 160.
- **¿Podía el bot?:** Sí, con un cambio.
- **Qué le falta al bot:** el bot pidió el peso con una pregunta confusa ("21grs" / "21kgr") y eso generó dos turnos extra; después cotizó sin tener el peso bien confirmado y repitió el presupuesto completo dos veces cuando el cliente solo preguntó por impuestos y por "bombachas". Además, el bot cambió la posición arancelaria de 6108.22 a otra sin validar, y el prompt pide que sea siempre la que devuelve `clasificar_producto`. La comparación con el courier del cliente es una negociación de precio que corresponde a Gustavo.
- **Después de Gustavo:** el bot podía retomar para cerrar el caso, pero la decisión de precio la tomó Gustavo.

### Charla 7 — Cintas y vendas deportivas (54 rollos, 3 proveedores)
- **Por qué intervino Gustavo:** el bot derivó por "pide_humano" con varios archivos sin poder leer; Gustavo escribió para armar el presupuesto consolidado y para validar pesos y medidas.
- **Qué hizo Gustavo:** pidió costo, medidas y peso, revisó los tres packing lists, detectó la diferencia de peso y medidas de DL Medical, pidió el valor de las muestras y armó un presupuesto estimado con flete y gestión.
- **¿Podía el bot?:** No, necesitaba a Gustavo.
- **Qué le falta al bot:** la lectura de archivos falló varias veces; el bot debió pedir los datos por texto y el cliente los mandó en distintos formatos. Además, la regla de "muestras sin valor" y la de inconsistencias entre packing list y pedido son excepciones de criterio que corresponden a Gustavo. El bot sí podía pedir el código postal y mostrar el total con la línea de pago de forma más ordenada.
- **Después de Gustavo:** Gustavo cerró el presupuesto y pasó el nomenclador; el bot debía quedar en espera de la factura de DL Medical con el valor de las muestras.

### Charla 8 — Clamps para moldes (cliente de Florencio Varela)
- **Por qué intervino Gustavo:** el bot le pasó el chat por "pide_humano"; Gustavo escribió al inicio con el saludo y luego reconoció el presupuesto del cliente.
- **Qué hizo Gustavo:** pidió la proforma, mencionó que había que ver si traía cajas de madera (sube el peso), explicó los dos pagos, y cerró con un aproximado de impuestos.
- **¿Podía el bot?:** Sí, con un cambio.
- **Qué le falta al bot:** el bot debía cotizar con los datos de la proforma (30 unidades, 3 largos, peso y medidas de caja) sin esperar a Gustavo; faltó el peso del embalaje con madera, que es un dato que pregunta el prompt. La explicación de los dos momentos de pago y del impuesto aproximado debió salir del bot, con la cifra de `cotizar`. La parte de "el proveedor no tiene validado el HS" y la aclaración de la marca "Yushine" sí corresponden a Gustavo.
- **Después de Gustavo:** el bot podía haber retomado con el presupuesto y el pedido de peso con la caja de madera.

### Charla 9 — Producto con batería, precio por kilo y publicidad vieja
- **Por qué intervino Gustavo:** el cliente vio un precio de la publicidad vieja (18 USD el kilo) y el bot derivó por "pide_humano" tras el reclamo; Gustavo escribió mucho.
- **Qué hizo Gustavo:** pidió el link, pidió medidas y peso al proveedor, mandó dos presupuestos, explicó el peso volumétrico y la batería (30%), y hasta mandó cálculos en PDF.
- **¿Podía el bot?:** No, necesitaba a Gustavo.
- **Qué le falta al bot:** el bot mandó un presupuesto con datos que no estaban confirmados; se le pidió al proveedor las medidas del producto suelto y no las de la caja (regla que el bot tiene). El cliente pedía explicar por qué el precio publicado no coincidía con el presupuesto, y el prompt sí tiene la respuesta (publicidad anterior y kilo con gestión), pero el bot no la usó. Las explicaciones de peso volumétrico, batería y recargo son decisiones de Gustavo sobre el caso concreto. Además, el bot cotizó con medidas del producto suelto en lugar de caja, lo que la regla prohíbe.
- **Después de Gustavo:** el caso quedó derivado con Gustavo, que sigue reclasificando al llegar a su almacén. El bot no debía cotizar sin medidas de caja.

## Cambios para que el bot lleve más charlas
1. **Cortar los presupuestos a un solo formato y no repetirlos** (charlas 1, 6, 9): reforzar en el prompt que el presupuesto completo se manda una vez y que las preguntas posteriores se responden con una línea. Lleva a 3 charlas.
2. **Pedir los datos juntos y confirmar cada número sin ambigüedad** (charlas 1, 6, 7): regla explícita para preguntas de peso ("¿298 kg o 29,8?" está bien; "21grs" no) y para no cotizar con datos sin confirmar. Lleva a 3 charlas.
3. **Usar el precio por kilo del presupuesto y no las publicaciones viejas** (charla 9, y la confusión de la charla 6): reforzar la regla que ya existe y agregar una frase lista para responder cuando el cliente cita un precio viejo. Lleva a 2 charlas.
4. **Revisar la lectura de imágenes y documentos** (charlas 4, 7, 8): la herramienta falló en varios archivos y el bot pidió reenvíos. Revisar el proceso de lectura para que los PDF y XLSX se lean, y tener un fallback que pida los datos por texto sin decir que no se abre. Lleva a 3 charlas.
5. **Corregir el dato de marca y de importador para reventa** (charla 3): quitar la frase "a nombre de quien compra, con su CUIT" del prompt para este caso. Es una corrección de contenido, no de herramienta.
6. **Usar `cotizar` con las medidas de la caja y nunca con las del producto suelto** (charla 9): reforzar la regla que ya existe. Afecta 1 charla.

## Lo que sí tiene que seguir siendo de Gustavo
- Validar marcas que no conoce o que tienen marca reconocida y más de 3 unidades.
- Decidir excepciones de precio, de flete o de peso (cajas de madera, compactado de cajas, comparación con el courier del cliente).
- Reclasificar cuando el peso o las medidas del proveedor no coinciden con lo que llega al almacén.
- Resolver pedidos con valor de muestras, facturas incompletas o inconsistencias entre documentos.
- Decidir sobre productos con intervención (ENACOM, ANMAT) y sobre cargas que no entran por courier o que hay que dividir de manera especial.
- Cerrar con clientes que piden negociar o que tienen reclamos sobre precios publicados.

---
Generado por el servidor del bot (bot/intervenciones.js) con claude-haiku-5-5. 9 charlas de los últimos 7 días (6 con mensajes de Gustavo). Sin datos personales.
