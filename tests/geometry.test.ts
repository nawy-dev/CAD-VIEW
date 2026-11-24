import { describe, expect, it } from 'vitest';
import {
  TAU,
  arcPoints,
  bulgeInterior,
  circlePoints,
  ellipsePoints,
  polylinePoints,
  segmentsForSweep,
} from '../src/core/geometry/arc';
import {
  boundsOfFlat,
  emptyBounds,
  extendBounds,
  intersects,
  isEmptyBounds,
} from '../src/core/geometry/bounds';
import {
  IDENTITY,
  applyToPoint,
  determinant,
  multiply,
  rotation,
  rotationOf,
  scaling,
  transformFlat,
  translation,
  uniformScaleOf,
} from '../src/core/geometry/matrix';
import { ocsMatrix } from '../src/core/geometry/ocs';
import { clampedUniformKnots, splinePoints } from '../src/core/geometry/spline';

describe('المصفوفات', () => {
  it('multiply يطبّق الثانية أولًا', () => {
    const m = multiply(translation(10, 0), rotation(Math.PI / 2));
    const [x, y] = applyToPoint(m, 1, 0);
    expect(x).toBeCloseTo(10, 6);
    expect(y).toBeCloseTo(1, 6);
  });

  it('الهوية لا تغيّر شيئًا', () => {
    expect(applyToPoint(IDENTITY, 3, -4)).toEqual([3, -4]);
    expect(multiply(IDENTITY, scaling(2, 3))).toEqual(scaling(2, 3));
  });

  it('معامل التكبير والدوران والمحدد', () => {
    expect(uniformScaleOf(scaling(2, 8))).toBeCloseTo(4, 9);
    expect(rotationOf(rotation(0.5))).toBeCloseTo(0.5, 9);
    expect(determinant(scaling(-1, 1))).toBe(-1);
  });

  it('transformFlat يحوّل في المكان', () => {
    const pts = [1, 2, 3, 4];
    transformFlat(translation(10, 20), pts);
    expect(pts).toEqual([11, 22, 13, 24]);
  });
});

describe('نظام الإحداثيات الكائني OCS', () => {
  it('الاتجاه الافتراضي (0,0,1) هوية', () => {
    expect(ocsMatrix(0, 0, 1)).toEqual(IDENTITY);
    expect(ocsMatrix(0, 0, 0)).toEqual(IDENTITY);
  });

  it('الاتجاه (0,0,-1) يعكس المحور السيني', () => {
    const [x, y] = applyToPoint(ocsMatrix(0, 0, -1), 1, 2);
    expect(x).toBeCloseTo(-1, 9);
    expect(y).toBeCloseTo(2, 9);
  });

  it('اتجاه جانبي (1,0,0) يسقط (x,y) إلى (0,x)', () => {
    const [x, y] = applyToPoint(ocsMatrix(1, 0, 0), 3, 5);
    expect(x).toBeCloseTo(0, 9);
    expect(y).toBeCloseTo(3, 9);
  });

  it('لا يتأثر بطول متجه البثق', () => {
    expect(ocsMatrix(0, 0, -5)).toEqual(ocsMatrix(0, 0, -1));
  });
});

describe('الحدود', () => {
  it('تبدأ فارغة وتتوسع', () => {
    const b = emptyBounds();
    expect(isEmptyBounds(b)).toBe(true);
    extendBounds(b, 1, 2);
    extendBounds(b, -3, 5);
    expect(b).toEqual({ minX: -3, minY: 2, maxX: 1, maxY: 5 });
    expect(isEmptyBounds(b)).toBe(false);
  });

  it('boundsOfFlat و intersects', () => {
    const a = boundsOfFlat([0, 0, 10, 10]);
    expect(intersects(a, { minX: 5, minY: 5, maxX: 20, maxY: 20 })).toBe(true);
    expect(intersects(a, { minX: 11, minY: 0, maxX: 20, maxY: 5 })).toBe(false);
    expect(intersects(a, { minX: 10, minY: 10, maxX: 12, maxY: 12 })).toBe(true);
  });
});

