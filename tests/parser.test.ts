import { describe, expect, it } from 'vitest';
import { LoadError } from '../src/core/dxf/errors';
import { parseDxf } from '../src/core/dxf/parser';
import { cleanMText, cleanPlainText, decodeUnicodeEscapes } from '../src/core/dxf/text';
import {
  block,
  blocksSection,
  dxf,
  entitiesDoc,
  g,
  layersSection,
  line,
  rec,
  section,
} from './helpers';

describe('parseDxf: البنية العامة', () => {
  it('يقرأ إصدار الملف من HEADER', () => {
    const doc = parseDxf(dxf(section('HEADER', g(9, '$ACADVER'), g(1, 'AC1027')), section('ENTITIES')));
    expect(doc.version).toBe('AC1027');
  });

  it('يرمي EMPTY لنص فارغ و NOT_DXF لنص عادي', () => {
    expect(() => parseDxf('')).toThrow(LoadError);
    expect(() => parseDxf('   \n  ')).toThrow(LoadError);
    for (const [input, code] of [
      ['', 'EMPTY'],
      ['hello', 'NOT_DXF'],
      ['0\nLINE\n8\n0\n0\nEOF\n', 'NOT_DXF'],
    ] as const) {
      try {
        parseDxf(input);
        throw new Error('كان يجب أن يرمي');
      } catch (error) {
        expect((error as LoadError).code).toBe(code);
      }
    }
  });

  it('يقبل ملفًا يحتوي ENTITIES فارغًا', () => {
    const doc = parseDxf(entitiesDoc());
    expect(doc.entities).toHaveLength(0);
    expect(doc.layers).toHaveLength(0);
  });
});

describe('parseDxf: الطبقات', () => {
  it('يقرأ اللون والتجميد والإطفاء', () => {
    const doc = parseDxf(
      dxf(layersSection(['A', 3], ['B', -5, 1], ['0', 7]), section('ENTITIES')),
    );
    expect(doc.layers).toEqual([
      { name: 'A', aci: 3, off: false, frozen: false },
      { name: 'B', aci: 5, off: true, frozen: true },
      { name: '0', aci: 7, off: false, frozen: false },
    ]);
  });
});

