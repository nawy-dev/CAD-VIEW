import { LoadError, type LoadErrorCode } from '../core/dxf/errors';
import { buildScene } from '../core/scene/build';
import type { Scene } from '../core/scene/scene';
import { loadDocument } from './loadFile';

/** أكبر حجم ملف مقبول للفتح (بايت). */
export const MAX_FILE_BYTES = 150 * 1024 * 1024;

export interface Drawing {
  name: string;
  size: number;
  version?: string;
  scene: Scene;
}

export type ErrorCode = LoadErrorCode | 'READ' | 'UNKNOWN';

export interface ErrorInfo {
  code: ErrorCode;
  detail?: string;
}

/** يفتح محتوى ملف ويعيد رسمًا جاهزًا للعرض، أو يرمي LoadError. */
export function openDrawing(name: string, data: ArrayBuffer): Drawing {
  if (data.byteLength > MAX_FILE_BYTES) {
    throw new LoadError('TOO_LARGE', 'الملف أكبر من الحد المسموح');
  }
  const doc = loadDocument(data);
  const drawing: Drawing = { name, size: data.byteLength, scene: buildScene(doc) };
  if (doc.version !== undefined) drawing.version = doc.version;
  return drawing;
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
