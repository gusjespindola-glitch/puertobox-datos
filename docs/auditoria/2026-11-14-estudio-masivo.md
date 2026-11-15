# Estudio completo de PuertoBox — 14/11/2026 (noche)

Qué se miró: código y tests, bot (prompt, dudas comunes, precios), datos de la base única, anuncios de Meta en vivo (Lena), legislación vigente (ARCA, decretos, Código Aduanero, Monotributo), costos de WhatsApp, mercado courier (INDEC) y competencia.
Ya estaba auditado (no se repite): `2026-11-14-completa.md`, `2026-11-14-revision-2.md`, `docs/marketing/estrategia-2026-11-14.md`.

---

## 🔴 Lo urgente (puede costar plata o clientes)

### 1. Monotributistas que importan para vender: la respuesta del bot choca con la ley
El bot y la web dicen: "¿Un monotributista puede importar para vender? Sí, tranquilamente."
La Ley de Monotributo (Ley 24.977, Anexo, art. 2 inc. d, texto vigente según Ley 27.743) pide como requisito para ser monotributista **no haber hecho importaciones de cosas muebles para su comercialización posterior** en los últimos 12 meses. Fuente: biblioteca de ARCA.
Ejemplo: Laura, monotributista, trae 100 remeras para vender. El paquete llega bien, pero ARCA cruza su CUIT (desde julio de 2026 valida los CUIT de cada envío courier) y la puede excluir del Monotributo, y si la excluyen no puede volver por 3 años. Ella va a decir "PuertoBox me dijo que se podía".
**Qué hacer:** Gustavo lo confirma con un contador. Mientras tanto, conviene cambiar la respuesta por algo neutro, por ejemplo: "Por courier podés importar con tu CUIT. Si sos monotributista, consultá con tu contador cómo te afecta en tu categoría." Es un cambio en `data/faq.json` y cambia en el bot y en la web.

### 2. WhatsApp ya cobra las respuestas del bot
Desde el 1/10/2026 Meta cobra cada respuesta del bot (mensaje de servicio). Cada número tiene **1.000 respuestas gratis por mes** y después se paga cada una a la tarifa de utilidad de Argentina. Si la cuenta no tiene medio de pago o saldo, **los mensajes dejan de entregarse**.
Ejemplo: una charla de cotización tiene unas 8 respuestas del bot, así que 1.000 respuestas alcanzan para unas 125 charlas por mes. Con dos campañas prendidas, se puede pasar del tope antes de fin de mes y ahí el bot deja de contestar sin avisar.
**Qué hacer:** en YCloud › Billing ver el saldo y si hay medio de pago cargado. Es el punto 1 de la revisión 2, que sigue pendiente, y ahora está confirmado.

### 3. Se está gastando el doble de lo que decidiste en publicidad
Decidiste ARS 4.000 por día. Hoy hay **dos campañas prendidas, de ARS 4.000 cada una**: ARS 8.000 por día, unos ARS 240.000 por mes. Hoy, 14/11 hasta las 22:26, se gastaron ARS 2.389.
Además, `ESTADO.md` decía que la de "link al bot" estaba apagada, pero Lena muestra que hoy gastó ARS 1.593.
**Qué hacer:** si está bien gastar el doble hasta el martes (para comparar), dejarlo así. Si no, bajar cada conjunto a ARS 2.000. El martes 17/11 se apaga la perdedora y vuelve a ARS 4.000.

### 4. El cambio del 698 no está publicado
PR #92 (automático del 698 con link al bot y medición "Del 698"): tests en verde, pero el merge quedó bloqueado desde acá. Hasta que se mergee, el bot no marca a los que llegan desde el 698.

---

## 🟡 Errores menores encontrados

- **Informe de precios con texto viejo:** `npm run precios` decía "peso + 15% + handling USD 10" (el modelo anterior). Los números ya eran los nuevos, solo estaba mal el texto. 🔧 Corregido en este PR.
- **Datos viejos que confunden:** `data/precios_venta.json` todavía tiene los modelos anteriores (aéreo USD 25/kg con fee 15, "emprendedor" USD 22/20, "todo incluido", modelo fijo USD 28/kg, "retiro gratis", "salida semanal mínimo 20 kg"). El bot no los usa, pero sí `src/calc.js` y `src/precio_fijo.js`, que solo siguen vivos por los tests. Es el pendiente 9 (limpieza): se borran juntos en otro PR.
- **Promesa exagerada:** la duda "¿Tengo que hacer algún trámite en ARCA?" responde que "ARCA no te va a contactar para cobrarte nada aparte". ARCA puede fiscalizar igual. Mejor: "No hace falta ningún trámite: los impuestos se pagan a la empresa de transporte al recibir el paquete."
- **Foto de la balanza:** la web promete "te mandamos foto de la balanza". Sigue sin confirmar con Howard que el depósito la mande siempre.

---

## 🟢 Lo que está bien (virtudes)

