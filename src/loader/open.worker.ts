/// <reference lib="webworker" />
import { LoadError } from '../core/dxf/errors';
import type { DwgConverter } from './dwg/provider';
import { activeProvider } from './dwg/registry';
import { openDrawingCore, sceneBuffers } from './open-core';
import type { WorkerRequest, WorkerResponse } from './worker-protocol';

let converter: DwgConverter | null = null;
let converterKey = '';

const post = (msg: WorkerResponse, transfer: Transferable[] = []) =>
  (self as unknown as Worker).postMessage(msg, transfer);

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { id, name, bytes, baseUrl } = event.data;
  try {
    const provider = activeProvider();
    const key = provider ? `${provider.id}@${baseUrl}` : '';
    if (provider && (!converter || converterKey !== key)) {
      converter?.reset?.(); // نحرّر المحرك السابق (نسخة WASM) قبل إنشاء الجديد
      converter = provider.create(baseUrl);
      converterKey = key;
    }
    const active = provider ? converter : null;
    const data =
      bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
        ? (bytes.buffer as ArrayBuffer)
        : (bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
    const drawing = await openDrawingCore(name, data, active ? (b) => active.convert(b) : null, (stage) =>
      post({ id, stage }),
    );
    post({ id, ok: true, drawing }, sceneBuffers(drawing.scene));
  } catch (error) {
    if (error instanceof LoadError) {
      post({ id, ok: false, code: error.code, message: error.message, ...(error.detail ? { detail: error.detail } : {}) });
    } else {
      post({ id, ok: false, code: 'UNKNOWN', message: error instanceof Error ? error.message : 'error' });
    }
  }
};
