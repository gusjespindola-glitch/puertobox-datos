# PuertoBox — estado al 13/11/2026

Leer también `docs/APRENDIZAJES.md` (decisiones) y `docs/curso/README.md` (material del curso).


## Para el próximo chat (13/11/2026 23:15)
- **Forma de trabajo:** juntar los cambios en **un solo PR por tanda** y pasarle a Gustavo un único link (no puedo hacer merge: lo bloquea el sistema de seguridad). Gustavo usa la app de GitHub.
- **Hecho hoy:** web limpia y servida por Railway (puertobox.com.ar), base única de datos (`data/`), buscador NCM público + páginas para Google, Search Console, ntfy, clave rotada, caché de prompts, aviso de saldo, dudas comunes (`data/faq.json`), auditoría (`docs/auditoria/2026-11-13-oferta.md`), SIDIP verificado (solo celulares).
- **Pendiente de Gustavo:** texto para que la proforma diga "pequeños envíos"; qué responde el bot sobre usar el CUIT de otro/de Gustavo; preguntas a Howard (gasto administrativo, foto de balanza, recargo de zona, tránsito, caja máx.).
- **Próximo:** Meta Ads (ver `docs/marketing/meta-ads.md`; falta verificar que el número del bot esté vinculado a la página en business.facebook.com). Instagram frenado en la verificación de Meta. Railway Hobby antes del ~13/12.

## Bot de WhatsApp (andando)
- Línea del bot: **+54 9 221 682-6773**. WhatsApp Business de siempre: 221 698-2199 (aparte, es el número de Gustavo para avisos).
- Código: `bot/` (prompt en `bot/prompt.md`, herramientas en `bot/tools.js`, precios en `src/flete_directo.js` + `data/precios_venta.json → flete_directo`).
- Corre en **Railway**: proyecto "sublime-amazement", servicio `puertobox-datos`, dominio `puertobox-datos-production.up.railway.app`, volumen en `/data`. Despliega solo cada vez que se aprueba un PR en `main`.
- Variables en Railway: ANTHROPIC_API_KEY, YCLOUD_API_KEY, BUSINESS_NUMBER, OWNER_NUMBER (5492216982199), ADMIN_KEY, DATA_FILE (/data/data.json). Opcional: NTFY_TOPIC.
- IA: Anthropic, Claude Haiku 5.5, USD 5 cargados, **recarga automática apagada**, clave "bot-puertobox" sin vencimiento.
- YCloud: plan Free, webhook activo a `/webhook` (evento whatsapp.inbound_message.received). El AI Agent de YCloud quedó sin crédito.
- Leads: `https://puertobox-datos-production.up.railway.app/leads?key=ADMIN_KEY`.


## Base única (desde 13/11/2026)
Cambiás un dato en un solo lugar y cambia en el bot, la web, el buscador y las páginas:
- **Precios** (tramos del flete, gestión): `data/precios_venta.json` → `flete_directo`.
- **Dudas comunes** (CUIT, monotributo, Responsable Inscripto, envíos por año…): `data/faq.json`. Las responde el bot y aparecen en la web.
- **Contacto y reglas** (WhatsApp, Instagram, mail, horario, precio cerrado %, franquicia, caja máx.): `data/negocio.json`.
- El resto (envío mínimo, USD/kg desde 20 kg, tabla de la web) se calcula solo (`src/negocio.js`).
- Plantillas con `{{dato}}`: `bot/prompt.md`, `web/sitio/index.html`. Un test falla si alguien escribe un precio o el teléfono a mano.

Páginas públicas que sirve el servidor de Railway (`src/paginas.js`): `/` (web), `/buscador`, `/ncm/XXXX.XX.XX` (10.504 posiciones), `/importar/<producto>`, `/sitemap.xml`, `/robots.txt`.
✅ 13/11 20:50: puertobox.com.ar apunta a Railway (Cloudflare DNS conectado desde Railway, dominio sacado del Worker). **La web se actualiza sola con cada merge**: ya no se sube nada a mano. El Worker `royal-mode-b440` quedó sin dominio (se puede borrar). www redirige a puertobox.com.ar (regla de Cloudflare). Google Search Console verificado (13/11) y sitemap enviado: https://puertobox.com.ar/sitemap.xml. ⚠️ El dominio vive en Railway: pasar a Hobby antes de que termine el trial (~13/12).

## Nomenclador PuertoBox (tipo Tarifar)
- **Acceso principal (celular y PC):** `https://puertobox-datos-production.up.railway.app/nomenclador/?key=ADMIN_KEY` (la primera vez con la clave; después queda en una cookie por un año). Lo sirve el mismo servidor del bot, así que se actualiza con cada merge.
- Copia en claude.ai: https://claude.ai/artifact/AG4uktPhuZmr7FVxfzLnoo (hay que republicarla a mano, puede quedar vieja). Código en `web/nomenclador/`.
- Buscador por producto o posición; ficha con DIE, DII, TE, IVA, internos, DE, reintegros, DIE mínimo específico, unidad, sufijos de valor, notas de sección y capítulo, intervenciones orientativas; liquidación régimen general / courier / pequeños envíos.
- Motor compartido `src/nomenclador.js`: lo usa la página y el bot (`buscar_posicion`). Intervenciones curadas en `ncm/intervenciones.json` (Gustavo valida).
- Actualizar con archivos nuevos de ARCA: ponerlos en `ncm/fuentes_arca/`, `bash ncm/actualizar.sh`, `python3 ncm/build_nomenclador.py` y republicar la página.

