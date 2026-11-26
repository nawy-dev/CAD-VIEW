/**
 * تحويل DWG→DXF على نفس الخيط (احتياطي ولأجل الاختبارات). الاستعمال العادي يجري داخل الـ Worker (open.worker.ts).
 * يعتمد على LibreDWG WASM المضمَّن محليًا في public/vendor/libredwg (لا اتصال خارجي).
 */
import { createDwgEngine, loaderFor, vendorUrlFromPage, type DwgEngine, type DwgModule, type DwgModuleLoader } from './dwg-engine';

export type { DwgModule, DwgModuleLoader };

let inThreadLoader: DwgModuleLoader | undefined;
let engine: DwgEngine | null = null;
/** عند true يُفرض التشغيل على الخيط الحالي (للاختبارات). */
let forced = false;

/** للاختبارات: استبدال المحمّل وفرض التشغيل على نفس الخيط. */
export function setDwgModuleLoader(next: DwgModuleLoader | null): void {
  inThreadLoader = next ?? undefined;
  engine = null;
  forced = next !== null;
}

export const isInThreadForced = (): boolean => forced;

export function convertDwgToDxf(bytes: Uint8Array): Promise<Uint8Array> {
  engine ??= createDwgEngine(inThreadLoader ?? loaderFor(vendorUrlFromPage()));
  return engine.convert(bytes);
}
