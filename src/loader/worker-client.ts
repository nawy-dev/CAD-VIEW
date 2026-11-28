/**
 * عميل الـ Worker: يفتح الملف (تحليل DXF وبناء المشهد وتحويل DWG) خارج الخيط الرئيسي فلا تتجمّد الواجهة.
 * يُنهى الـ Worker بعد فترة خمول فتتحرر ذاكرة WASM وبيانات التحليل.
 */
import { LoadError } from '../core/dxf/errors';
import type { Drawing, StageListener } from './open-core';
import type { WorkerRequest, WorkerResponse } from './worker-protocol';

export const WORKER_IDLE_MS = 30_000;
/** أقصى مدة لفتح ملف واحد قبل اعتباره عالقًا (ms). */
export const OPEN_TIMEOUT_MS = 300_000;

interface Pending {
  resolve(d: Drawing): void;
  reject(e: unknown): void;
  onStage?: StageListener | undefined;
  timer: ReturnType<typeof setTimeout>;
}

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, Pending>();
let idleTimer: ReturnType<typeof setTimeout> | undefined;

/** يعمل الـ Worker فعلًا مرة على الأقل؟ وإلا فهو غير مدعوم هنا فيرجع المستدعي للخيط الرئيسي. */
let everWorked = false;
let unsupported = false;

export const workerAvailable = (): boolean => typeof Worker !== 'undefined' && !unsupported;

function terminate(): void {
  clearTimeout(idleTimer);
  worker?.terminate();
  worker = null;
}

function failAll(error: unknown): void {
  const all = [...pending.values()];
  pending.clear();
  terminate();
  for (const p of all) {
    clearTimeout(p.timer);
    p.reject(error);
  }
}

function getWorker(): Worker {
  if (worker) return worker;
  const w = new Worker(new URL('./open.worker.ts', import.meta.url), { type: 'module' });
  w.onmessage = (event: MessageEvent<WorkerResponse>) => {
    const msg = event.data;
    const entry = pending.get(msg.id);
    if (!entry) return;
    if ('stage' in msg) {
      entry.onStage?.(msg.stage);
      return;
    }
    pending.delete(msg.id);
    clearTimeout(entry.timer);
    everWorked = true;
    if (msg.ok) entry.resolve(msg.drawing);
    else if (msg.code === 'UNKNOWN') entry.reject(new Error(msg.message));
    else entry.reject(new LoadError(msg.code, msg.message, msg.detail));
    if (pending.size === 0) {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(terminate, WORKER_IDLE_MS);
    }
  };
  w.onerror = (event) => {
    event.preventDefault?.();
    failAll(new WorkerStartError(event.message || undefined));
  };
  w.onmessageerror = () => failAll(new WorkerStartError());
  worker = w;
  return w;
}

/** تعذّر تشغيل الـ Worker نفسه (وليس خطأ في الملف). */
export class WorkerStartError extends Error {
  constructor(detail?: string) {
    super(detail ?? 'worker failed');
    this.name = 'WorkerStartError';
  }
}

function runOnce(name: string, data: ArrayBuffer, onStage?: StageListener): Promise<Drawing> {
  return new Promise<Drawing>((resolve, reject) => {
    const id = nextId++;
    clearTimeout(idleTimer);
    const timer = setTimeout(
      () => failAll(new LoadError('PARSE', 'استغرق فتح الملف وقتًا أطول من اللازم', 'timeout')),
      OPEN_TIMEOUT_MS,
    );
    pending.set(id, { resolve, reject, onStage, timer });
    const fail = (error: unknown) => {
      pending.delete(id);
      clearTimeout(timer);
      if (pending.size === 0) {
        clearTimeout(idleTimer);
        idleTimer = setTimeout(terminate, WORKER_IDLE_MS);
      }
      reject(error);
    };
    let w: Worker;
    try {
      w = getWorker();
    } catch (error) {
      // تعذّر إنشاء الـ Worker نفسه (module workers غير مدعومة)
      fail(new WorkerStartError(error instanceof Error ? error.message : undefined));
      return;
    }
    try {
      // ننسخ لأن نقل المخزن الأصلي سيفرغه، والتطبيق يحتاجه لحفظ الملف في الأخيرة
      const copy = data.slice(0);
      const request: WorkerRequest = { id, name, bytes: new Uint8Array(copy), baseUrl: document.baseURI };
      w.postMessage(request, [copy]);
    } catch (error) {
      // فشل إرسال الرسالة (ذاكرة/استنساخ): خطأ في الملف لا في دعم الـ Worker
      fail(new LoadError('PARSE', 'تعذّر إرسال الملف للمعالجة', error instanceof Error ? error.message : undefined));
    }
  });
}

/**
 * يفتح الملف في الـ Worker. يرمي WorkerStartError إن لم يعمل الـ Worker أصلًا في هذا المتصفح
 * (فيعيد المستدعي المحاولة على الخيط الرئيسي)، ويرمي LoadError لأخطاء الملف نفسه.
 */
export async function openInWorker(name: string, data: ArrayBuffer, onStage?: StageListener): Promise<Drawing> {
  try {
    return await runOnce(name, data, onStage);
  } catch (error) {
    if (error instanceof WorkerStartError) {
      if (!everWorked) {
        unsupported = true; // لم يعمل قط: غير مدعوم هنا، يرجع المستدعي للخيط الرئيسي
        throw error;
      }
      // كان يعمل ثم انهار (غالبًا بسبب هذا الملف): لا نعيده على الخيط الرئيسي فنجمّد الواجهة
      throw new LoadError('PARSE', 'تعذّر فتح الملف (توقفت المعالجة)', error.message);
    }
    throw error;
  }
}

/** للاختبارات. */
export function resetWorkerClientForTests(): void {
  failAll(new WorkerStartError('reset'));
  everWorked = false;
  unsupported = false;
}