describe('الأقواس والدوائر', () => {
  it('segmentsForSweep ضمن الحدود', () => {
    expect(segmentsForSweep(TAU)).toBe(180);
    expect(segmentsForSweep(0.0001)).toBe(4);
    expect(segmentsForSweep(100)).toBe(256);
    expect(segmentsForSweep(-TAU)).toBe(180);
  });

  it('الدائرة: كل النقاط على نصف القطر، ولا تتكرر النقطة الأولى', () => {
    const pts = circlePoints(10, -5, 5);
    expect(pts).toHaveLength(360);
    for (let i = 0; i < pts.length; i += 2) {
      expect(Math.hypot((pts[i] as number) - 10, (pts[i + 1] as number) + 5)).toBeCloseTo(5, 9);
    }
    expect(pts[0]).toBeCloseTo(15, 9);
    const last = [pts[pts.length - 2] as number, pts[pts.length - 1] as number];
    expect(Math.hypot(last[0]! - (pts[0] as number), last[1]! - (pts[1] as number))).toBeGreaterThan(0.1);
  });

  it('القوس يبدأ وينتهي في الزاويتين', () => {
    const pts = arcPoints(0, 0, 1, 0, 90);
    expect(pts).toHaveLength(92);
    expect(pts[0]).toBeCloseTo(1, 9);
    expect(pts[1]).toBeCloseTo(0, 9);
    expect(pts[pts.length - 2]).toBeCloseTo(0, 9);
    expect(pts[pts.length - 1]).toBeCloseTo(1, 9);
  });

  it('القوس يلتف حول الصفر (270° → 90°)', () => {
    const pts = arcPoints(0, 0, 1, 270, 90);
    const mid = 45 * 2; // n = 90 قطعة، المنتصف عند الزاوية 0°
    expect(pts[mid]).toBeCloseTo(1, 9);
    expect(pts[mid + 1]).toBeCloseTo(0, 9);
  });

  it('قوس بنفس البداية والنهاية = دائرة كاملة', () => {
    const pts = arcPoints(0, 0, 2, 0, 0);
    expect(pts[0]).toBeCloseTo(pts[pts.length - 2] as number, 9);
    expect(pts.length).toBeGreaterThan(300);
  });
});

describe('bulge', () => {
  it('bulge = 1 نصف دائرة عكس عقارب الساعة (تمر بـ (1,-1))', () => {
    const out: number[] = [];
    bulgeInterior(0, 0, 2, 0, 1, out);
    expect(out).toHaveLength(89 * 2);
    const mid = 44 * 2;
    expect(out[mid]).toBeCloseTo(1, 9);
    expect(out[mid + 1]).toBeCloseTo(-1, 9);
  });

  it('bulge = -1 نصف دائرة مع عقارب الساعة (تمر بـ (1,1))', () => {
    const out: number[] = [];
    bulgeInterior(0, 0, 2, 0, -1, out);
    const mid = 44 * 2;
    expect(out[mid]).toBeCloseTo(1, 9);
    expect(out[mid + 1]).toBeCloseTo(1, 9);
  });

  it('bulge = 0.5: السهم (sagitta) يساوي bulge × الوتر / 2', () => {
    const out: number[] = [];
    bulgeInterior(0, 0, 2, 0, 0.5, out);
    let minY = Infinity;
    for (let i = 1; i < out.length; i += 2) minY = Math.min(minY, out[i] as number);
    expect(minY).toBeCloseTo(-0.5, 2);
  });

  it('bulge = 0 أو وتر صفري لا يضيف نقاطًا', () => {
    const out: number[] = [];
    bulgeInterior(0, 0, 2, 0, 0, out);
    bulgeInterior(1, 1, 1, 1, 1, out);
    expect(out).toHaveLength(0);
  });

  it('polylinePoints: المسار المغلق لا يكرر الرأس، والمفتوح ينتهي بآخر رأس', () => {
    const square = [
      { x: 0, y: 0, bulge: 0 },
      { x: 1, y: 0, bulge: 0 },
      { x: 1, y: 1, bulge: 0 },
      { x: 0, y: 1, bulge: 0 },
    ];
    expect(polylinePoints(square, true)).toHaveLength(8);
    expect(polylinePoints(square, false)).toHaveLength(8);
    expect(polylinePoints(square.slice(0, 3), false)).toEqual([0, 0, 1, 0, 1, 1]);
  });

  it('polylinePoints: bulge على قطعة الإغلاق يضيف نقاطًا', () => {
    const v = [
      { x: 0, y: 0, bulge: 0 },
      { x: 2, y: 0, bulge: 0 },
      { x: 2, y: 2, bulge: 1 },
    ];
    expect(polylinePoints(v, true).length).toBeGreaterThan(6 + 100);
    expect(polylinePoints(v, false)).toHaveLength(6);
  });
});

