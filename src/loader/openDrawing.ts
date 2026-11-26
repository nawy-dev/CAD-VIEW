import { LoadError } from '../core/dxf/errors';
import { convertDwgToDxf, isInThreadForced } from './dwg';
import {
  openDrawing,
  openDrawingCore,
  MAX_FILE_BYTES,
  type Drawing,
  type ErrorCode,
  type ErrorInfo,
} from './open-core';
import { openInWorker, workerAvailable, WorkerStartError } from './worker-client';

export { openDrawing, MAX_FILE_BYTES };
export type { Drawing, ErrorCode, ErrorInfo };

/**
 * يفتح أي ملف مدعوم (DXF وDWG) داخل Web Worker كي لا تتجمّد الواجهة،
 * ويرجع إلى الخيط الرئيسي إن لم يكن الـ Worker متاحًا (أو في الاختبارات).
 */
export async function openDrawingFile(name: string, data: ArrayBuffer): Promise<Drawing> {
  if (data.byteLength > MAX_FILE_BYTES) {
    throw new LoadError('TOO_LARGE', 'الملف أكبر من الحد المسموح');
  }
  if (!isInThreadForced() && workerAvailable()) {
    try {
      return await openInWorker(name, data);
    } catch (error) {
      if (!(error instanceof WorkerStartError)) throw error;
      // الـ Worker لا يعمل هنا (متصفح قديم): نكمل على الخيط الرئيسي
    }
  }
  return openDrawingCore(name, data, convertDwgToDxf);
}

/** يحوّل أي خطأ إلى معلومات تعرضها الواجهة برسالة مترجمة. */
export function toErrorInfo(error: unknown): ErrorInfo {
  if (error instanceof LoadError) {
    return error.detail === undefined ? { code: error.code } : { code: error.code, detail: error.detail };
  }
  if (error instanceof DOMException && (error.name === 'NotReadableError' || error.name === 'NotFoundError')) {
    return { code: 'READ' };
  }
  return { code: 'UNKNOWN' };
}
