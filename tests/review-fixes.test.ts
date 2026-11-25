import { describe, expect, it } from 'vitest';
import { parseDxf } from '../src/core/dxf/parser';
import { buildScene } from '../src/core/scene/build';
import { fingerprint } from '../src/core/storage/recent';
import { toArrayBuffer, block, blocksSection, dxf, entitiesDoc, layersSection, line, rec, section } from './helpers';

/** ثغرات وجدتها المراجعة المستقلة؛ كل اختبار يثبّت إصلاحًا. */
describe('الكتل الدورية والانفجار الأسي', () => {
  it('كتلة تستدعي نفسها مرتين بلا هندسة تنتهي فورًا', () => {
    const doc = parseDxf(
      dxf(blocksSection(block('A', [0, 0], rec('INSERT', [2, 'A']), rec('INSERT', [2, 'A']))), section('ENTITIES', rec('INSERT', [2, 'A']))),
    );
    const t0 = Date.now();
    const scene = buildScene(doc);
    expect(Date.now() - t0).toBeLessThan(1000);
    expect(scene.stats.unsupported['INSERT(cycle)']).toBeGreaterThan(0);
  });

  it('سلسلة كتل غير دورية تتضاعف 2^30 تتوقف عند الحد وتُعلَّم مقتطعة', () => {
    const blocks = Array.from({ length: 30 }, (_, i) =>
      block(`B${i}`, [0, 0], rec('INSERT', [2, `B${i + 1}`]), rec('INSERT', [2, `B${i + 1}`])),
    );
    blocks.push(block('B30', [0, 0], line('0', 0, 0, 1, 1)));
    const doc = parseDxf(dxf(blocksSection(...blocks), section('ENTITIES', rec('INSERT', [2, 'B0']))));
    const t0 = Date.now();
    const scene = buildScene(doc);
    expect(Date.now() - t0).toBeLessThan(5000);
    expect(scene.stats.truncated).toBe(true);
  });
});

describe('فضاء الورق والكيانات غير المرئية', () => {
  it('كيانات 67=1 لا تدخل المشهد ولا تفسد الحدود', () => {
    const doc = parseDxf(entitiesDoc(line('0', 0, 0, 1, 1), line('0', 0, 0, 100000, 100000, [67, 1])));
    expect(doc.entities).toHaveLength(1);
    expect(buildScene(doc).bounds.maxX).toBe(1);
  });

  it('الكيان غير المرئي 60=1 يُتجاهل', () => {
    const doc = parseDxf(entitiesDoc(line('0', 0, 0, 1, 1), line('0', 5, 5, 6, 6, [60, 1])));
    expect(doc.entities).toHaveLength(1);
  });
});

describe('محاذاة النص والحدود', () => {
  it('TEXT بمحاذاة aligned (72=3) يبدأ من نقطة الإدراج', () => {
    const scene = buildScene(
      parseDxf(entitiesDoc(rec('TEXT', [10, 0], [20, 0], [11, 100], [21, 0], [72, 3], [40, 5], [1, 'x']))),
    );
    expect(scene.texts[0]).toMatchObject({ x: 0, y: 0, hAlign: 'left' });
  });

  it('الطبقة المخفية افتراضيًا لا تدخل حدود الملاءمة', () => {
    const scene = buildScene(
      parseDxf(dxf(layersSection(['SHOW', 7], ['DRAFT', 8, 1]), section('ENTITIES', line('SHOW', 0, 0, 10, 10), line('DRAFT', -500, -500, 900, 900)))),
    );
    expect(scene.bounds).toEqual({ minX: 0, minY: 0, maxX: 10, maxY: 10 });
    expect(scene.layers.find((l) => l.name === 'DRAFT')?.count).toBe(1);
  });
});

describe('بصمة الملفات الأخيرة', () => {
  it('تلتقط تعديلًا في منتصف ملف كبير بنفس الحجم', () => {
    const a = new Uint8Array(500_000);
    const b = new Uint8Array(500_000);
    b[250_000] = 1;
    expect(fingerprint(toArrayBuffer(a))).not.toBe(fingerprint(toArrayBuffer(b)));
  });
});