## Actualizaciones normativas
- Tarea programada **"Novedades aduaneras PuertoBox"**: todos los lunes a las 6:59 (hora argentina). Revisa Boletín Oficial, ARCA y organismos; guarda `docs/novedades/AAAA-MM-DD.md`, abre un PR si hay que cambiar algo y avisa a Gustavo al celular. Aprobación automática de acciones; los PR los mergea Gustavo.
- Los archivos del Arancel Integrado de ARCA no se pueden bajar desde acá: si hay nuevos, Gustavo los sube y se corre `ncm/build_nomenclador.py`.

## Precios y pruebas
- `npm run precios` → `docs/precios/AAAA-MM-DD.md` (ganancia por envío y comparación con la competencia). Hallazgos en `docs/precios/README.md`.
- Simulador de clientes: `bot/simulador.js` (13 escenarios con revisión automática). Se corre con `ANTHROPIC_API_KEY=... npm run simular` o abriendo `https://puertobox-datos-production.up.railway.app/pruebas?key=ADMIN_KEY` (usa la clave del servidor, gasta centavos). Informes en `docs/pruebas/`.

## Web
- Archivo vigente: `web/sitio/index.html`. Hosting: Cloudflare Worker `royal-mode-b440` (cuenta gusjespindola@gmail.com).
- Dominio en NIC a nombre de Gustavo, vence 08/04/2027, delegado a Cloudflare el 13/11 (propagando: el 13/11 todavía mostraba el sitio viejo).

## Pendientes (en orden)
0. ✅ Clave de Anthropic rotada el 13/11 (bot-puertobox-2, sin vencimiento).
1. **Apagar el AI Agent de YCloud** (Inbox > Assignment): si se renueva el crédito, contestarían los dos bots.
2. ✅ Avisos por ntfy andando (13/11).
3. **Web**: servida por Railway desde el repo (se actualiza sola). www redirigido, Search Console y sitemap listos (13/11). Sin Perfil de Google (Gustavo no tiene local). Próximo: bot en Instagram (frenado en verificación de Meta).
4. **Railway**: la prueba vence alrededor del 13/12/2026. Pasar al plan Hobby (USD 5/mes) antes o el bot se apaga.
5. Seguir revisando el material del curso (ver `docs/curso/README.md`) y aplicarlo.
6. ✅ Delegación a Cloudflare activa (13/11). Falta revisar que el mail info@ funcione (registros MX en Cloudflare).
7. Cargar el mensaje de bienvenida o ausencia en el 698 (`ycloud-agent/whatsapp_698_bienvenida.txt`) y el link del bot en las bios.
8. Preguntar a Howard: gasto administrativo de DHL, recargo por zona alejada, días de tránsito, si sigue FedEx a 11 USD/kg desde 20 kg.
9. Limpieza del repo: `ycloud-agent/` y el README viejo (modelo consolidado / modelo fijo) ya no se usan; archivos web viejos; `ncm/fuentes_arca/nom.txt` duplicado.

## Instagram (en curso, 13/11/2026)
- Código listo: `/instagram` (webhook de Meta), responde con el mismo bot, chats `ig:<id>`. Si Gustavo responde desde Instagram, el bot se pausa en ese chat; `#bot` en ese chat lo reactiva. Avisos de derivación igual que WhatsApp.
- Token: variable `IG_TOKEN` en Railway (se renueva solo cada día y se guarda en /data/ig_token.json). Opcionales: `IG_VERIFY_TOKEN`, `IG_APP_SECRET` (verifica la firma de Meta).
- Página de privacidad para Meta: https://puertobox.com.ar/privacidad
- 13/11 21:45: frenado en el registro de Meta for Developers (no llega el SMS al 2216826773; Meta puede mandarlo por WhatsApp y ese número es del bot). Para retomar: usar otro celular con chip o verificar con tarjeta.
- Falta del lado de Meta: cuenta @puertobox.ok profesional, app en developers.facebook.com (Instagram API con inicio de sesión de Instagram), token, webhook https://puertobox.com.ar/instagram suscripto a `messages`, app en modo Live.

## Avisos y saldo (13/11/2026)
- ✅ ntfy andando: tema `puertobox-8b275069` (app ntfy en el celular de Gustavo + NTFY_TOPIC en Railway). Probado: el aviso de derivación llega.
- Saldo Anthropic: USD 4,42 al 13/11 22:36. Un día entero de pruebas (~70 conversaciones simuladas) gastó ~USD 0,60 → menos de 1 centavo por conversación. No hace falta cargar más por ahora (decisión de Gustavo).
- Si se queda sin saldo o la clave falla: el cliente recibe mensaje de espera y Gustavo un aviso por ntfy (máx. 1 cada 3 h).

- ✅ 13/11 22:49: clave de Anthropic rotada (nueva `bot-puertobox-2`, sin vencimiento; la vieja …wgAA eliminada). Pendiente 0 resuelto.
