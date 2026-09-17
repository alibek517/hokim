const CACHE_NAME = 'ijro-pwa-v20260917_06';

const PRECACHE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/store.js',
  './js/app.js',
  './js/mayor.js',
  './js/worker.js',
  './js/chat.js',
  './js/admin.js',
  './js/ai-assistant.js'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(PRECACHE_ASSETS).catch(err => {
        console.warn('SW pre-cache warning:', err);
      });
    })
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.map(k => {
        if (k !== CACHE_NAME) {
          return caches.delete(k);
        }
      })
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = event.request.url;

  // Firebase, Google APIs va tashqi API larni to'g'ridan-to'g'ri tarmoqqa o'tkazish
  if (
    url.includes('firebaseio.com') ||
    url.includes('firestore.googleapis.com') ||
    url.includes('identitytoolkit.googleapis.com') ||
    url.includes('generativelanguage.googleapis.com') ||
    url.startsWith('chrome-extension:')
  ) {
    return;
  }

  const cleanUrl = url.split('?')[0];
  const isHtml = event.request.mode === 'navigate' ||
                 (event.request.headers.get('accept') && event.request.headers.get('accept').includes('text/html')) ||
                 !cleanUrl.match(/\.(js|css|png|jpg|jpeg|svg|webp|gif|json|woff2?|ttf|ico)$/i);

  // 1. HTML va SPA navigatsiya so'rovlari (masalan: /login, /mayor/tasks, /worker va h.k.)
  if (isHtml) {
    event.respondWith(
      (async () => {
        try {
          const networkResp = await fetch(event.request, { cache: 'no-cache' });
          if (networkResp && networkResp.status < 400) {
            return networkResp;
          }
          // Server 404 yoki xato bersa, SPA index.html ni qaytaramiz
          const cachedIndex = await caches.match('./index.html') ||
                              await caches.match('/web/index.html') ||
                              await caches.match('/');
          if (cachedIndex) return cachedIndex;
          return networkResp || (await fetch('./index.html'));
        } catch (err) {
          // Tarmoq uzilgan yoki oflayn bo'lsa
          const cachedIndex = await caches.match('./index.html') ||
                              await caches.match('/web/index.html') ||
                              await caches.match('/');
          if (cachedIndex) return cachedIndex;

          try {
            return await fetch('./index.html');
          } catch (_) {
            return new Response('Internet ulanishi mavjud emas', {
              status: 503,
              statusText: 'Service Unavailable',
              headers: { 'Content-Type': 'text/plain; charset=utf-8' }
            });
          }
        }
      })()
    );
    return;
  }

  // 2. Statik resurslar (CSS, JS, rasm, shriftlar)
  event.respondWith(
    (async () => {
      try {
        const response = await fetch(event.request);
        const cType = response.headers.get('content-type') || '';
        if (response && response.status === 200 && !cType.includes('text/html')) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseClone).catch(() => {});
          });
        }
        return response;
      } catch (err) {
        const cached = await caches.match(event.request);
        if (cached) return cached;

        // Keshda bo'lmasa, soxta 408 bermaymiz, Response.error() qaytaramiz
        return Response.error();
      }
    })()
  );
});
