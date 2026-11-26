import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LoadError } from '../src/core/dxf/errors';
import { openDrawingFile } from '../src/loader/openDrawing';
import { openDrawingCore, sceneBuffers } from '../src/loader/open-core';
import { setDwgModuleLoader } from '../src/loader/dwg';
import { resetWorkerClientForTests } from '../src/loader/worker-client';
import type { WorkerRequest, WorkerResponse } from '../src/loader/worker-protocol';
import { dxf, line, section } from './helpers';

const sample = () => {
  const text = dxf(section('ENTITIES', line('0', 0, 0, 10, 10)));
  return new TextEncoder().encode(text).buffer as ArrayBuffer;
};

type Behaviour = 'ok' | 'start-error' | 'file-error' | 'crash';

/** Worker وهمي يشغّل نفس منطق open.worker.ts لكن في نفس العملية. */
function installFakeWorker(behaviour: () => Behaviour) {
  const created: FakeWorker[] = [];
  class FakeWorker {
    onmessage: ((e: MessageEvent<WorkerResponse>) => void) | null = null;
    onerror: ((e: { message: string; preventDefault(): void }) => void) | null = null;
    onmessageerror: (() => void) | null = null;
    terminated = false;
    requests: WorkerRequest[] = [];
    constructor() {
      if (behaviour() === 'start-error') throw new Error('module workers unsupported');
      created.push(this);
    }
    postMessage(req: WorkerRequest) {
      this.requests.push(req);
      const mode = behaviour();
      queueMicrotask(async () => {
        if (this.terminated) return;
        if (mode === 'crash') {
          this.onerror?.({ message: 'boom', preventDefault() {} });
          return;
        }
        if (mode === 'file-error') {
          this.onmessage?.({ data: { id: req.id, ok: false, code: 'NOT_DXF', message: 'x' } } as MessageEvent<WorkerResponse>);
          return;
        }
        const data = req.bytes.buffer.slice(req.bytes.byteOffset, req.bytes.byteOffset + req.bytes.byteLength) as ArrayBuffer;
        const drawing = await openDrawingCore(req.name, data, async () => new Uint8Array());
        this.onmessage?.({ data: { id: req.id, ok: true, drawing } } as MessageEvent<WorkerResponse>);
      });
    }
    terminate() {
      this.terminated = true;
    }
  }
  (globalThis as { Worker?: unknown }).Worker = FakeWorker;
  return created;
}

describe('فتح الملفات عبر Worker', () => {
  beforeEach(() => {
    setDwgModuleLoader(null); // يلغي الفرض على نفس الخيط
    resetWorkerClientForTests();
    (globalThis as { document?: unknown }).document = { baseURI: 'http://localhost/' };
  });
  afterEach(() => {
    delete (globalThis as { Worker?: unknown }).Worker;
    delete (globalThis as { document?: unknown }).document;
    resetWorkerClientForTests();
  });

  it('يرسل نسخة من البيانات فيبقى الأصل صالحًا للحفظ في الأخيرة', async () => {
    const created = installFakeWorker(() => 'ok');
    const data = sample();
    const d = await openDrawingFile('a.dxf', data);
    expect(d.scene.stats.primitives).toBe(1);
    expect(data.byteLength).toBeGreaterThan(0);
    expect(created).toHaveLength(1);
    expect(created[0]?.requests[0]?.vendorUrl).toBe('http://localhost/vendor/libredwg/libredwg-web.js');
  });

  it('يعيد استخدام نفس الـ Worker بين الملفات', async () => {
    const created = installFakeWorker(() => 'ok');
    await openDrawingFile('a.dxf', sample());
    await openDrawingFile('b.dxf', sample());
    expect(created).toHaveLength(1);
    expect(created[0]?.requests).toHaveLength(2);
  });

  it('خطأ ملف من الـ Worker يصل كـ LoadError بنفس الرمز', async () => {
    installFakeWorker(() => 'file-error');
    const error = await openDrawingFile('a.dxf', sample()).catch((e) => e);
    expect(error instanceof LoadError && error.code === 'NOT_DXF').toBe(true);
  });

  it('فشل إنشاء الـ Worker يرجع للخيط الرئيسي ولا يحاول الـ Worker مجددًا', async () => {
    let attempts = 0;
    installFakeWorker(() => {
      attempts++;
      return 'start-error';
    });
    const d = await openDrawingFile('a.dxf', sample());
    expect(d.scene.stats.primitives).toBe(1);
    const before = attempts;
    await openDrawingFile('b.dxf', sample());
    expect(attempts).toBe(before);
  });

  it('انهيار الـ Worker قبل أن يعمل مرة يرجع للخيط الرئيسي', async () => {
    installFakeWorker(() => 'crash');
    const d = await openDrawingFile('a.dxf', sample());
    expect(d.scene.stats.primitives).toBe(1);
  });

  it('انهيار الـ Worker بعد أن عمل مرة لا يُعاد على الخيط الرئيسي', async () => {
    let mode: Behaviour = 'ok';
    installFakeWorker(() => mode);
    await openDrawingFile('a.dxf', sample());
    mode = 'crash';
    const error = await openDrawingFile('b.dxf', sample()).catch((e) => e);
    expect(error instanceof LoadError && error.code === 'PARSE').toBe(true);
    // وبعد الانهيار يُنشأ Worker جديد ويعمل
    mode = 'ok';
    const d = await openDrawingFile('c.dxf', sample());
    expect(d.scene.stats.primitives).toBe(1);
  });

  it('sceneBuffers تجمع مخازن المسارات والتعبئات بلا تكرار', async () => {
    const d = await openDrawingFile('a.dxf', sample());
    const buffers = sceneBuffers(d.scene);
    expect(buffers.length).toBeGreaterThan(0);
    expect(new Set(buffers).size).toBe(buffers.length);
  });
});
