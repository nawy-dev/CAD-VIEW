/**
 * تحويل DWG إلى DXF عبر LibreDWG (WASM) المضمَّن محليًا في public/vendor/libredwg.
 * يعمل في Web Worker كي لا تتجمّد الواجهة، ويُحمَّل عند أول فتح لملف DWG فقط (لا اتصال خارجي).
 * بدون Worker (Node/اختبارات) يعمل على نفس الخيط. يُنهى الـ Worker بعد فترة خمول فتتحرر ذاكرة WASM.
 */
import { LoadError } from '../core/dxf/errors';
import {
  createDwgEngine,
  loaderFor,
  vendorUrlFromPage,
  type DwgEngine,
  type DwgModule,
  type DwgModuleLoader,
  type WorkerRequest,
  type WorkerResponse,
} from './dwg-engine';

export type { DwgModule, DwgModuleLoader };

/** مدة الخمول قبل إنهاء الـ Worker (ms). */
export const WORKER_IDLE_MS = 30_000;
/** أقصى مدة لتحويل واحد قبل اعتباره عالقًا (ms). */
export const CONVERT_TIMEOUT_MS = 120_000;

let inThreadLoader: DwgModuleLoader | undefined;
let inThread: DwgEngine | null = null;
/** عند true يُفرض التشغيل على الخيط الحالي (للاختبارات). */
let forceInThread = false;

/** للاختبارات: استبدال المحمّل وتشغيل المحرك على نفس الخيط. */
export function setDwgModuleLoader(next: DwgModuleLoader | null): void {
  inThreadLoader = next ?? undefined;
  inThread = null;
  forceInThread = next !== null;
  workerUnsupported = false;
  workerEverWorked = false;
  terminateWorker();
}

// ───────────── Worker ─────────────
interface Pending {
  resolve(dxf: Uint8Array): void;
  reject(error: unknown): void;
  timer: ReturnType<typeof setTimeout>;
}

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, Pending>();
let idleTimer: ReturnType<typeof setTimeout> | undefined;

function terminateWorker(): void {
  clearTimeout(idleTimer);
  worker?.terminate();
  worker = null;
}

function failAll(error: unknown): void {
  const all = [...pending.values()];
  pending.clear();
  terminateWorker();
  for (const p of all) {
    clearTimeout(p.timer);
    p.reject(error);
  }
}

/** صار الـ Worker يعمل فعلًا مرة واحدة على الأقل؟ وإلا فهو غير مدعوم هنا فنرجع للخيط الرئيسي. */
let workerEverWorked = false;
let workerUnsupported = false;

function getWorker(): Worker {
  if (worker) return worker;
  const w = new Worker(new URL('./dwg.worker.ts', import.meta.url), { type: 'module' });
  w.onmessage = (event: MessageEvent<WorkerResponse>) => {
    const msg = event.data;
    const entry = pending.get(msg.id);
    if (!entry) return;
    pending.delete(msg.id);
    clearTimeout(entry.timer);
    workerEverWorked = true;
    if (msg.ok) entry.resolve(msg.dxf);
    else entry.reject(new LoadError(msg.code, msg.message, msg.detail));
    if (pending.size === 0) {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(terminateWorker, WORKER_IDLE_MS);
    }
  };
  // فشل تحميل سكربت الـ Worker أو انهياره
  w.onerror = (event) => {
    event.preventDefault?.();
    failAll(new LoadError('DWG_ENGINE', 'تعذّر تحميل محرك DWG', event.message || undefined));
  };
  w.onmessageerror = () => failAll(new LoadError('DWG_ENGINE', 'تعذّر تحميل محرك DWG'));
  worker = w;
  return w;
}

function convertInWorker(bytes: Uint8Array): Promise<Uint8Array> {
  return new Promise<Uint8Array>((resolve, reject) => {
    const id = nextId++;
    clearTimeout(idleTimer);
    // ملف عالق (انهيار صامت) لا يجب أن يجمّد التطبيق للأبد
    const timer = setTimeout(
      () => failAll(new LoadError('PARSE', 'استغرق تحويل ملف DWG وقتًا أطول من اللازم', 'timeout')),
      CONVERT_TIMEOUT_MS,
    );
    pending.set(id, { resolve, reject, timer });
    try {
      // ننسخ المدخل لأن نقل المخزن الأصلي سيفرغه ويُستخدم لاحقًا في الملفات الأخيرة
      const copy = bytes.slice();
      const request: WorkerRequest = { id, bytes: copy, vendorUrl: vendorUrlFromPage() };
      getWorker().postMessage(request, [copy.buffer]);
    } catch (error) {
      pending.delete(id);
      clearTimeout(timer);
      workerUnsupported = true;
      reject(new LoadError('DWG_ENGINE', 'تعذّر تحميل محرك DWG', error instanceof Error ? error.message : undefined));
    }
  });
}

function convertOnThisThread(bytes: Uint8Array): Promise<Uint8Array> {
  inThread ??= createDwgEngine(inThreadLoader ?? loaderFor(vendorUrlFromPage()));
  return inThread.convert(bytes);
}

export async function convertDwgToDxf(bytes: Uint8Array): Promise<Uint8Array> {
  if (forceInThread || workerUnsupported || typeof Worker === 'undefined') return convertOnThisThread(bytes);
  try {
    return await convertInWorker(bytes);
  } catch (error) {
    // Worker لم يعمل قط (متصفح/WebView قديم لا يدعم module workers): نحوّل على الخيط الرئيسي
    if (!workerEverWorked && error instanceof LoadError && error.code === 'DWG_ENGINE') {
      workerUnsupported = true;
      return convertOnThisThread(bytes);
    }
    throw error;
  }
}
