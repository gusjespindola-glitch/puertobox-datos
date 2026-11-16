# Equipo de control de PuertoBox (pedido de Gustavo, 16/11/2026)

> "Quiero que seas el jefe de un ejército de bots controladores: web, Insta, TikTok, Meta, publicidades, competencia, precios, regulaciones y mi cotizador. Cada bot se encarga de una, y en reunión de trabajo el jefe actúa en consecuencia para mejorar y optimizar."

**Reunión diaria a las 5:37** (hora argentina), para que el resumen esté listo cuando Gustavo se levanta (6:30). Es una sola tarea programada, "Reunión diaria del equipo PuertoBox".

1. El **jefe** (Claude) manda 8 controladores en paralelo. Cada uno solo mira e informa (25 líneas como máximo, con semáforo 🟢🟡🔴):
   - **Web:** puertobox.com.ar, precios y textos contra la base, links.
   - **Instagram:** Windsor; posteos con precios viejos, bio.
   - **TikTok:** Windsor y Metricool; plan de 3 videos por semana.
   - **Meta / publicidad:** Lena (solo act_857973830564446); gasto, costo por conversación, texto y video de cada anuncio contra `anuncio_vigente`.
   - **Competencia:** precios y anuncios de los competidores (a fondo los lunes).
   - **Precios:** `npm run precios`; márgenes con UPS/FedEx y alertas.
   - **Regulaciones:** Boletín Oficial del día hábil anterior.
   - **Cotizador y bot:** tests, 6 casos de `cotizar`, informe nocturno, prueba de links.
2. **Reunión:** el jefe arma el acta (semáforo, qué cambió desde ayer, seguimiento de las acciones de ayer, decisiones de hoy).
3. **Actuar:** el jefe arregla solo lo que puede (textos y errores de la web y del bot, tests, datos no comerciales) con PR y merge. No toca precios, reglas comerciales, gasto en publicidad, publicaciones ni normas dudosas: eso va a "Para vos" (3 cosas como máximo, con un paso concreto cada una).
4. **Acta** en la rama `equipo` (`docs/equipo/AAAA-MM-DD.md`, no se mergea a main ni dispara deploy).
5. **Mensaje a Gustavo**, 8 líneas como máximo: semáforo, "Hice:" y "Para vos:".

Tareas que siguen aparte (el equipo lee lo que dejan): Mejora diaria del bot (8:47), Criterios ARCA (3:17), Novedades y precios (lunes 6:59), Revisión de publicidad (martes 12:23).
