import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LoadError } from '../src/core/dxf/errors';
import { formatBytes, formatCount, formatRelative } from '../src/i18n/format';
import { isLang, strings } from '../src/i18n/strings';
import { MAX_FILE_BYTES, openDrawing, toErrorInfo, type ErrorCode } from '../src/loader/openDrawing';
import { readPref, writePref, type StorageLike } from '../src/state/prefs';
import { toArrayBuffer, utf8, entitiesDoc, line } from './helpers';

describe('التفضيلات', () => {
  const memory = (): StorageLike & { data: Map<string, string> } => {
    const data = new Map<string, string>();
    return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
  };

  it('تكتب وتقرأ قيمة صالحة', () => {
    const s = memory();
    writePref('lang', 'en', s);
    expect(readPref('lang', isLang, 'ar', s)).toBe('en');
  });

  it('القيمة غير الصالحة أو المفقودة ترجع للافتراضي', () => {
    const s = memory();
    expect(readPref('lang', isLang, 'ar', s)).toBe('ar');
    s.setItem('cad-view:lang', 'fr');
    expect(readPref('lang', isLang, 'ar', s)).toBe('ar');
  });

  it('التخزين المعطّل أو الذي يرمي لا يكسر شيئًا', () => {
    const broken: StorageLike = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('quota');
      },
    };
    expect(readPref('lang', isLang, 'ar', broken)).toBe('ar');
    expect(() => writePref('lang', 'en', broken)).not.toThrow();
    expect(readPref('lang', isLang, 'ar', null)).toBe('ar');
  });
});

describe('التنسيق', () => {
  it('formatBytes', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(3901)).toBe('3.8 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5 MB');
  });

  it('formatCount بأرقام لاتينية', () => {
    expect(formatCount(1234567)).toBe('1,234,567');
  });

  it('formatRelative بالعربية والإنجليزية', () => {
    const now = 10_000_000_000;
    expect(formatRelative(now - 5 * 60_000, now, 'en')).toBe('5 minutes ago');
    expect(formatRelative(now - 3 * 3_600_000, now, 'en')).toBe('3 hours ago');
    expect(formatRelative(now - 2 * 86_400_000, now, 'en')).toBe('2 days ago');
    expect(formatRelative(now - 5 * 60_000, now, 'ar')).toContain('5');
    expect(formatRelative(now - 1000, now, 'en')).toBe('now');
  });
});

describe('النصوص المترجمة', () => {
  it('لكل رمز خطأ رسالة بالعربية والإنجليزية', () => {
    const codes: ErrorCode[] = ['EMPTY', 'NOT_DXF', 'BINARY_DXF', 'DWG_UNSUPPORTED', 'DWG_ENGINE', 'TOO_LARGE', 'PARSE', 'READ', 'UNKNOWN'];
    for (const lang of ['ar', 'en'] as const) {
      for (const code of codes) expect(strings[lang].errors[code]().length).toBeGreaterThan(5);
    }
    expect(strings.ar.errors.DWG_UNSUPPORTED('AutoCAD 2013')).toContain('AutoCAD 2013');
    expect(strings.en.errors.DWG_UNSUPPORTED('AutoCAD 2013')).toContain('AutoCAD 2013');
  });

  it('المفاتيح متطابقة بين اللغتين', () => {
    expect(Object.keys(strings.ar).sort()).toEqual(Object.keys(strings.en).sort());
  });
});

describe('openDrawing', () => {
  it('يفتح ملفًا صالحًا ويعيد المشهد والحجم', () => {
    const data = utf8(entitiesDoc(line('0', 0, 0, 5, 5)));
    const d = openDrawing('a.dxf', data);
    expect(d).toMatchObject({ name: 'a.dxf', size: data.byteLength });
    expect(d.scene.stats.primitives).toBe(1);
  });

  it('يرفض الملف الأكبر من الحد', () => {
    expect(() => openDrawing('big.dxf', { byteLength: MAX_FILE_BYTES + 1 } as ArrayBuffer)).toThrow(LoadError);
  });

  it('يفتح الملف النموذجي', () => {
    const bytes = readFileSync(new URL('../public/samples/sample.dxf', import.meta.url));
    expect(openDrawing('s.dxf', toArrayBuffer(new Uint8Array(bytes))).version).toBe('AC1027');
  });

  it('toErrorInfo يحوّل الأخطاء', () => {
    expect(toErrorInfo(new LoadError('DWG_UNSUPPORTED', 'x', 'AutoCAD 2013'))).toEqual({
      code: 'DWG_UNSUPPORTED',
      detail: 'AutoCAD 2013',
    });
    expect(toErrorInfo(new LoadError('EMPTY', 'x'))).toEqual({ code: 'EMPTY' });
    expect(toErrorInfo(new Error('boom'))).toEqual({ code: 'UNKNOWN' });
    expect(toErrorInfo(new DOMException('x', 'NotReadableError'))).toEqual({ code: 'READ' });
  });
});
