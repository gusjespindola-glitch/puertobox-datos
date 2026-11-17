**Reglas obligatorias: `REGLAS.md`.**

# Contenido orgánico (TikTok @gusespindola.despachante, 4.539 seguidores, 43 videos)

- **Publicación: Metricool** (marca 8113674, TikTok @gusespindola.despachante conectado 14/11). Claude arma el video, lo sube a `web/media/` (se sirve en https://puertobox.com.ar/media/...) y lo programa en Metricool; Gustavo no toca nada. Mejores horarios según Metricool: lunes 10 y 18 h, domingo 10 h. TikTok no deja agregar música automática a videos por API: los videos van con su propio sonido.
- Windsor.ai (prueba): solo lee estadísticas de TikTok, no publica.
- Bio actual: "Cotizador automático y Casas plegables" → hay que cambiarla: el cotizador web se sacó (cotiza el bot) y las casas no van por courier.
- Formato que se repite (posicionamiento "costo por unidad puesta en tu casa"): pregunta gancho → el pedido → la cuenta real → costo por unidad → llamado a WhatsApp. Vertical 1080×1920, 20–25 s, texto grande, sin cara. Números siempre del motor del bot (`cotizar` con unidades) y con aviso "impuestos estimados".

## Videos
1. `reel01` — 100 remeras, USD 300, 5 kg → USD 7,38 por unidad (14/11/2026). Script: `reel01_dibujar.py`. **Programado en TikTok: domingo 15/11 10:00.**
2. `reel02` — kit de 3 bandas elásticas, escenas animadas + subtítulos + música propia (`musica.py`, sintetizada, sin derechos de terceros). El audio con la voz de Gustavo se perdió (quedó en otra sesión), por eso sale sin voz. Precios controlados por Claude 16/11/2026 (Gustavo: "controlalo, si está bien publicá"): ML "Kit 3 bandas elásticas dominadas" mediana $25.260 (mejorescompras.com.ar); China: bandas de dominadas USD 0,29–2,77 por unidad y muestras de set a USD 2,50 en Alibaba → USD 2 por kit es razonable al por mayor. Motor del bot 16/11 (gestión nueva USD 40 por ser más de 5 kg): 100 kits, USD 200, 25 kg en 2 cajas 40×30×30, DIE 35% → USD 9,36 por kit (≈ $14.700 con dólar $1.570), diferencia $10.300 contra $25.000. Archivo: `web/media/reel02-bandas.mp4`. **Programado en TikTok: miércoles 18/11 18:00.**

3. `reel03` — "La caja grande te cobra aire": texto en pantalla + música propia (sin voz). Motor del bot 17/11/2026: 40 pares, USD 800, 18 kg en 2 cajas, DIE 35%; 60×40×40 → 39 kg, flete USD 702; 50×40×40 → 32 kg, USD 576 (diferencia USD 126). Script `reel03_04.py reel03`. Archivo `web/media/reel03-caja-grande.mp4`. **Programado viernes 20/11 18:00 (TikTok + Instagram).**
4. `reel04` — "Qué pedirle al proveedor" (precio, peso, medidas). Script `reel03_04.py reel04`. Archivo `web/media/reel04-que-pedir.mp4`. **Programado domingo 22/11 18:00 (TikTok + Instagram).**

**Regla nueva (Gustavo, 17/11/2026): 3 videos por semana SIEMPRE. Si manda la voz, se usa; si no, se publica igual con texto en pantalla + música propia. No esperar su confirmación ni su audio para publicar.**

## Guiones para que Gustavo grabe con su voz (16/11/2026, pendiente que mande los audios)
1. **Bandas (reemplaza la música del reel02, sale miércoles 18/11 18 h):** "Este producto sale 2 dólares en China. En Mercado Libre se vende a 25.000 pesos, más o menos. Te muestro cuánto te queda puesto en tu casa, con impuestos y todo. Antes de comprar, escribime y te lo calculo."
2. **La caja grande te cobra aire (viernes 20/11 18 h):** "Mismo pedido, mismos 18 kilos. Pero si viene en cajas grandes, el envío te sale 126 dólares más caro. Porque el avión cobra por el espacio que ocupa la caja, no solo por lo que pesa. Antes de comprar, pedile al proveedor las medidas de la caja y mandámelas." Motor 16/11: 40 pares, USD 800, 18 kg en 2 cajas; 60×40×40 → 39 kg cobrables, flete USD 702; 50×40×40 → 32 kg, USD 576 (+ gestión USD 40 en ambos).
3. **Qué pedirle al proveedor (domingo 22/11 18 h):** "Antes de pagarle al proveedor chino, pedile tres cosas: el precio, el peso y las medidas de la caja. Con eso te digo cuánto te sale todo puesto en tu casa, antes de comprar. Escribime y te lo calculo."
Cuando lleguen los audios: armar los videos (estilo reel02 + subtítulos), mostrárselos 24 h antes y programar en Metricool (marca 8113674). Si al reel02 le llega la voz antes del miércoles, reemplazar el post programado (id 430384216).

