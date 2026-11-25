import { LoadError, type LoadErrorCode } from '../core/dxf/errors';
import { buildScene } from '../core/scene/build';
import type { Scene } from '../core/scene/scene';
import { convertDwgToDxf } from './dwg';
import { detectFormat, dwgVersionLabel, loadDocument } from './loadFile';

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

/** يفتح أي ملف مدعوم: DXF مباشرة، وDWG بعد تحويله إلى DXF عبر المحرك المحلي. */
export async function openDrawingFile(name: string, data: ArrayBuffer): Promise<Drawing> {
  const bytes = new Uint8Array(data);
  if (bytes.length === 0 || detectFormat(bytes) !== 'dwg') return openDrawing(name, data);
  if (data.byteLength > MAX_FILE_BYTES) {
    throw new LoadError('TOO_LARGE', 'الملف أكبر من الحد المسموح');
  }
  const version = dwgVersionLabel(bytes);
  const dxf = await convertDwgToDxf(bytes);
  const converted =
    dxf.byteOffset === 0 && dxf.byteLength === dxf.buffer.byteLength
      ? (dxf.buffer as ArrayBuffer)
      : (dxf.buffer.slice(dxf.byteOffset, dxf.byteOffset + dxf.byteLength) as ArrayBuffer);
  const drawing = openDrawing(name, converted);
  return { ...drawing, size: data.byteLength, version };
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
