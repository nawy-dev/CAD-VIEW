import { describe, expect, it } from 'vitest';
import { parseDxf } from '../src/core/dxf/parser';
import { buildScene } from '../src/core/scene/build';
import { dxf, g, layersSection, section } from './helpers';

/** رأس HATCH ثم حلقاته ثم بيانات النمط والبذور كما تكتبها AutoCAD. */
const hatch = (solid: boolean, loops: string[], layer = '0') =>
  g(0, 'HATCH') + g(8, layer) + g(10, 0) + g(20, 0) + g(30, 0) + g(210, 0) + g(220, 0) + g(230, 1) +
  g(2, solid ? 'SOLID' : 'ANSI31') + g(70, solid ? 1 : 0) + g(71, 0) + g(91, loops.length) +
  loops.join('') +
  g(75, 0) + g(76, 1) + g(98, 1) + g(10, 999) + g(20, 999);

const polyLoop = (pts: Array<[number, number]>, bulges: number[] = []) =>
  g(92, 7) + g(72, 1) + g(73, 1) + g(93, pts.length) +
  pts.map(([x, y], i) => g(10, x) + g(20, y) + (bulges[i] ? g(42, bulges[i] as number) : '')).join('') +
  g(97, 0);

const lineEdge = (x1: number, y1: number, x2: number, y2: number) =>
  g(72, 1) + g(10, x1) + g(20, y1) + g(11, x2) + g(21, y2);

const edgeLoop = (...edges: string[]) => g(92, 1) + g(93, edges.length) + edges.join('') + g(97, 0);

const entities = (...r: string[]) => section('ENTITIES', ...r);
const parse = (...r: string[]) => parseDxf(dxf(entities(...r)));
const build = (...r: string[]) => buildScene(parse(...r));