describe('parseDxf: الكيانات الأساسية', () => {
  it('LINE بالطبقة واللون', () => {
    const doc = parseDxf(entitiesDoc(line('WALLS', 1, 2, 3, 4, [62, 1])));
    expect(doc.entities).toHaveLength(1);
    expect(doc.entities[0]).toMatchObject({
      type: 'LINE',
      layer: 'WALLS',
      aci: 1,
      a: { x: 1, y: 2 },
      b: { x: 3, y: 4 },
    });
  });

  it('اللون الافتراضي BYLAYER والطبقة الافتراضية 0', () => {
    const doc = parseDxf(entitiesDoc(rec('POINT', [10, 5], [20, 6])));
    expect(doc.entities[0]).toMatchObject({ type: 'POINT', layer: '0', aci: 256 });
  });

  it('اللون الحقيقي 420', () => {
    const doc = parseDxf(entitiesDoc(line('0', 0, 0, 1, 1, [420, 0xff8800])));
    expect(doc.entities[0]).toMatchObject({ trueColor: 0xff8800 });
  });

  it('CIRCLE و ARC و ELLIPSE', () => {
    const doc = parseDxf(
      entitiesDoc(
        rec('CIRCLE', [10, 1], [20, 2], [40, 3]),
        rec('ARC', [10, 0], [20, 0], [40, 5], [50, 30], [51, 120]),
        rec('ELLIPSE', [10, 1], [20, 1], [11, 10], [21, 0], [40, 0.5], [41, 0], [42, 3.14]),
      ),
    );
    expect(doc.entities[0]).toMatchObject({ type: 'CIRCLE', center: { x: 1, y: 2 }, radius: 3 });
    expect(doc.entities[1]).toMatchObject({ type: 'ARC', radius: 5, startAngle: 30, endAngle: 120 });
    expect(doc.entities[2]).toMatchObject({
      type: 'ELLIPSE',
      majorAxis: { x: 10, y: 0 },
      ratio: 0.5,
      endParam: 3.14,
    });
  });

  it('يقرأ اتجاه البثق 210/220/230', () => {
    const doc = parseDxf(entitiesDoc(rec('CIRCLE', [10, 1], [20, 2], [40, 3], [210, 0], [220, 0], [230, -1])));
    expect(doc.entities[0]).toMatchObject({ extrusion: { x: 0, y: 0, z: -1 } });
  });

  it('LWPOLYLINE مع bulge ومغلقة', () => {
    const doc = parseDxf(
      entitiesDoc(
        rec('LWPOLYLINE', [90, 3], [70, 1], [10, 0], [20, 0], [42, 0.5], [10, 4], [20, 0], [10, 4], [20, 3]),
      ),
    );
    expect(doc.entities[0]).toMatchObject({
      type: 'POLYLINE',
      closed: true,
      vertices: [
        { x: 0, y: 0, bulge: 0.5 },
        { x: 4, y: 0, bulge: 0 },
        { x: 4, y: 3, bulge: 0 },
      ],
    });
  });

  it('POLYLINE القديم مع VERTEX و SEQEND ويتجاهل نقاط التحكم', () => {
    const doc = parseDxf(
      entitiesDoc(
        rec('POLYLINE', [8, 'P'], [70, 1]),
        rec('VERTEX', [10, 0], [20, 0]),
        rec('VERTEX', [10, 5], [20, 0], [42, 1]),
        rec('VERTEX', [10, 9], [20, 9], [70, 16]),
        rec('SEQEND'),
        line('0', 0, 0, 1, 1),
      ),
    );
    expect(doc.entities).toHaveLength(2);
    expect(doc.entities[0]).toMatchObject({
      type: 'POLYLINE',
      layer: 'P',
      closed: true,
      vertices: [
        { x: 0, y: 0, bulge: 0 },
        { x: 5, y: 0, bulge: 1 },
      ],
    });
    expect(doc.entities[1]).toMatchObject({ type: 'LINE' });
  });

  it('شبكات POLYLINE تُحسب كغير مدعومة', () => {
    const doc = parseDxf(
      entitiesDoc(rec('POLYLINE', [70, 64]), rec('VERTEX', [10, 0], [20, 0], [70, 192]), rec('SEQEND')),
    );
    expect(doc.entities).toHaveLength(0);
    expect(doc.unsupported['POLYLINE(MESH)']).toBe(1);
  });

  it('SOLID بترتيب الرسم، والمثلث لا يكرّر الرأس', () => {
    const quad = parseDxf(
      entitiesDoc(rec('SOLID', [10, 0], [20, 0], [11, 1], [21, 0], [12, 0], [22, 1], [13, 1], [23, 1])),
    );
    expect(quad.entities[0]).toMatchObject({
      type: 'SOLID',
      filled: true,
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
      ],
    });
    const tri = parseDxf(
      entitiesDoc(rec('SOLID', [10, 0], [20, 0], [11, 1], [21, 0], [12, 0], [22, 1], [13, 0], [23, 1])),
    );
    expect((tri.entities[0] as { points: unknown[] }).points).toHaveLength(3);
  });

  it('3DFACE إطار غير مملوء و TRACE مملوء', () => {
    const doc = parseDxf(
      entitiesDoc(
        rec('3DFACE', [10, 0], [20, 0], [11, 1], [21, 0], [12, 1], [22, 1], [13, 0], [23, 1]),
        rec('TRACE', [10, 0], [20, 0], [11, 1], [21, 0], [12, 0], [22, 1]),
      ),
    );
    expect(doc.entities[0]).toMatchObject({ type: 'SOLID', filled: false });
    expect(doc.entities[1]).toMatchObject({ type: 'SOLID', filled: true });
  });

  it('SPLINE: درجة وعقد ونقاط تحكم وملاءمة', () => {
    const doc = parseDxf(
      entitiesDoc(
        rec(
          'SPLINE',
          [71, 2],
          [40, 0],
          [40, 0],
          [40, 0],
          [40, 1],
          [40, 1],
          [40, 1],
          [10, 0],
          [20, 0],
          [10, 1],
          [20, 2],
          [10, 2],
          [20, 0],
          [11, 5],
          [21, 5],
        ),
      ),
    );
    expect(doc.entities[0]).toMatchObject({
      type: 'SPLINE',
      degree: 2,
      knots: [0, 0, 0, 1, 1, 1],
      controlPoints: [
        { x: 0, y: 0 },
        { x: 1, y: 2 },
        { x: 2, y: 0 },
      ],
      fitPoints: [{ x: 5, y: 5 }],
    });
  });
});

