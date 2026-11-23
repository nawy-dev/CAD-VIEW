interface CapacitorGlobal {
  Capacitor?: { isNativePlatform?: () => boolean };
}

/** هل يعمل التطبيق داخل غلاف Capacitor لأندرويد؟ */
export function isNativeApp(): boolean {
  return (globalThis as CapacitorGlobal).Capacitor?.isNativePlatform?.() === true;
}

/**
 * يسجّل الـ service worker في النسخة المبنية فقط (لا في وضع التطوير)،
 * ولا يسجّله داخل غلاف أندرويد لأن الملفات هناك محلية أصلًا.
 */
export function registerServiceWorker(): void {
  if (!__PWA__ || isNativeApp() || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((error: unknown) => {
      console.warn('تعذّر تسجيل service worker', error);
    });
  });
}
