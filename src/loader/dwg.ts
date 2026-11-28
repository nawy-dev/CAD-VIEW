/**
 * تحويل DWG→DXF على نفس الخيط (احتياطي ولأجل الاختبارات). الاستعمال العادي يجري داخل الـ Worker (open.worker.ts).
 * المحرك نفسه يأتي من registry.ts (قابل للتبديل)، وهذا الملف لا يعرف أي محرك بعينه.
 */
import { LoadError } from '../core/dxf/errors';
import type { DwgConverter } from './dwg/provider';
import { activeProvider } from './dwg/registry';

let converter: DwgConverter | null = null;
let converterKey = '';

/** للاختبارات: تصفير المحوّل المخزّن (بعد تبديل المحرك). */
export function resetDwgConverter(): void {
  converter = null;
}

export function convertDwgToDxf(bytes: Uint8Array): Promise<Uint8Array> {
  const provider = activeProvider();
  if (!provider) return Promise.reject(new LoadError('DWG_UNSUPPORTED', 'هذه النسخة لا تدعم DWG'));
  const base = typeof document !== 'undefined' ? document.baseURI : 'http://localhost/';
  const key = `${provider.id}@${base}`;
  if (!converter || converterKey !== key) {
    converter?.reset?.();
    converter = provider.create(base);
    converterKey = key;
  }
  return converter.convert(bytes);
}
