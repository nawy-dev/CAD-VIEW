import { LoadError } from './errors';

/** أزواج (رمز المجموعة، القيمة) بصيغة مصفوفتين متوازيتين لتقليل استهلاك الذاكرة. */
export interface Tokens {
  codes: Int32Array;
  values: string[];
  /** عدد الأزواج. */
  length: number;
}

/**
 * يقسّم نص DXF إلى أزواج. ينتهي عند (0, EOF).
 * يرمي LoadError('NOT_DXF') إذا لم يبدأ الملف برمز مجموعة رقمي.
 */
export function tokenize(text: string): Tokens {
  const lines = text.split(/\r\n|\r|\n/);
  const pairCount = Math.floor(lines.length / 2);
  const codes = new Int32Array(pairCount);
  const values: string[] = new Array<string>(pairCount);
  let length = 0;

  for (let i = 0; i + 1 < lines.length; i += 2) {
    const raw = (lines[i] as string).trim();
    const value = lines[i + 1] as string;

    if (raw === '') {
      // أسطر فارغة في آخر الملف مسموحة؛ وفي الوسط تعني ملفًا غير صالح
      if (lines.slice(i).every((l) => l.trim() === '')) break;
      throw new LoadError('NOT_DXF', `رمز مجموعة فارغ في السطر ${i + 1}`);
    }
    if (!/^-?\d+$/.test(raw)) {
      throw new LoadError('NOT_DXF', `رمز مجموعة غير صالح "${raw.slice(0, 20)}" في السطر ${i + 1}`);
    }
    const code = parseInt(raw, 10);
    if (code === 999) continue; // تعليق
    codes[length] = code;
    values[length] = value;
    length++;
    if (code === 0 && value.trim() === 'EOF') break;
  }

  return { codes, values, length };
}
