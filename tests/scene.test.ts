import { describe, expect, it } from 'vitest';
import { parseDxf } from '../src/core/dxf/parser';
import { TRUE_COLOR_FLAG } from '../src/core/render/aci';
import { buildScene } from '../src/core/scene/build';
import type { Batch, Scene } from '../src/core/scene/scene';
import {
  block,
  blocksSection,
  dxf,
  layersSection,
  line,
  rec,
  section,
  type Pair,
} from './helpers';

function sceneOf(...parts: string[]): Scene {
  return buildScene(parseDxf(dxf(...parts)));
}

function entities(...records: string[]): string {
  return section('ENTITIES', ...records);
}

const allPaths = (scene: Scene) => scene.batches.flatMap((b) => b.paths);
const flat = (p: { pts: Float64Array }) => Array.from(p.pts);
const batchOf = (scene: Scene, layer: string): Batch => {
  const b = scene.batches.find((x) => x.layer === layer);
  if (!b) throw new Error(`لا توجد دفعة للطبقة ${layer}`);
  return b;
};

describe('buildScene: الألوان والطبقات', () => {
  it('BYLAYER يأخذ لون الطبقة', () => {
    const s = sceneOf(layersSection(['A', 3]), entities(line('A', 0, 0, 1, 1)));
    expect(batchOf(s, 'A').color).toBe(3);
  });

  it('لون الكيان الصريح يتقدم على الطبقة', () => {
    const s = sceneOf(layersSection(['A', 3]), entities(line('A', 0, 0, 1, 1, [62, 1])));
    expect(batchOf(s, 'A').color).toBe(1);
  });

  it('اللون الحقيقي 420', () => {
    const s = sceneOf(entities(line('0', 0, 0, 1, 1, [420, 0xff8800])));
    expect(s.batches[0]?.color).toBe(TRUE_COLOR_FLAG + 0xff8800);
  });

  it('الطبقات المجمّدة والمطفأة تبدأ مخفية، والطبقة غير المعرّفة تُنشأ بلون 7', () => {
    const s = sceneOf(
      layersSection(['OFF', -1], ['FROZEN', 2, 1], ['OK', 3]),
      entities(line('IMPLIED', 0, 0, 1, 1)),
    );
    const byName = Object.fromEntries(s.layers.map((l) => [l.name, l]));
    expect(byName['OFF']?.hiddenByDefault).toBe(true);
    expect(byName['FROZEN']?.hiddenByDefault).toBe(true);
    expect(byName['OK']?.hiddenByDefault).toBe(false);
    expect(byName['IMPLIED']).toMatchObject({ color: 7, hiddenByDefault: false, count: 1 });
  });

  it('أسماء الطبقات غير حساسة لحالة الأحرف', () => {
    const s = sceneOf(layersSection(['Walls', 3]), entities(line('WALLS', 0, 0, 1, 1), line('walls', 1, 1, 2, 2)));
    expect(s.layers).toHaveLength(1);
    expect(s.layers[0]).toMatchObject({ name: 'Walls', count: 2 });
  });

  it('يجمع العناصر المتشابهة (طبقة + لون) في دفعة واحدة', () => {
    const s = sceneOf(
      layersSection(['A', 3]),
      entities(line('A', 0, 0, 1, 1), line('A', 1, 1, 2, 2), line('A', 3, 3, 4, 4, [62, 1])),
    );
    expect(s.batches).toHaveLength(2);
    expect(s.batches.find((b) => b.color === 3)?.paths).toHaveLength(2);
  });
});

describe('buildScene: الأشكال', () => {
  it('LINE وحدودها', () => {
    const s = sceneOf(entities(line('0', 1, 2, 5, 9)));
    expect(flat(allPaths(s)[0]!)).toEqual([1, 2, 5, 9]);
    expect(s.bounds).toEqual({ minX: 1, minY: 2, maxX: 5, maxY: 9 });
  });

  it('الدائرة مغلقة وحدودها دقيقة', () => {
    const s = sceneOf(entities(rec('CIRCLE', [10, 10], [20, 0], [40, 5])));
    expect(allPaths(s)[0]?.closed).toBe(true);
    expect(s.bounds.minX).toBeCloseTo(5, 6);
    expect(s.bounds.maxX).toBeCloseTo(15, 6);
  });

  it('الدائرة ذات البثق السالب تنعكس على المحور السيني', () => {
    const s = sceneOf(entities(rec('CIRCLE', [10, 10], [20, 0], [40, 5], [230, -1])));
    expect(s.bounds.minX).toBeCloseTo(-15, 6);
    expect(s.bounds.maxX).toBeCloseTo(-5, 6);
  });

  it('الدوائر والأقواس بنصف قطر صفري أو سالب تُتجاهل', () => {
    const s = sceneOf(entities(rec('CIRCLE', [10, 0], [20, 0], [40, 0]), rec('ARC', [10, 0], [20, 0], [40, -3])));
    expect(allPaths(s)).toHaveLength(0);
  });

  it('الإحداثيات غير المنتهية (NaN/Infinity) لا تدخل المشهد ولا تُفسد الحدود', () => {
    const doc = parseDxf(dxf(entities(line('0', 0, 0, 1, 1), line('0', 5, 5, 6, 6))));
    (doc.entities[0] as { b: { x: number } }).b.x = NaN;
    (doc.entities[1] as { a: { y: number } }).a.y = Infinity;
    const s = buildScene(doc);
    expect(allPaths(s)).toHaveLength(0);
    expect(s.bounds.minX).toBe(Infinity);
  });

  it('POINT يُحفظ كنقطة', () => {
    const s = sceneOf(entities(rec('POINT', [10, 3], [20, 4])));
    expect(s.batches[0]?.points).toEqual([3, 4]);
  });

  it('SOLID المملوء في fills وإطار 3DFACE في paths', () => {
    const s = sceneOf(
      entities(
        rec('SOLID', [10, 0], [20, 0], [11, 1], [21, 0], [12, 0], [22, 1], [13, 1], [23, 1]),
        rec('3DFACE', [10, 0], [20, 0], [11, 1], [21, 0], [12, 1], [22, 1], [13, 0], [23, 1]),
      ),
    );
    expect(s.batches[0]?.fills).toHaveLength(1);
    expect(s.batches[0]?.paths).toHaveLength(1);
    expect(s.batches[0]?.fills[0]?.closed).toBe(true);
  });
});