describe('القطع الناقص', () => {
  it('كامل: مغلق، والنقطة عند t=π/2 على المحور الصغير', () => {
    const { points, closed } = ellipsePoints(5, 5, 10, 0, 0.5, 0, TAU);
    expect(closed).toBe(true);
    expect(points).toHaveLength(360);
    expect(points[0]).toBeCloseTo(15, 9);
    expect(points[45 * 2]).toBeCloseTo(5, 9);
    expect(points[45 * 2 + 1]).toBeCloseTo(10, 9);
  });

  it('جزئي: مفتوح وينتهي عند t=π', () => {
    const { points, closed } = ellipsePoints(0, 0, 10, 0, 0.5, 0, Math.PI);
    expect(closed).toBe(false);
    expect(points[points.length - 2]).toBeCloseTo(-10, 9);
    expect(points[points.length - 1]).toBeCloseTo(0, 9);
  });

  it('اتجاه البثق السالب يعكس المحور الصغير', () => {
    const { points } = ellipsePoints(0, 0, 10, 0, 0.5, 0, TAU, -1);
    expect(points[45 * 2 + 1]).toBeCloseTo(-5, 9);
  });

  it('محور رئيسي مائل', () => {
    const { points } = ellipsePoints(0, 0, 0, 4, 0.5, 0, TAU);
    expect(points[0]).toBeCloseTo(0, 9);
    expect(points[1]).toBeCloseTo(4, 9);
    // t = π/2: المحور الصغير = (-my·ratio, mx·ratio) = (-2, 0)
    expect(points[45 * 2]).toBeCloseTo(-2, 9);
    expect(points[45 * 2 + 1]).toBeCloseTo(0, 9);
  });
});

describe('السبلاين', () => {
  const pts = (...p: Array<[number, number]>) => p.map(([x, y]) => ({ x, y }));

  it('درجة 1 تمر بنقاط التحكم', () => {
    const out = splinePoints({
      degree: 1,
      knots: [0, 0, 1, 2, 2],
      controlPoints: pts([0, 0], [4, 4], [8, 0]),
      weights: [],
      fitPoints: [],
    });
    expect(out[0]).toBeCloseTo(0, 9);
    expect(out[out.length - 2]).toBeCloseTo(8, 9);
    // u=1 هي العينة 16 من 32
    expect(out[16 * 2]).toBeCloseTo(4, 9);
    expect(out[16 * 2 + 1]).toBeCloseTo(4, 9);
  });

  it('منحنى بيزييه من الدرجة 2: منتصفه (1,1)', () => {
    const out = splinePoints({
      degree: 2,
      knots: [0, 0, 0, 1, 1, 1],
      controlPoints: pts([0, 0], [1, 2], [2, 0]),
      weights: [],
      fitPoints: [],
    });
    expect(out[16 * 2]).toBeCloseTo(1, 9);
    expect(out[16 * 2 + 1]).toBeCloseTo(1, 9);
  });

  it('الأوزان تسحب المنحنى نحو نقطة التحكم', () => {
    const base = { degree: 2, knots: [0, 0, 0, 1, 1, 1], controlPoints: pts([0, 0], [1, 2], [2, 0]), fitPoints: [] };
    const plain = splinePoints({ ...base, weights: [1, 1, 1] });
    const heavy = splinePoints({ ...base, weights: [1, 5, 1] });
    expect(heavy[16 * 2 + 1]).toBeGreaterThan(plain[16 * 2 + 1] as number);
  });

  it('عقد غير صالحة: يستبدلها بعقد منتظمة ويبقى المنحنى ماسًا للطرفين', () => {
    const out = splinePoints({
      degree: 3,
      knots: [1, 2],
      controlPoints: pts([0, 0], [1, 3], [3, 3], [4, 0]),
      weights: [],
      fitPoints: [],
    });
    expect(out.length).toBeGreaterThan(20);
    expect(out[0]).toBeCloseTo(0, 9);
    expect(out[1]).toBeCloseTo(0, 9);
    expect(out[out.length - 2]).toBeCloseTo(4, 9);
    expect(out[out.length - 1]).toBeCloseTo(0, 9);
  });

  it('نقاط الملاءمة فقط: Catmull-Rom يمر بالأطراف', () => {
    const out = splinePoints({
      degree: 3,
      knots: [],
      controlPoints: [],
      weights: [],
      fitPoints: pts([0, 0], [1, 1], [2, 0], [3, 1]),
    });
    expect(out.length).toBeGreaterThan(8);
    expect(out[0]).toBe(0);
    expect(out[out.length - 2]).toBe(3);
    expect(out[out.length - 1]).toBe(1);
  });

  it('بدون بيانات كافية يعيد مصفوفة فارغة', () => {
    expect(splinePoints({ degree: 3, knots: [], controlPoints: [], weights: [], fitPoints: [] })).toEqual([]);
  });

  it('clampedUniformKnots بالطول الصحيح', () => {
    expect(clampedUniformKnots(6, 3)).toEqual([0, 0, 0, 0, 1, 2, 3, 3, 3, 3]);
    expect(clampedUniformKnots(3, 2)).toEqual([0, 0, 0, 1, 1, 1]);
  });
});
