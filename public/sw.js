/*
 * Service worker لـ CAD-VIEW.
 * العلامات أدناه تُستبدل وقت البناء (scripts/precache.ts) بإصدارات وقوائم الملفات.
 * - ملفات التطبيق: تُخزَّن عند التثبيت وتُخدَّم من الذاكرة أولًا (cache-first)، فيفتح التطبيق فورًا وبدون إنترنت.
 * - ملفات vendor الثقيلة (محرك DWG ~8MB): كاش مستقل باسم يتبع بصمتها هي فقط. تُحمَّل بأفضل جهد بعد التثبيت
 *   (عند طلب الصفحة 'warm-vendor') أو عند أول استعمال، ولا يُفشل تعذّرها تثبيت التطبيق.
 * لا يوجد أي طلب لخارج الأصل نفسه.
 */
const VERSION = /*__VERSION__*/ 'dev';
const PRECACHE = /*__PRECACHE__*/ [];
const VENDOR_VERSION = /*__VENDOR_VERSION__*/ 'dev';
const VENDOR = /*__VENDOR__*/ [];
const CACHE_PREFIX = 'cad-view-';
const CACHE = CACHE_PREFIX + VERSION;
const VENDOR_CACHE = CACHE_PREFIX + 'vendor-' + VENDOR_VERSION;

const scopeUrl = (path) => new URL(path, self.registration.scope).href;
const isVendor = (url) => url.href.startsWith(scopeUrl('vendor/'));

/** يخزّن ملفات vendor الناقصة فقط (أفضل جهد). يعيد true إن اكتملت كلها. */
async function warmVendorOnce() {
  const cache = await caches.open(VENDOR_CACHE);
  let complete = true;
  for (const path of VENDOR) {
    const url = scopeUrl(path);
    if (await cache.match(url)) continue;
    try {
      // 'reload': أسماء ملفات vendor بلا بصمة، فلا نقبل نسخة قديمة من كاش HTTP داخل كاش بإصدار جديد
      const response = await fetch(new Request(url, { cache: 'reload' }));
      if (response.status === 200) await cache.put(url, response);
      else complete = false;
    } catch {
      complete = false;
    }
  }
  return complete;
}

/** طلبات التسخين المتزامنة (عدة تبويبات أو إعادة تحميل) تشترك في تنزيل واحد. */
let warming = null;
function warmVendor() {
  warming ??= warmVendorOnce().finally(() => {
    warming = null;
  });
  return warming;
}

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
          .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE && name !== VENDOR_CACHE)
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
      // بعد تحديث يغيّر المحرك يكون كاشه الجديد فارغًا: نملؤه بأفضل جهد دون تأخير التفعيل
      warmVendor().catch(() => {});
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'warm-vendor') event.waitUntil(warmVendor());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    (async () => {
      if (isVendor(url)) {
        const vendor = await caches.open(VENDOR_CACHE);
        const hit = await vendor.match(request, { ignoreSearch: true });
        if (hit) return hit;
        try {
          const response = await fetch(request);
          // نخزّن 200 فقط (لا 206) ونعيد الاستجابة فورًا؛ فشل التخزين لا يكسر الطلب
          if (response.status === 200) {
            const copy = response.clone();
            event.waitUntil(vendor.put(request, copy).catch(() => {}));
          }
          return response;
        } catch {
          return Response.error();
        }
      }

      const cache = await caches.open(CACHE);

      // التنقل بين الصفحات: نخدم دائمًا واجهة التطبيق (SPA)
      if (request.mode === 'navigate') {
        const shell = await cache.match(scopeUrl('index.html'));
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