describe('buildScene: الكتل', () => {
  const blockLine = block('B', [0, 0], line('0', 0, 0, 10, 0));

  it('INSERT بإزاحة ودوران وتحجيم', () => {
    const s = sceneOf(
      blocksSection(blockLine),
      entities(rec('INSERT', [2, 'B'], [10, 100], [20, 50], [41, 2], [42, 2], [50, 90])),
    );
    const p = flat(allPaths(s)[0]!);
    expect(p[0]).toBeCloseTo(100, 6);
    expect(p[1]).toBeCloseTo(50, 6);
    expect(p[2]).toBeCloseTo(100, 6);
    expect(p[3]).toBeCloseTo(70, 6);
  });

  it('نقطة أساس الكتلة تُطرح قبل الإزاحة', () => {
    const s = sceneOf(
      blocksSection(block('B', [5, 5], line('0', 5, 5, 15, 5))),
      entities(rec('INSERT', [2, 'B'], [10, 0], [20, 0])),
    );
    expect(flat(allPaths(s)[0]!)).toEqual([0, 0, 10, 0]);
  });

  it('معامل تحجيم سالب ينعكس', () => {
    const s = sceneOf(
      blocksSection(blockLine),
      entities(rec('INSERT', [2, 'B'], [10, 0], [20, 0], [41, -1])),
    );
    expect(flat(allPaths(s)[0]!)).toEqual([0, 0, -10, 0]);
  });

  it('كيان الطبقة 0 + BYBLOCK يرث طبقة ولون الـ INSERT', () => {
    const inBlock = block('B', [0, 0], line('0', 0, 0, 1, 1, [62, 0]));
    const s = sceneOf(
      layersSection(['DOORS', 3]),
      blocksSection(inBlock),
      entities(rec('INSERT', [8, 'DOORS'], [2, 'B'])),
    );
    expect(s.batches).toHaveLength(1);
    expect(s.batches[0]).toMatchObject({ layer: 'DOORS', color: 3 });
  });

  it('لون الـ INSERT الصريح يرثه BYBLOCK', () => {
    const inBlock = block('B', [0, 0], line('0', 0, 0, 1, 1, [62, 0]));
    const s = sceneOf(
      layersSection(['DOORS', 3]),
      blocksSection(inBlock),
      entities(rec('INSERT', [8, 'DOORS'], [62, 1], [2, 'B'])),
    );
    expect(s.batches[0]).toMatchObject({ layer: 'DOORS', color: 1 });
  });

  it('كيان على طبقة أخرى داخل الكتلة يحتفظ بطبقته ولونها', () => {
    const inBlock = block('B', [0, 0], line('OTHER', 0, 0, 1, 1));
    const s = sceneOf(
      layersSection(['DOORS', 3], ['OTHER', 5]),
      blocksSection(inBlock),
      entities(rec('INSERT', [8, 'DOORS'], [2, 'B'])),
    );
    expect(s.batches[0]).toMatchObject({ layer: 'OTHER', color: 5 });
  });

  it('مصفوفة INSERT (3 أعمدة × 2 صف)', () => {
    const s = sceneOf(
      blocksSection(block('B', [0, 0], line('0', 0, 0, 1, 0))),
      entities(rec('INSERT', [2, 'B'], [10, 0], [20, 0], [70, 3], [71, 2], [44, 10], [45, 20])),
    );
    expect(allPaths(s)).toHaveLength(6);
    expect(s.bounds).toEqual({ minX: 0, minY: 0, maxX: 21, maxY: 20 });
  });

  it('INSERT متداخل يركّب التحويلات', () => {
    const s = sceneOf(
      blocksSection(
        block('INNER', [0, 0], line('0', 0, 0, 1, 0)),
        block('OUTER', [0, 0], rec('INSERT', [2, 'INNER'], [10, 10], [20, 0])),
      ),
      entities(rec('INSERT', [2, 'OUTER'], [10, 0], [20, 5])),
    );
    expect(flat(allPaths(s)[0]!)).toEqual([10, 5, 11, 5]);
  });

  it('أسماء الكتل غير حساسة لحالة الأحرف', () => {
    const s = sceneOf(blocksSection(blockLine), entities(rec('INSERT', [2, 'b'])));
    expect(allPaths(s)).toHaveLength(1);
  });

  it('الكتلة المفقودة تُحسب كغير مدعومة', () => {
    const s = sceneOf(entities(rec('INSERT', [2, 'NOPE'])));
    expect(s.stats.unsupported['INSERT(missing block)']).toBe(1);
  });

  it('الكتلة التي تستدعي نفسها لا تُعلّق البرنامج', () => {
    const s = sceneOf(
      blocksSection(block('A', [0, 0], line('0', 0, 0, 1, 1), rec('INSERT', [2, 'A']))),
      entities(rec('INSERT', [2, 'A'])),
    );
    expect(allPaths(s)).toHaveLength(1);
    expect(s.stats.unsupported['INSERT(cycle)']).toBe(1);
  });

  it('INSERT بثق سالب ينعكس مع موضعه', () => {
    const s = sceneOf(
      blocksSection(blockLine),
      entities(rec('INSERT', [2, 'B'], [10, 10], [20, 0], [230, -1])),
    );
    expect(flat(allPaths(s)[0]!)).toEqual([-10, 0, -20, 0]);
  });

  it('DIMENSION يرسم كتلته', () => {
    const s = sceneOf(
      blocksSection(block('*D1', [0, 0], line('0', 0, 0, 5, 0))),
      entities(rec('DIMENSION', [8, '0'], [2, '*D1'])),
    );
    expect(allPaths(s)).toHaveLength(1);
  });
});

