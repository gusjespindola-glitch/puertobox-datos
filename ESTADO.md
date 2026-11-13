# PuertoBox — estado al 13/11/2026

Leer también `docs/APRENDIZAJES.md` (decisiones) y `docs/curso/README.md` (material del curso).

## Bot de WhatsApp (andando)
- Línea del bot: **+54 9 221 682-6773**. WhatsApp Business de siempre: 221 698-2199 (aparte, es el número de Gustavo para avisos).
- Código: `bot/` (prompt en `bot/prompt.md`, herramientas en `bot/tools.js`, precios en `src/flete_directo.js` + `data/precios_venta.json → flete_directo`).
- Corre en **Railway**: proyecto "sublime-amazement", servicio `puertobox-datos`, dominio `puertobox-datos-production.up.railway.app`, volumen en `/data`. Despliega solo cada vez que se aprueba un PR en `main`.
- Variables en Railway: ANTHROPIC_API_KEY, YCLOUD_API_KEY, BUSINESS_NUMBER, OWNER_NUMBER (5492216982199), ADMIN_KEY, DATA_FILE (/data/data.json). Opcional: NTFY_TOPIC.
- IA: Anthropic, Claude Haiku 5.5, USD 5 cargados, **recarga automática apagada**, clave "bot-puertobox" sin vencimiento.
- YCloud: plan Free, webhook activo a `/webhook` (evento whatsapp.inbound_message.received). El AI Agent de YCloud quedó sin crédito.
- Leads: `https://puertobox-datos-production.up.railway.app/leads?key=ADMIN_KEY`.

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
0. **Cambiar la clave de Anthropic** (quedó pegada en el chat el 13/11): crear una nueva en platform.claude.com → Claves, pegarla en Railway (ANTHROPIC_API_KEY) y borrar la vieja.
0b. **Decidir cómo mostrar la tarifa por kilo** (web y bot): hoy el flete se cotiza con +15% sobre el peso, así que la tabla por kilo no cierra con el presupuesto. Opción: publicar la tabla con el 15% ya incluido. Lo decide Gustavo.
1. **Apagar el AI Agent de YCloud** (Inbox > Assignment): si se renueva el crédito, contestarían los dos bots.
2. **Avisos al 698**: WhatsApp solo los entrega si el 698 le escribió al bot en las últimas 24 h. Instalar la app ntfy y cargar NTFY_TOPIC en Railway.
3. **Web**: cotizador y FAQ siguen con la tolerancia del 15% "gratis" y sin handling. Alinear con el bot (15% incluido + USD 10).
4. **Railway**: la prueba vence alrededor del 13/12/2026. Pasar al plan Hobby (USD 5/mes) antes o el bot se apaga.
5. Seguir revisando el material del curso (ver `docs/curso/README.md`) y aplicarlo.
6. Confirmar que puertobox.com.ar muestre el sitio nuevo cuando Cloudflare quede activo. Revisar el mail info@ (registros MX en Cloudflare).
7. Cargar el mensaje de bienvenida o ausencia en el 698 (`ycloud-agent/whatsapp_698_bienvenida.txt`) y el link del bot en las bios.
8. Preguntar a Howard: gasto administrativo de DHL, recargo por zona alejada, días de tránsito, si sigue FedEx a 11 USD/kg desde 20 kg.
9. Limpieza del repo: `ycloud-agent/` y el README viejo (modelo consolidado / modelo fijo) ya no se usan; archivos web viejos; `ncm/fuentes_arca/nom.txt` duplicado.
