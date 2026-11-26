/** فتح الملفات بلا أي اعتماد على Worker أو DOM: يُستدعى من الـ Worker ومن الخيط الرئيسي (احتياطيًا) ومن الاختبارات. */
import { LoadError, type LoadErrorCode } from '../core/dxf/errors';
import { buildScene } from '../core/scene/build';
import type { Scene } from '../core/scene/scene';
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

/** يفتح محتوى DXF ويعيد رسمًا جاهزًا للعرض، أو يرمي LoadError. */
export function openDrawing(name: string, data: ArrayBuffer): Drawing {
  if (data.byteLength > MAX_FILE_BYTES) {
    throw new LoadError('TOO_LARGE', 'الملف أكبر من الحد المسموح');
  }
  const doc = loadDocument(data);
  const drawing: Drawing = { name, size: data.byteLength, scene: buildScene(doc) };
  if (doc.version !== undefined) drawing.version = doc.version;
  return drawing;
}

export type DwgConvert = (bytes: Uint8Array) => Promise<Uint8Array>;

/** يفتح أي ملف مدعوم: DXF مباشرة، وDWG بعد تحويله إلى DXF بالمحوّل الممرَّر. */
export async function openDrawingCore(name: string, data: ArrayBuffer, convert: DwgConvert): Promise<Drawing> {
  const bytes = new Uint8Array(data);
  if (bytes.length === 0 || detectFormat(bytes) !== 'dwg') return openDrawing(name, data);
  if (data.byteLength > MAX_FILE_BYTES) {
    throw new LoadError('TOO_LARGE', 'الملف أكبر من الحد المسموح');
  }
  const version = dwgVersionLabel(bytes);
  const dxf = await convert(bytes);
  const converted =
    dxf.byteOffset === 0 && dxf.byteLength === dxf.buffer.byteLength
      ? (dxf.buffer as ArrayBuffer)
      : (dxf.buffer.slice(dxf.byteOffset, dxf.byteOffset + dxf.byteLength) as ArrayBuffer);
  const drawing = openDrawing(name, converted);
  return { ...drawing, size: data.byteLength, version };
}

/** كل المخازن الرقمية الكبيرة في المشهد: تُنقل (transfer) بدل نسخها عند العودة من الـ Worker. */
export function sceneBuffers(scene: Scene): ArrayBuffer[] {
  const out = new Set<ArrayBuffer>();
  for (const b of scene.batches) {
    for (const p of b.paths) out.add(p.pts.buffer as ArrayBuffer);
    for (const p of b.fills) out.add(p.pts.buffer as ArrayBuffer);
    for (const h of b.hatches) for (const l of h.loops) out.add(l.buffer as ArrayBuffer);
  }
  return [...out];
}