- **Base única:** un precio o un dato cambia en un lugar y cambia en el bot, la web y las páginas. Con 104 tests (106 con el PR del 698), un test falla si alguien escribe un precio a mano.
- **Nunca se pierde plata:** ni en el peor caso (caja 15% más pesada), en ningún peso. La ganancia va de USD 26 (1 kg) a USD 225 (50 kg), con márgenes de 24% a 40%.
- **Impuestos estimados con datos reales:** calibrados con facturas reales de UPS y FedEx (diferencia de +2,6%).
- **El bot no deja a nadie en visto:** reintentos, aviso de espera, empujón dentro de las 24 h, audios a texto gratis, tope contra abuso y firma del webhook.
- **Diferencial real:** sos despachante matriculado y das la posición y los impuestos antes de que el cliente compre. Nadie más da "costo por unidad puesta en tu casa".
- **Medición:** cada chat queda marcado según de dónde vino (anuncio, web y, con el PR #92, el 698). El resumen de las 9 muestra el embudo.
- **Matrícula:** el Código Aduanero (art. 41, texto del DNU 70/2023) no pone a los empleados públicos entre los impedimentos para ser despachante; solo a los exonerados. Revisá igual las reglas de tu fuerza sobre actividades privadas.

---

## ⚖️ Legislación vigente (cambios de 2026)

| Norma | Qué cambió | ¿Afecta a PuertoBox? |
|---|---|---|
| Decreto 604/2026 (BO 17/07) | El correo (puerta a puerta) queda igual que el courier: franquicia de USD 400 por envío, 5 por año, y se va el arancel plano del 50%. | **Sí, en envíos chicos de uso propio:** el Correo Argentino ahora compite con las mismas reglas. Refuerza el foco en el que revende. |
| RG 5883/2026 (vigente 30/07) | Exportación por courier sin tope. Importación: sigue en USD 3.000 FOB por envío y 50 kg por bulto. Pequeños envíos: 3 unidades iguales y 5 por año. | No cambia nada de lo que dice el bot. ✅ |
| Controles nuevos de ARCA (julio 2026) | Valida cada CUIT (menores, fallecidos, CUIT con restricciones para importar) y pide un código de rubro por producto. | Más control: hace todavía más importante el punto urgente 1. |
| Anunciado, no oficial | Eliminar la franquicia de 5 compras de USD 400. | Vigilar: lo revisa la tarea de los lunes. |

---

## 📈 Mercado

- Importaciones por courier: **USD 960 millones entre enero y septiembre de 2026, 59,5% más que en 2025** (INDEC). Récord en junio (USD 125 millones). En agosto bajaron un poco (USD 104 millones contra 108 en julio): sigue creciendo, pero más lento.
- El peso promedio del paquete subió a ~1 kg (Shein/Temu). Tu cliente es otro: el que revende y trae 5 a 50 kg.
- Una referencia publicada (Chilat, agosto 2026) pone el courier China–Argentina en ~USD 19/kg solo de flete. Vos cobrás USD 19/kg desde 20 kg **con la gestión incluida**.
- Viene la Terminal Única de Courier en Ezeiza: entregas más rápidas para todos.

## 💲 Precios contra la competencia

| Envío | Cobrás | USD/kg | Ganás | Mercado (mediana) |
|---|---|---|---|---|
| 1 kg | USD 65 | 65 | USD 26 | ~30/kg |
| 5 kg | USD 145 | 29 | USD 42 | ~30/kg |
| 10 kg | USD 220 | 22 | USD 66 | ~30/kg |
| 20 kg | USD 380 | 19 | USD 102 | ~28/kg |
| 50 kg | USD 920 | 18,4 | USD 225 | ~28/kg |

- Menos de 2 kg: caro (el doble del mercado por kilo). Está bien: ese no es tu cliente.
- Desde 10 kg: barato contra la mediana, en la línea de ImportBox (USD 19) y por encima de IEY (USD 16,5).
- **Recomendación: no tocar precios ahora.** Primero que entren las primeras ventas del anuncio. Si en 2 semanas hay ventas de 20 kg o más y nadie se queja del precio, subir el tramo de más de 20 kg de USD 18 a 19 (+USD 20 por cada 20 kg).

---

## 🚀 Mejoras, en orden (lo que más vende primero)

1. **Arreglar la respuesta de monotributo** (punto urgente 1). Protege al cliente y tu matrícula.
2. **Medio de pago en YCloud** (punto urgente 2). Sin eso, el bot se puede quedar mudo justo cuando más consultas entran.
3. **El martes 17/11, apagar la campaña perdedora** por costo por charla con presupuesto (ya agendado).
4. **Contestar en el día a los derivados grandes** (como Nusse, 298 kg): es la venta más cara de perder.
5. **Prueba social:** a cada cliente que recibe, pedirle foto del paquete y permiso para publicarla. Hoy no hay ninguna y es lo que más falta contra la competencia.
6. **Plantilla de seguimiento** para el que recibió presupuesto y no contestó en 24 h (unos USD 0,03 por mensaje).
7. **Limpieza del repo:** sacar `calc.js`, `precio_fijo.js` y los modelos viejos de `precios_venta.json`.
8. **Railway a Hobby antes del 13/12** (USD 5 por mes), o se apagan el bot y la web.

---

Fuentes: biblioteca ARCA (Ley 24.977 texto vigente); Decreto 604/2026 (iProfesional, Consejo Salta); RG 5883/2026 (Tributum, Cronista); controles courier (iProfesional 21/7/2026); WhatsApp (soporte de Wati, eesel, Cliengo); INDEC/Analytica (El Economista, Bloomberg Línea, iProfesional); Chilat (agosto 2026); Aduana News (art. 41 CA, DNU 70/2023); Lena (Meta Ads en vivo, 14/11 22:26).
