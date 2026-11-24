import { describe, expect, it } from 'vitest';
import { LoadError } from '../src/core/dxf/errors';
import { decodeDxfBytes, detectFormat, dwgVersionLabel, loadDocument } from '../src/loader/loadFile';
import { entitiesDoc, g, rec, section, dxf, toArrayBuffer, utf8 } from './helpers';

const ascii = (s: string): Uint8Array => Uint8Array.from(s, (c) => c.charCodeAt(0));

function dwgBytes(version: string): Uint8Array {
  const out = new Uint8Array(128);
  out.set(ascii(version), 0);
  return out;
}

function errorOf(fn: () => unknown): LoadError {
  try {
    fn();
  } catch (error) {
    if (error instanceof LoadError) return error;
    throw error;
  }
  throw new Error('كان يجب أن يرمي LoadError');
}

describe('detectFormat', () => {
  it('يتعرف على DWG بكل الإصدارات الحديثة', () => {
    for (const v of ['AC1015', 'AC1018', 'AC1021', 'AC1024', 'AC1027', 'AC1032']) {
      expect(detectFormat(dwgBytes(v))).toBe('dwg');
    }
  });

  it('يتعرف على DWG القديم جدًا', () => {
    expect(detectFormat(ascii('AC1.40\0\0\0\0'))).toBe('dwg');
  });

  it('يتعرف على DXF الثنائي', () => {
    expect(detectFormat(ascii('AutoCAD Binary DXF\r\n\x1a\0'))).toBe('binary-dxf');
  });

  it('النص العادي = dxf', () => {
    expect(detectFormat(ascii('  0\nSECTION\n'))).toBe('dxf');
  });
});

describe('dwgVersionLabel', () => {
  it('اسم الإصدار المقروء', () => {
    expect(dwgVersionLabel(dwgBytes('AC1027'))).toBe('AutoCAD 2013');
    expect(dwgVersionLabel(dwgBytes('AC1032'))).toBe('AutoCAD 2018');
    expect(dwgVersionLabel(dwgBytes('AC1099'))).toBe('AC1099');
  });
});

describe('loadDocument', () => {
  const small = entitiesDoc(rec('TEXT', [10, 0], [20, 0], [40, 1], [1, 'مرحبا']));

  it('يفتح DXF بترميز UTF-8 ويحفظ العربية', () => {
    const doc = loadDocument(utf8(small));
    expect(doc.entities[0]).toMatchObject({ type: 'TEXT', text: 'مرحبا' });
  });

  it('يتجاوز BOM في بداية الملف', () => {
    const doc = loadDocument(utf8('﻿' + small));
    expect(doc.entities).toHaveLength(1);
  });

  it('DWG: يرمي DWG_UNSUPPORTED مع اسم الإصدار', () => {
    const error = errorOf(() => loadDocument(toArrayBuffer(dwgBytes('AC1027'))));
    expect(error.code).toBe('DWG_UNSUPPORTED');
    expect(error.detail).toBe('AutoCAD 2013');
  });

  it('DXF الثنائي: يرمي BINARY_DXF', () => {
    const error = errorOf(() => loadDocument(toArrayBuffer(ascii('AutoCAD Binary DXF\r\n\x1a\0rest'))));
    expect(error.code).toBe('BINARY_DXF');
  });

  it('ملف فارغ: EMPTY', () => {
    expect(errorOf(() => loadDocument(new ArrayBuffer(0))).code).toBe('EMPTY');
  });

  it('نص غير DXF: NOT_DXF', () => {
    expect(errorOf(() => loadDocument(utf8('هذا ليس ملف رسم'))).code).toBe('NOT_DXF');
    expect(errorOf(() => loadDocument(utf8('hello world'))).code).toBe('NOT_DXF');
  });

  it('بيانات ثنائية عشوائية: NOT_DXF', () => {
    const noise = Uint8Array.from({ length: 64 }, (_, i) => (i * 37 + 11) % 256);
    expect(errorOf(() => loadDocument(toArrayBuffer(noise))).code).toBe('NOT_DXF');
  });
});

describe('decodeDxfBytes: صفحات الترميز القديمة', () => {
  /** ملف قديم بترميز Windows-1256 (ANSI_1256): الحرف "ا" هو البايت C7. */
  function legacyFile(codepage: string, byte: number): Uint8Array {
    // قيمة النص علامة "~" ثم نستبدل بايتها بالبايت القديم المطلوب
    const out = ascii(
      dxf(
        section('HEADER', g(9, '$DWGCODEPAGE'), g(3, codepage)),
        section('ENTITIES', rec('TEXT', [10, 0], [20, 0], [40, 1], [1, '~'])),
      ),
    );
    const at = out.indexOf(0x7e);
    if (at < 0) throw new Error('العلامة غير موجودة');
    out[at] = byte;
    return out;
  }

  it('ANSI_1256 يفك العربية', () => {
    const text = decodeDxfBytes(legacyFile('ANSI_1256', 0xc7));
    expect(text).toContain('\nا\n');
  });

  it('ANSI_1252 يفك الحروف اللاتينية الموسّعة', () => {
    const text = decodeDxfBytes(legacyFile('ANSI_1252', 0xe9));
    expect(text).toContain('\né\n');
  });

  it('بدون صفحة ترميز يستخدم Windows-1252', () => {
    const bytes = ascii('  0\nSECTION\n  1\n');
    const withByte = new Uint8Array(bytes.length + 2);
    withByte.set(bytes, 0);
    withByte[bytes.length] = 0xe9;
    withByte[bytes.length + 1] = 0x0a;
    expect(decodeDxfBytes(withByte)).toContain('é');
  });

  it('ملف قديم كامل يُحمَّل وتُقرأ عربيته', () => {
    const doc = loadDocument(toArrayBuffer(legacyFile('ANSI_1256', 0xc7)));
    expect(doc.entities[0]).toMatchObject({ type: 'TEXT', text: 'ا' });
  });
});
