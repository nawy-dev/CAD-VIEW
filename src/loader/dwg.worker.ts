/// <reference lib="webworker" />
import { createDwgEngine, toWorkerError, type WorkerRequest, type WorkerResponse } from './dwg-engine';

const engine = createDwgEngine();

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { id, bytes } = event.data;
  try {
    const dxf = await engine.convert(bytes);
    const reply: WorkerResponse = { id, ok: true, dxf };
    (self as unknown as Worker).postMessage(reply, [dxf.buffer]);
  } catch (error) {
    (self as unknown as Worker).postMessage(toWorkerError(id, error));
  }
};