describe('buildScene: النصوص', () => {
  it('TEXT بمحاذاة وسط/منتصف يستخدم نقطة المحاذاة', () => {
    const s = sceneOf(
      entities(rec('TEXT', [10, 0], [20, 0], [11, 7], [21, 8], [72, 1], [73, 2], [40, 3], [1, 'أهلا'])),
    );
    expect(s.texts[0]).toMatchObject({ x: 7, y: 8, height: 3, hAlign: 'center', vAlign: 'middle', lines: ['أهلا'] });
  });

  it('النص يتأثر بتحجيم ودوران الـ INSERT', () => {
    const s = sceneOf(
      blocksSection(block('B', [0, 0], rec('TEXT', [10, 1], [20, 0], [40, 2], [1, 'x']))),
      entities(rec('INSERT', [2, 'B'], [41, 3], [42, 3], [50, 90])),
    );
    const t = s.texts[0]!;
    expect(t.height).toBeCloseTo(6, 6);
    expect(t.rotation).toBeCloseTo(Math.PI / 2, 6);
    expect(t.x).toBeCloseTo(0, 6);
    expect(t.y).toBeCloseTo(3, 6);
  });

  it('MTEXT متعدد الأسطر مع نقطة الإرفاق', () => {
    const s = sceneOf(entities(rec('MTEXT', [10, 0], [20, 0], [40, 2], [71, 9], [1, 'سطر1\\Pسطر2'])));
    expect(s.texts[0]).toMatchObject({ lines: ['سطر1', 'سطر2'], hAlign: 'right', vAlign: 'bottom' });
  });

  it('النص الفارغ أو بارتفاع صفري يُتجاهل', () => {
    const s = sceneOf(
      entities(rec('TEXT', [40, 2], [1, '   ']), rec('TEXT', [40, 0], [1, 'x']), rec('MTEXT', [40, 2], [1, '\\P'])),
    );
    expect(s.texts).toHaveLength(0);
  });
});

describe('buildScene: الحدود والإحصاءات', () => {
  it('حد أقصى للعناصر يوقف البناء ويعلّم الاقتطاع', () => {
    const lines = Array.from({ length: 10 }, (_, i) => line('0', i, 0, i, 1));
    const doc = parseDxf(dxf(entities(...lines)));
    const s = buildScene(doc, { maxPrimitives: 3 });
    expect(s.stats.primitives).toBe(3);
    expect(s.stats.truncated).toBe(true);
  });

  it('مستند فارغ: حدود فارغة وبلا عناصر', () => {
    const s = sceneOf(entities());
    expect(s.stats.primitives).toBe(0);
    expect(s.bounds.minX).toBe(Infinity);
  });

  it('يمرّر عدّاد الكيانات غير المدعومة', () => {
    const s = sceneOf(entities(rec('HATCH', [8, '0'] as Pair)));
    expect(s.stats.unsupported).toEqual({ HATCH: 1 });
  });
});
