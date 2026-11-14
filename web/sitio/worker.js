// Worker de Cloudflare (royal-mode-b440) para puertobox.com.ar.
// Sirve web/sitio/index.html directo desde la rama main del repo:
// cada vez que Gustavo aprueba un cambio de la web, se actualiza solo (tarda hasta 5 min).
const URL_WEB = 'https://raw.githubusercontent.com/gusjespindola-glitch/puertobox-datos/main/web/sitio/index.html';

export default {
  async fetch() {
    const r = await fetch(URL_WEB, { cf: { cacheTtl: 300, cacheEverything: true } });
    if (!r.ok) return new Response('PuertoBox: volvé a intentar en un momento.', { status: 503 });
    return new Response(r.body, {
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=300' },
    });
  },
};
