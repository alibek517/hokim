const CACHE_NAME = 'ijro-pwa-v20260914_02';

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
      keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  // Faqat GET so'rovlarni va tashqi API bo'lmagan so'rovlarni qayta ishlaymiz
  if (event.request.method !== 'GET') return;

  const url = event.request.url;
  if (
    url.includes('firebaseio.com') ||
    url.includes('firestore.googleapis.com') ||
    url.includes('identitytoolkit.googleapis.com') ||
    url.includes('generativelanguage.googleapis.com') ||
    url.startsWith('chrome-extension:')
  ) {
    return;
  }

  // SPA Navigatsiya so'rovlari (masalan: /web/mayor/tasks, /web/worker, /web/login va h.k.)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const networkResp = await fetch(event.request);
          if (networkResp && networkResp.status < 400) {
            return networkResp;
          }
          // Agar server 404 bersa yoki topilmasa, SPA uchun index.html qaytaramiz
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

  // Statik resurslar (CSS, JS, rasm, shriftlar)
  event.respondWith(
    (async () => {
      try {
        const response = await fetch(event.request);
        if (response && response.status === 200 && response.type === 'basic') {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseClone).catch(() => {});
          });
        }
        return response;
      } catch (err) {
        const cached = await caches.match(event.request);
        if (cached) return cached;

        // HECH QACHON undefined qaytmasligi kerak (TypeError: Failed to convert value to 'Response' oldini olish)
        return new Response('', {
          status: 408,
          statusText: 'Request Timed Out or Offline',
          headers: { 'Content-Type': 'text/plain' }
        });
      }
    })()
  );
});
