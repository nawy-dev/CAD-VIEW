import { LoadError } from '../core/dxf/errors';
import { parseDxf } from '../core/dxf/parser';
import type { DxfDocument } from '../core/dxf/types';

export type FileFormat = 'dwg' | 'dxf' | 'binary-dxf' | 'unknown';

const DWG_VERSIONS: Record<string, string> = {
  AC1006: 'AutoCAD R10',
  AC1009: 'AutoCAD R11/R12',
  AC1012: 'AutoCAD R13',
  AC1014: 'AutoCAD R14',
  AC1015: 'AutoCAD 2000',
  AC1018: 'AutoCAD 2004',
  AC1021: 'AutoCAD 2007',
  AC1024: 'AutoCAD 2010',
  AC1027: 'AutoCAD 2013',
  AC1032: 'AutoCAD 2018',
};

const ascii = (bytes: Uint8Array, from: number, to: number): string =>
  String.fromCharCode(...bytes.subarray(from, Math.min(to, bytes.length)));

/** تحديد الصيغة من محتوى الملف (لا من اسمه). */
export function detectFormat(bytes: Uint8Array): FileFormat {
  const head = ascii(bytes, 0, 22);
  if (head.startsWith('AutoCAD Binary DXF')) return 'binary-dxf';
  // DWG الحديث: AC1015 ... AC1032 (ملف DXF النصي لا يبدأ أبدًا بـ AC)
  if (/^AC\d{4}/.test(head)) return 'dwg';
  // DWG القديم جدًا: AC1.40 / AC2.10 ...
  if (/^AC\d\.\d\d/.test(head)) return 'dwg';
  return 'dxf';
}

export function dwgVersionLabel(bytes: Uint8Array): string {
  const tag = ascii(bytes, 0, 6);
  return DWG_VERSIONS[tag] ?? tag;
}

/** صفحات الترميز في DXF القديم ($DWGCODEPAGE) مقابل أسماء TextDecoder. */
const CODEPAGES: Record<string, string> = {
  ANSI_874: 'windows-874',
  ANSI_932: 'shift_jis',
  ANSI_936: 'gbk',
  ANSI_949: 'euc-kr',
  ANSI_950: 'big5',
  ANSI_1250: 'windows-1250',
  ANSI_1251: 'windows-1251',
  ANSI_1252: 'windows-1252',
  ANSI_1253: 'windows-1253',
  ANSI_1254: 'windows-1254',
  ANSI_1255: 'windows-1255',
  ANSI_1256: 'windows-1256',
  ANSI_1257: 'windows-1257',
  ANSI_1258: 'windows-1258',
};

/**
 * يفك ترميز نص DXF: UTF-8 أولًا (الصيغ الحديثة)، وإلا حسب $DWGCODEPAGE
 * (مثل ANSI_1256 للعربية في الملفات القديمة)، وإلا Windows-1252.
 */
export function decodeDxfBytes(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    // ليس UTF-8 صالحًا
  }
  const header = new TextDecoder('latin1').decode(bytes.subarray(0, Math.min(bytes.length, 20000)));
  const match = /\$DWGCODEPAGE\s*\r?\n\s*3\s*\r?\n\s*([A-Za-z0-9_]+)/.exec(header);
  const label = (match?.[1] && CODEPAGES[match[1].toUpperCase()]) || 'windows-1252';
  try {
    return new TextDecoder(label).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

/** يفتح ملفًا (محتوى خام) ويعيد مستند DXF، أو يرمي LoadError برمز واضح. */
export function loadDocument(data: ArrayBuffer): DxfDocument {
  const bytes = new Uint8Array(data);
  if (bytes.length === 0) throw new LoadError('EMPTY', 'الملف فارغ');

  const format = detectFormat(bytes);
  if (format === 'dwg') {
    throw new LoadError('DWG_UNSUPPORTED', 'صيغة DWG غير مدعومة بعد', dwgVersionLabel(bytes));
  }
  if (format === 'binary-dxf') {
    throw new LoadError('BINARY_DXF', 'صيغة DXF الثنائية غير مدعومة');
  }

  let text = decodeDxfBytes(bytes);
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  try {
    return parseDxf(text);
  } catch (error) {
    if (error instanceof LoadError) throw error;
    throw new LoadError('PARSE', error instanceof Error ? error.message : 'تعذّر تحليل الملف');
  }
}
