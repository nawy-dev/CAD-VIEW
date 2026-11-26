interface CapacitorGlobal {
  Capacitor?: { isNativePlatform?: () => boolean };
}

/** هل يعمل التطبيق داخل غلاف Capacitor لأندرويد؟ */
export function isNativeApp(): boolean {
  return (globalThis as CapacitorGlobal).Capacitor?.isNativePlatform?.() === true;
}

interface ConnectionInfo {
  saveData?: boolean;
}

/** بعد أن يستقر التطبيق نطلب من الـ SW تخزين محرك DWG (إلا في وضع توفير البيانات). */
function scheduleVendorWarmup(registration: ServiceWorkerRegistration): void {
  const connection = (navigator as Navigator & { connection?: ConnectionInfo }).connection;
  if (connection?.saveData) return;
  const post = () => (navigator.serviceWorker.controller ?? registration.active)?.postMessage({ type: 'warm-vendor' });
  // بعد تحديث يتسلّم الـ SW الجديد التحكم: نعيد الطلب إليه
  navigator.serviceWorker.addEventListener('controllerchange', post);
  const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void })
    .requestIdleCallback;
  if (idle) idle(post, { timeout: 5000 });
  else setTimeout(post, 3000);
}

/**
 * يسجّل الـ service worker في النسخة المبنية فقط (لا في وضع التطوير)،
 * ولا يسجّله داخل غلاف أندرويد لأن الملفات هناك محلية أصلًا.
 */
export function registerServiceWorker(): void {
  if (!__PWA__ || isNativeApp() || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js')
      .then(() => navigator.serviceWorker.ready)
      .then((registration) => scheduleVendorWarmup(registration))
      .catch((error: unknown) => {
        console.warn('تعذّر تسجيل service worker', error);
      });
  });
}
