/// <reference lib="webworker" />
import { createDwgEngine, loaderFor, toWorkerError, type DwgEngine, type WorkerRequest, type WorkerResponse } from './dwg-engine';

let engine: DwgEngine | null = null;
let engineUrl = '';

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { id, bytes, vendorUrl } = event.data;
  try {
    if (!engine || engineUrl !== vendorUrl) {
      engine = createDwgEngine(loaderFor(vendorUrl));
      engineUrl = vendorUrl;
    }
    const dxf = await engine.convert(bytes);
    const reply: WorkerResponse = { id, ok: true, dxf };
    (self as unknown as Worker).postMessage(reply, [dxf.buffer]);
  } catch (error) {
    (self as unknown as Worker).postMessage(toWorkerError(id, error));
  }
};