describe('parseDxf: النصوص', () => {
  it('TEXT يفك \\U+XXXX ورموز %%', () => {
    const doc = parseDxf(
      entitiesDoc(rec('TEXT', [10, 1], [20, 2], [40, 5], [1, '\\U+0627\\U+0644 %%c50 %%d'])),
    );
    expect(doc.entities[0]).toMatchObject({ type: 'TEXT', height: 5, text: 'ال ⌀50 °' });
  });

  it('نقطة المحاذاة لا تُستخدم إلا مع محاذاة غير افتراضية', () => {
    const plain = parseDxf(entitiesDoc(rec('TEXT', [10, 1], [20, 2], [11, 9], [21, 9], [40, 1], [1, 'x'])));
    expect(plain.entities[0]).toMatchObject({ alignPoint: { x: 1, y: 2 } });
    const centered = parseDxf(
      entitiesDoc(rec('TEXT', [10, 1], [20, 2], [11, 9], [21, 9], [72, 1], [40, 1], [1, 'x'])),
    );
    expect(centered.entities[0]).toMatchObject({ alignPoint: { x: 9, y: 9 }, hAlign: 1 });
  });

  it('MTEXT يجمع المقاطع (3) ثم الجزء الأخير (1) ويقرأ الاتجاه', () => {
    const doc = parseDxf(
      entitiesDoc(rec('MTEXT', [10, 0], [20, 0], [40, 2], [71, 5], [3, 'مرحبا '], [3, 'بك'], [1, ' يا صديقي'], [11, 0], [21, 1])),
    );
    expect(doc.entities[0]).toMatchObject({ type: 'MTEXT', text: 'مرحبا بك يا صديقي', attachment: 5 });
    expect((doc.entities[0] as { rotation: number }).rotation).toBeCloseTo(90, 5);
  });
});

describe('تنظيف النصوص', () => {
  it('decodeUnicodeEscapes', () => {
    expect(decodeUnicodeEscapes('\\U+0645\\U+0631\\U+062D\\U+0628\\U+0627')).toBe('مرحبا');
    expect(decodeUnicodeEscapes('plain')).toBe('plain');
  });

  it('cleanPlainText يحوّل %%c و%%d و%%p', () => {
    expect(cleanPlainText('%%c10 %%p0.5 45%%d')).toBe('⌀10 ±0.5 45°');
  });

  it('cleanMText يزيل التنسيق ويحوّل \\P لسطر جديد', () => {
    expect(cleanMText('{\\fArial|b1;Hello}\\PWorld')).toBe('Hello\nWorld');
    expect(cleanMText('\\C1;أحمر \\H2.5;كبير')).toBe('أحمر كبير');
    expect(cleanMText('\\S1/2;')).toBe('1/2');
    expect(cleanMText('\\S1^2;')).toBe('1/2');
    expect(cleanMText('a\\~b')).toBe('a b');
    expect(cleanMText('\\\\ \\{x\\}')).toBe('\\ {x}');
    expect(cleanMText('\\Lتحته خط\\l')).toBe('تحته خط');
  });
});

describe('parseDxf: الكتل و INSERT', () => {
  it('يقرأ الكتلة بنقطة أساسها وكياناتها', () => {
    const doc = parseDxf(
      dxf(blocksSection(block('B1', [5, 5], line('0', 0, 0, 1, 1))), section('ENTITIES')),
    );
    const b = doc.blocks.get('B1');
    expect(b?.basePoint).toEqual({ x: 5, y: 5 });
    expect(b?.entities).toHaveLength(1);
  });

  it('INSERT: كل المعاملات والمصفوفة', () => {
    const doc = parseDxf(
      entitiesDoc(
        rec('INSERT', [8, 'L'], [2, 'B1'], [10, 10], [20, 20], [41, 2], [42, 3], [50, 45], [70, 4], [71, 2], [44, 15], [45, 25]),
      ),
    );
    expect(doc.entities[0]).toMatchObject({
      type: 'INSERT',
      block: 'B1',
      position: { x: 10, y: 20 },
      scale: { x: 2, y: 3 },
      rotation: 45,
      columns: 4,
      rows: 2,
      columnSpacing: 15,
      rowSpacing: 25,
    });
  });

  it('يحوّل ATTRIB التابعة لـ INSERT إلى نصوص ويتخطى SEQEND', () => {
    const doc = parseDxf(
      entitiesDoc(
        rec('INSERT', [2, 'B'], [66, 1]),
        rec('ATTRIB', [1, 'قيمة']),
        rec('ATTRIB', [1, 'ثانية']),
        rec('SEQEND'),
        line('0', 0, 0, 1, 1),
      ),
    );
    expect(doc.entities.map((e) => e.type)).toEqual(['INSERT', 'TEXT', 'TEXT', 'LINE']);
    expect(doc.unsupported).toEqual({});
  });

  it('DIMENSION يُعامل كـ INSERT لكتلته المجهولة', () => {
    const doc = parseDxf(entitiesDoc(rec('DIMENSION', [8, 'DIM'], [2, '*D1'], [10, 5], [20, 5])));
    expect(doc.entities[0]).toMatchObject({ type: 'INSERT', block: '*D1', layer: 'DIM' });
  });

  it('الكيانات غير المدعومة تُعدّ ولا تكسر الملف', () => {
    const doc = parseDxf(
      entitiesDoc(rec('WIPEOUT', [8, '0']), rec('WIPEOUT', [8, '0']), rec('LEADER', [8, '0']), line('0', 0, 0, 1, 1)),
    );
    expect(doc.entities).toHaveLength(1);
    expect(doc.unsupported).toEqual({ WIPEOUT: 2, LEADER: 1 });
  });
});
