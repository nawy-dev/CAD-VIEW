/// <reference lib="webworker" />
import { LoadError } from '../core/dxf/errors';
import { createDwgEngine, loaderFor, type DwgEngine } from './dwg-engine';
import { openDrawingCore, sceneBuffers } from './open-core';
import type { WorkerRequest, WorkerResponse } from './worker-protocol';

let engine: DwgEngine | null = null;
let engineUrl = '';

const post = (msg: WorkerResponse, transfer: Transferable[] = []) =>
  (self as unknown as Worker).postMessage(msg, transfer);

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { id, name, bytes, vendorUrl } = event.data;
  try {
    if (!engine || engineUrl !== vendorUrl) {
      engine = createDwgEngine(loaderFor(vendorUrl));
      engineUrl = vendorUrl;
    }
    const active = engine;
    const data =
      bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
        ? (bytes.buffer as ArrayBuffer)
        : (bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
    const drawing = await openDrawingCore(name, data, (b) => active.convert(b), (stage) => post({ id, stage }));
    post({ id, ok: true, drawing }, sceneBuffers(drawing.scene));
  } catch (error) {
    if (error instanceof LoadError) {
      post({ id, ok: false, code: error.code, message: error.message, ...(error.detail ? { detail: error.detail } : {}) });
    } else {
      post({ id, ok: false, code: 'UNKNOWN', message: error instanceof Error ? error.message : 'error' });
    }
  }
};
