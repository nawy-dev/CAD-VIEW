/*
 * Service worker لـ CAD-VIEW.
 * العلامتان أدناه تُستبدلان وقت البناء (scripts/precache.ts) بإصدار وقائمة ملفات التطبيق.
 * استراتيجية العمل: كل ملفات التطبيق تُخزَّن مسبقًا، وتُخدَّم من الذاكرة أولًا (cache-first)،
 * فيفتح التطبيق فورًا وبدون إنترنت. لا يوجد أي طلب لخارج الأصل نفسه.
 */
const VERSION = /*__VERSION__*/ 'dev';
const PRECACHE = /*__PRECACHE__*/ [];
const CACHE_PREFIX = 'cad-view-';
const CACHE = CACHE_PREFIX + VERSION;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(PRECACHE.map((url) => new Request(url, { cache: 'reload' })));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE)
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);

      // التنقل بين الصفحات: نخدم دائمًا واجهة التطبيق (SPA)
      if (request.mode === 'navigate') {
        const shell = await cache.match(new URL('index.html', self.registration.scope).href);
        if (shell) return shell;
      }

      const cached = await cache.match(request, { ignoreSearch: true });
      if (cached) return cached;

      try {
        return await fetch(request);
      } catch {
        return Response.error();
      }
    })(),
  );
});
