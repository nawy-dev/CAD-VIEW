import type { LoadErrorCode } from '../core/dxf/errors';
import type { Drawing, OpenStage } from './open-core';

/** طلب فتح ملف (DXF أو DWG) داخل الـ Worker. */
export interface WorkerRequest {
  id: number;
  name: string;
  bytes: Uint8Array;
  /** رابط محرك WASM المطلق (تحدده الصفحة لأن الـ Worker لا يعرف أساس التطبيق). */
  vendorUrl: string;
}

export type WorkerResponse =
  | { id: number; stage: OpenStage }
  | { id: number; ok: true; drawing: Drawing }
  | { id: number; ok: false; code: LoadErrorCode | 'UNKNOWN'; message: string; detail?: string };
