import { describe, expect, it } from 'vitest';
import { LoadError } from '../src/core/dxf/errors';
import { tokenize } from '../src/core/dxf/tokenizer';

describe('tokenize', () => {
  it('يقرأ الأزواج ويقصّ مسافات رمز المجموعة', () => {
    const t = tokenize('  0\nSECTION\n  2\nENTITIES\n  0\nEOF\n');
    expect(t.length).toBe(3);
    expect(Array.from(t.codes.subarray(0, 3))).toEqual([0, 2, 0]);
    expect(t.values.slice(0, 3)).toEqual(['SECTION', 'ENTITIES', 'EOF']);
  });

  it('يدعم نهايات الأسطر CRLF و CR و LF', () => {
    for (const eol of ['\r\n', '\r', '\n']) {
      const t = tokenize(['0', 'SECTION', '2', 'HEADER', '0', 'EOF', ''].join(eol));
      expect(t.length).toBe(3);
      expect(t.values[1]).toBe('HEADER');
    }
  });

  it('يتوقف عند EOF ويتجاهل ما بعده', () => {
    const t = tokenize('0\nEOF\nهذا\nكلام زائد\n');
    expect(t.length).toBe(1);
  });

  it('يتجاهل التعليقات (999)', () => {
    const t = tokenize('999\nتعليق\n0\nSECTION\n2\nHEADER\n');
    expect(t.length).toBe(2);
    expect(t.values[0]).toBe('SECTION');
  });

  it('يتحمل أسطرًا فارغة في آخر الملف', () => {
    const t = tokenize('0\nSECTION\n2\nHEADER\n\n\n\n');
    expect(t.length).toBe(2);
  });

  it('يحتفظ بقيمة النص كما هي بما فيها المسافات', () => {
    const t = tokenize('1\n  نص بمسافات  \n');
    expect(t.values[0]).toBe('  نص بمسافات  ');
  });

  it('يرمي NOT_DXF عند رمز مجموعة غير رقمي', () => {
    expect(() => tokenize('hello\nworld\n')).toThrow(LoadError);
    try {
      tokenize('hello\nworld\n');
    } catch (error) {
      expect((error as LoadError).code).toBe('NOT_DXF');
    }
  });

  it('يرمي NOT_DXF عند رمز مجموعة فارغ في وسط الملف', () => {
    expect(() => tokenize('0\nSECTION\n\nX\n2\nHEADER\n')).toThrow(LoadError);
  });
});