describe('HATCH', () => {
  it('حلقة بوليلاين صلبة تُقرأ وتُرسم كتعبئة', () => {
    const doc = parse(hatch(true, [polyLoop([[0, 0], [10, 0], [10, 10], [0, 10]])]));
    const h = doc.entities[0];
    expect(h?.type).toBe('HATCH');
    if (h?.type !== 'HATCH') return;
    expect(h.solid).toBe(true);
    expect(h.loops).toHaveLength(1);
    expect(h.loops[0]).toHaveLength(8);
    const s = buildScene(doc);
    expect(s.batches[0]?.hatches).toHaveLength(1);
    expect(s.bounds.maxX).toBe(10);
  });

  it('نقطة البذرة بعد 75 لا تُحسب رأسًا ولا توسّع الحدود', () => {
    const s = build(hatch(true, [polyLoop([[0, 0], [10, 0], [10, 10], [0, 10]])]));
    expect(s.bounds.maxX).toBe(10);
    expect(s.bounds.maxY).toBe(10);
  });

  it('حلقة من حواف خطوط تتحول إلى مسار مغلق', () => {
    const doc = parse(
      hatch(true, [edgeLoop(lineEdge(0, 0, 5, 0), lineEdge(5, 0, 5, 5), lineEdge(5, 5, 0, 5), lineEdge(0, 5, 0, 0))]),
    );
    const h = doc.entities[0];
    if (h?.type !== 'HATCH') throw new Error('not hatch');
    expect(h.loops).toHaveLength(1);
    expect(h.loops[0]).toEqual([0, 0, 5, 0, 5, 5, 0, 5]);
  });

  it('حافة معكوسة الاتجاه تُقلب لتتصل', () => {
    const doc = parse(
      hatch(true, [edgeLoop(lineEdge(0, 0, 5, 0), lineEdge(5, 5, 5, 0), lineEdge(5, 5, 0, 5), lineEdge(0, 0, 0, 5))]),
    );
    const h = doc.entities[0];
    if (h?.type !== 'HATCH') throw new Error('not hatch');
    expect(h.loops[0]).toEqual([0, 0, 5, 0, 5, 5, 0, 5]);
  });

  it('حلقة دائرية من قوسين تغطي الدائرة', () => {
    const arc = (s: number, e: number, ccw: number) =>
      g(72, 2) + g(10, 0) + g(20, 0) + g(40, 10) + g(50, s) + g(51, e) + g(73, ccw);
    const doc = parse(hatch(true, [edgeLoop(arc(0, 180, 1), arc(180, 360, 1))]));
    const h = doc.entities[0];
    if (h?.type !== 'HATCH') throw new Error('not hatch');
    const pts = h.loops[0] as number[];
    const xs = pts.filter((_, i) => i % 2 === 0);
    const ys = pts.filter((_, i) => i % 2 === 1);
    expect(Math.max(...xs)).toBeCloseTo(10, 6);
    expect(Math.min(...xs)).toBeCloseTo(-10, 6);
    expect(Math.min(...ys)).toBeCloseTo(-10, 6);
  });

  it('قوس مع عقارب الساعة يمر بالجهة الصحيحة', () => {
    const cw = g(72, 2) + g(10, 0) + g(20, 0) + g(40, 10) + g(50, 0) + g(51, 90) + g(73, 0);
    const doc = parse(hatch(true, [edgeLoop(cw, lineEdge(0, 10, 10, 0))]));
    const h = doc.entities[0];
    if (h?.type !== 'HATCH') throw new Error('not hatch');
    const pts = h.loops[0] as number[];
    // من 0° إلى 90° مع عقارب الساعة = عبر 270° و180°: ينزل لـ y=-10
    const ys = pts.filter((_, i) => i % 2 === 1);
    expect(Math.min(...ys)).toBeCloseTo(-10, 6);
  });

  it('حلقتان (ثقب) تبقيان في تعبئة واحدة', () => {
    const s = build(
      hatch(true, [
        polyLoop([[0, 0], [10, 0], [10, 10], [0, 10]]),
        polyLoop([[3, 3], [7, 3], [7, 7], [3, 7]]),
      ]),
    );
    expect(s.batches[0]?.hatches).toHaveLength(1);
    expect(s.batches[0]?.hatches[0]?.loops).toHaveLength(2);
  });

  it('HATCH بنمط (غير صلب) يُرسم حدوده فقط', () => {
    const s = build(hatch(false, [polyLoop([[0, 0], [4, 0], [4, 4], [0, 4]])]));
    expect(s.batches[0]?.hatches).toHaveLength(0);
    expect(s.batches[0]?.paths).toHaveLength(1);
    expect(s.batches[0]?.paths[0]?.closed).toBe(true);
  });

  it('bulge في حلقة البوليلاين يُحسب', () => {
    const doc = parse(hatch(true, [polyLoop([[0, 0], [10, 0], [10, 10]], [1, 0, 0])]));
    const h = doc.entities[0];
    if (h?.type !== 'HATCH') throw new Error('not hatch');
    expect((h.loops[0] as number[]).length).toBeGreaterThan(6);
  });

  it('الطبقة تُقرأ من رأس HATCH وتُحسب في عدّاد الطبقة', () => {
    const doc = parseDxf(
      dxf(layersSection(['FILL', 5]), entities(hatch(true, [polyLoop([[0, 0], [1, 0], [1, 1]])], 'FILL'))),
    );
    const s = buildScene(doc);
    expect(s.layers.find((l) => l.name === 'FILL')?.count).toBe(1);
    expect(s.batches[0]?.color).toBe(5);
  });

  it('HATCH بلا حلقات صالحة لا يُنتج شيئًا ولا ينهار', () => {
    const s = build(hatch(true, []));
    expect(s.stats.primitives).toBe(0);
  });

  it('HATCH بسبلاين حافة يعطي مسارًا', () => {
    const spline =
      g(72, 4) + g(94, 2) + g(73, 0) + g(74, 0) + g(95, 6) + g(96, 3) +
      [0, 0, 0, 1, 1, 1].map((k) => g(40, k)).join('') +
      g(10, 0) + g(20, 0) + g(10, 5) + g(20, 8) + g(10, 10) + g(20, 0);
    const doc = parse(hatch(true, [edgeLoop(spline, lineEdge(10, 0, 0, 0))]));
    const h = doc.entities[0];
    if (h?.type !== 'HATCH') throw new Error('not hatch');
    expect((h.loops[0] as number[]).length).toBeGreaterThan(6);
  });

  it('حلقة حقيقية من AutoCAD (HatchEdges.dxf) بقوس مع عقارب الساعة وزوايا > 360', () => {
    const arc = g(72, 2) + g(10, 30) + g(20, 5) + g(40, 5) + g(50, 450) + g(51, 270) + g(73, 0);
    const doc = parse(
      hatch(true, [edgeLoop(lineEdge(20, 0, 20, 10), lineEdge(20, 10, 30, 10), arc, lineEdge(30, 0, 20, 0))]),
    );
    const h = doc.entities[0];
    if (h?.type !== 'HATCH') throw new Error('not hatch');
    const pts = h.loops[0] as number[];
    const xs = pts.filter((_, i) => i % 2 === 0);
    // القوس ينتفخ يمينًا حتى x=35 (وليس يسارًا)
    expect(Math.max(...xs)).toBeCloseTo(35, 6);
    expect(Math.min(...xs)).toBeCloseTo(20, 6);
    // لا قفزات: أطول ضلع أصغر من 5
    let longest = 0;
    for (let i = 0; i < pts.length; i += 2) {
      const j = (i + 2) % pts.length;
      longest = Math.max(longest, Math.hypot((pts[j] as number) - (pts[i] as number), (pts[j + 1] as number) - (pts[i + 1] as number)));
    }
    expect(longest).toBeLessThanOrEqual(10);
  });

  const nested = (style: number) => {
    const sq = (a: number, b: number) => polyLoop([[a, a], [b, a], [b, b], [a, b]]);
    const h = hatch(true, [sq(0, 100), sq(10, 90), sq(20, 80)]).replace(g(75, 0), g(75, style));
    const doc = parse(h);
    const e = doc.entities[0];
    if (e?.type !== 'HATCH') throw new Error('not hatch');
    return e.loops.length;
  };

  it('نمط الجزر: عادي 3 حلقات، خارجي 2، تجاهل 1', () => {
    expect(nested(0)).toBe(3);
    expect(nested(1)).toBe(2);
    expect(nested(2)).toBe(1);
  });

  it('محتوى الكتلة على نفس طبقة الـ INSERT يندمج في دفعة واحدة بلا via', () => {
    const doc = dxf(
      layersSection(['A', 1]),
      section('BLOCKS', g(0, 'BLOCK') + g(2, 'B') + g(10, 0) + g(20, 0) + g(0, 'LINE') + g(8, '0') + g(10, 0) + g(20, 0) + g(11, 1) + g(21, 1) + g(0, 'ENDBLK')),
      section('ENTITIES', g(0, 'INSERT') + g(8, 'A') + g(2, 'B') + g(10, 0) + g(20, 0) + g(0, 'LINE') + g(8, 'A') + g(10, 5) + g(20, 5) + g(11, 6) + g(21, 6)),
    );
    const s = buildScene(parseDxf(doc));
    expect(s.batches).toHaveLength(1);
    expect(s.batches[0]?.via).toBeUndefined();
  });

  it('HATCH بنمط يُسجَّل ضمن غير المدعوم لأن النمط لا يُرسم', () => {
    const s = build(hatch(false, [polyLoop([[0, 0], [4, 0], [4, 4], [0, 4]])]));
    expect(s.stats.unsupported['HATCH(pattern)']).toBe(1);
  });
});
