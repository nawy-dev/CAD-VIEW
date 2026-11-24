import { describe, expect, it } from 'vitest';
import {
  clampScale,
  fitBounds,
  limitsFor,
  panBy,
  pinchView,
  screenToWorld,
  visibleWorldRect,
  worldToScreen,
  zoomAt,
  type View,
} from '../src/core/view/viewport';

const view: View = { scale: 2, tx: 10, ty: 300 };

describe('الإحداثيات', () => {
  it('الذهاب والعودة بين العالم والشاشة', () => {
    const [sx, sy] = worldToScreen(view, 7, 11);
    const [wx, wy] = screenToWorld(view, sx, sy);
    expect(wx).toBeCloseTo(7, 9);
    expect(wy).toBeCloseTo(11, 9);
  });

  it('محور Y مقلوب: القيم الأكبر أعلى الشاشة', () => {
    const [, low] = worldToScreen(view, 0, 0);
    const [, high] = worldToScreen(view, 0, 10);
    expect(high).toBeLessThan(low);
  });
});

describe('zoomAt', () => {
  it('يُبقي النقطة تحت المؤشر ثابتة', () => {
    const before = screenToWorld(view, 100, 120);
    const next = zoomAt(view, 100, 120, 3);
    const after = screenToWorld(next, 100, 120);
    expect(next.scale).toBeCloseTo(6, 9);
    expect(after[0]).toBeCloseTo(before[0], 9);
    expect(after[1]).toBeCloseTo(before[1], 9);
  });

  it('يلتزم بحدود التكبير', () => {
    const limits = { min: 1, max: 5 };
    expect(zoomAt({ scale: 4, tx: 0, ty: 0 }, 0, 0, 10, limits).scale).toBe(5);
    expect(zoomAt({ scale: 2, tx: 0, ty: 0 }, 0, 0, 0.001, limits).scale).toBe(1);
    expect(clampScale(3, limits)).toBe(3);
  });

  it('limitsFor نسبي لمقياس الملاءمة', () => {
    expect(limitsFor(2)).toEqual({ min: 0.1, max: 200_000 });
  });
});

describe('panBy', () => {
  it('يزيح بدون تغيير المقياس', () => {
    expect(panBy(view, 5, -7)).toEqual({ scale: 2, tx: 15, ty: 293 });
  });
});

describe('fitBounds', () => {
  it('يلائم ويوسّط', () => {
    const v = fitBounds({ minX: 0, minY: 0, maxX: 100, maxY: 50 }, 200, 200, 0.1);
    expect(v.scale).toBeCloseTo(1.6, 9);
    const [cx, cy] = worldToScreen(v, 50, 25);
    expect(cx).toBeCloseTo(100, 9);
    expect(cy).toBeCloseTo(100, 9);
  });

  it('الرسم يبقى كله داخل الشاشة', () => {
    const b = { minX: -500, minY: -20, maxX: 1500, maxY: 900 };
    const v = fitBounds(b, 800, 600);
    const [x1, y1] = worldToScreen(v, b.minX, b.maxY);
    const [x2, y2] = worldToScreen(v, b.maxX, b.minY);
    expect(x1).toBeGreaterThanOrEqual(0);
    expect(y1).toBeGreaterThanOrEqual(0);
    expect(x2).toBeLessThanOrEqual(800);
    expect(y2).toBeLessThanOrEqual(600);
  });

  it('حدود فارغة أو نقطة واحدة: مقياس 1 في المنتصف', () => {
    const empty = fitBounds({ minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }, 100, 80);
    expect(empty).toEqual({ scale: 1, tx: 50, ty: 40 });
    const point = fitBounds({ minX: 5, minY: 5, maxX: 5, maxY: 5 }, 100, 80);
    expect(point.scale).toBe(1);
    expect(worldToScreen(point, 5, 5)).toEqual([50, 40]);
  });

  it('خط أفقي أو رأسي (بُعد صفري) لا يعطي مقياسًا لانهائيًا', () => {
    const h = fitBounds({ minX: 0, minY: 3, maxX: 100, maxY: 3 }, 200, 100, 0);
    expect(h.scale).toBeCloseTo(2, 9);
    const v = fitBounds({ minX: 3, minY: 0, maxX: 3, maxY: 50 }, 200, 100, 0);
    expect(v.scale).toBeCloseTo(2, 9);
  });
});

describe('visibleWorldRect', () => {
  it('يطابق حواف الشاشة', () => {
    const r = visibleWorldRect({ scale: 2, tx: 10, ty: 300 }, 200, 100);
    expect(r).toEqual({ minX: -5, maxX: 95, minY: 100, maxY: 150 });
  });
});

describe('pinchView', () => {
  const start: View = { scale: 1, tx: 0, ty: 100 };

  it('مضاعفة المسافة تضاعف المقياس وتُبقي نقطة المنتصف ثابتة', () => {
    const mid = { x: 60, y: 40 };
    const v = pinchView(start, mid, 50, mid, 100);
    expect(v.scale).toBe(2);
    const before = screenToWorld(start, mid.x, mid.y);
    const after = screenToWorld(v, mid.x, mid.y);
    expect(after[0]).toBeCloseTo(before[0], 9);
    expect(after[1]).toBeCloseTo(before[1], 9);
  });

  it('تحريك المنتصف يحرّك الرسم معه', () => {
    const v = pinchView(start, { x: 60, y: 40 }, 50, { x: 90, y: 70 }, 50);
    expect(v.scale).toBe(1);
    expect(v.tx).toBeCloseTo(30, 9);
    expect(v.ty).toBeCloseTo(130, 9);
  });

  it('يلتزم بحدود التكبير ويتحمل مسافة بداية صفرية', () => {
    const limits = { min: 0.5, max: 3 };
    expect(pinchView(start, { x: 0, y: 0 }, 10, { x: 0, y: 0 }, 1000, limits).scale).toBe(3);
    expect(pinchView(start, { x: 0, y: 0 }, 0, { x: 0, y: 0 }, 10, limits).scale).toBe(1);
  });
});
