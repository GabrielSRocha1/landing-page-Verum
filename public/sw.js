/* Verum Crypto — Service Worker
 * Estrategia:
 *   - navegacoes (HTML): network-first com fallback para o cache (offline)
 *   - assets proprios (imagens, icones, manifest): stale-while-revalidate
 *   - Google Fonts: cache-first (imutaveis, versionadas na URL)
 *   - qualquer outra origem: passa direto pela rede, sem cache
 */

const VERSION = 'v1';
const PRECACHE = 'verum-precache-' + VERSION;
const RUNTIME = 'verum-runtime-' + VERSION;
const FONTS = 'verum-fonts-' + VERSION;

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/lp-favicon.png',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
  '/ativos.jpeg',
  '/enviar.jpeg',
  '/receber.jpeg',
  '/vesting.jpeg',
  '/portfolio.png',
  '/BDC.png',
  '/BRT.png',
  '/ESCT.png'
];

const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(PRECACHE)
      // addAll e atomico: um 404 derruba a instalacao inteira.
      // Cacheamos um a um para o SW sobreviver a um asset ausente.
      .then((cache) => Promise.all(
        PRECACHE_URLS.map((url) => cache.add(url).catch(() => null))
      ))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  const keep = [PRECACHE, RUNTIME, FONTS];
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names.filter((n) => n.startsWith('verum-') && keep.indexOf(n) === -1)
             .map((n) => caches.delete(n))
      ))
      .then(() => self.clients.claim())
  );
});

// Permite que a pagina force a ativacao de uma versao nova.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

function isFontRequest(url) {
  return FONT_HOSTS.indexOf(url.hostname) !== -1;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Navegacao: rede primeiro (conteudo sempre fresco), cache como rede de seguranca.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(PRECACHE).then((c) => c.put('/index.html', copy));
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match('/index.html')))
    );
    return;
  }

  // Google Fonts: cache-first, URLs versionadas nao mudam de conteudo.
  if (isFontRequest(url)) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok || res.type === 'opaque') {
          const copy = res.clone();
          caches.open(FONTS).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => hit))
    );
    return;
  }

  // Fora da nossa origem (e nao fontes): sem cache.
  if (url.origin !== self.location.origin) return;

  // Assets proprios: stale-while-revalidate.
  event.respondWith(
    caches.match(req).then((hit) => {
      const network = fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(RUNTIME).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => hit);
      return hit || network;
    })
  );
});
