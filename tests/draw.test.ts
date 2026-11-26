import { describe, expect, it } from 'vitest';
import { parseDxf } from '../src/core/dxf/parser';
import { colorToCss } from '../src/core/render/aci';
import { drawScene, type DrawOptions } from '../src/core/render/draw';
import { buildScene } from '../src/core/scene/build';
import type { View } from '../src/core/view/viewport';
import { dxf, layersSection, line, rec, section } from './helpers';

/** سياق Canvas وهمي يسجّل ما يُرسم. */
class FakeContext {
  fillStyle = '';
  strokeStyle = '';
  lineWidth = 0;
  lineJoin = '';
  lineCap = '';
  font = '';
  textAlign = '';
  textBaseline = '';
  direction = '';
  moves: Array<[number, number]> = [];
  lines: Array<[number, number]> = [];
  strokes: string[] = [];
  fills: string[] = [];
  rects: Array<[number, number, number, number, string]> = [];
  texts: Array<{ text: string; x: number; y: number; font: string; align: string }> = [];
  translated: Array<[number, number]> = [];
  rotations: number[] = [];

  setTransform() {}
  save() {}
  restore() {}
  beginPath() {}
  closePath() {}
  scale() {}
  rotate(a: number) {
    this.rotations.push(a);
  }
  translate(x: number, y: number) {
    this.translated.push([x, y]);
  }
  moveTo(x: number, y: number) {
    this.moves.push([x, y]);
  }
  lineTo(x: number, y: number) {
    this.lines.push([x, y]);
  }
  stroke() {
    this.strokes.push(this.strokeStyle);
  }
  fillRules: Array<string | undefined> = [];
  fill(rule?: string) {
    this.fills.push(this.fillStyle);
    this.fillRules.push(rule);
  }
  fillRect(x: number, y: number, w: number, h: number) {
    this.rects.push([x, y, w, h, this.fillStyle]);
  }
  fillText(text: string, x: number, y: number) {
    this.texts.push({ text, x, y, font: this.font, align: this.textAlign });
  }
}

const asContext = (c: FakeContext) => c as unknown as CanvasRenderingContext2D;

const options = (over: Partial<DrawOptions> = {}): DrawOptions => ({
  width: 200,
  height: 100,
  dpr: 1,
  theme: 'dark',
  background: '#000',
  hiddenLayers: new Set(),
  ...over,
});

const scene = (...records: string[]) =>
  buildScene(parseDxf(dxf(layersSection(['A', 1], ['B', 3]), section('ENTITIES', ...records))));

const view: View = { scale: 1, tx: 0, ty: 100 };

describe('drawScene', () => {
  it('يحوّل الإحداثيات للشاشة بقلب محور Y', () => {
    const ctx = new FakeContext();
    drawScene(asContext(ctx), scene(line('A', 10, 20, 50, 60)), view, options());
    expect(ctx.moves).toEqual([[10, 80]]);
    expect(ctx.lines).toEqual([[50, 40]]);
    expect(ctx.strokes).toEqual([colorToCss(1, 'dark')]);
  });

  it('يرسم كل طبقة بلونها، ويتخطى الطبقات المخفية', () => {
    const s = scene(line('A', 0, 0, 10, 10), line('B', 20, 20, 30, 30));
    const all = new FakeContext();
    drawScene(asContext(all), s, view, options());
    expect(all.strokes.sort()).toEqual([colorToCss(1, 'dark'), colorToCss(3, 'dark')].sort());

    const hidden = new FakeContext();
    drawScene(asContext(hidden), s, view, options({ hiddenLayers: new Set(['A']) }));
    expect(hidden.strokes).toEqual([colorToCss(3, 'dark')]);
    expect(hidden.moves).toHaveLength(1);
  });

  it('يستبعد المسارات خارج المنطقة المرئية', () => {
    const ctx = new FakeContext();
    drawScene(
      asContext(ctx),
      scene(line('A', 0, 0, 10, 10), line('A', 5000, 5000, 5010, 5010), line('A', -900, 0, -800, 0)),
      view,
      options(),
    );
    expect(ctx.moves).toHaveLength(1);
  });

  it('يتخطى المسارات الأصغر من ربع بكسل', () => {
    const ctx = new FakeContext();
    drawScene(asContext(ctx), scene(line('A', 10, 10, 10.1, 10.1)), view, options());
    expect(ctx.moves).toHaveLength(0);
  });

  it('يرسم النقاط كمربعات 3×3 مركزها النقطة', () => {
    const ctx = new FakeContext();
    drawScene(asContext(ctx), scene(rec('POINT', [8, 'A'], [10, 20], [20, 30])), view, options());
    expect(ctx.rects.filter((r) => r[2] === 3)).toEqual([[18.5, 68.5, 3, 3, colorToCss(1, 'dark')]]);
  });

  it('يرسم المضلعات المملوءة', () => {
    const ctx = new FakeContext();
    drawScene(
      asContext(ctx),
      scene(rec('SOLID', [8, 'A'], [10, 0], [20, 0], [11, 10], [21, 0], [12, 0], [22, 10], [13, 10], [23, 10])),
      view,
      options(),
    );
    expect(ctx.fills).toEqual([colorToCss(1, 'dark')]);
  });
});

describe('drawScene: النصوص', () => {
  const textScene = () =>
    scene(rec('TEXT', [8, 'A'], [10, 50], [20, 40], [40, 10], [50, 90], [1, 'نص']));

  it('يرسم النص بحجم الخط بالبكسل وموضع المرساة والدوران', () => {
    const ctx = new FakeContext();
    drawScene(asContext(ctx), textScene(), view, options());
    expect(ctx.texts).toHaveLength(1);
    expect(ctx.texts[0]?.text).toBe('نص');
    expect(ctx.texts[0]?.font.startsWith('10.0px')).toBe(true);
    expect(ctx.translated).toEqual([[50, 60]]);
    expect(ctx.rotations[0]).toBeCloseTo(-Math.PI / 2, 9);
    expect(ctx.direction).toBe('ltr');
  });

  it('لا يرسم النص الأصغر من 4 بكسل', () => {
    const ctx = new FakeContext();
    drawScene(asContext(ctx), textScene(), { scale: 0.3, tx: 0, ty: 100 }, options());
    expect(ctx.texts).toHaveLength(0);
  });

  it('يتخطى النص أثناء التفاعل (السحب والقرص)', () => {
    const ctx = new FakeContext();
    drawScene(asContext(ctx), textScene(), view, options({ interactive: true }));
    expect(ctx.texts).toHaveLength(0);
  });

  it('يتخطى نص الطبقة المخفية', () => {
    const ctx = new FakeContext();
    drawScene(asContext(ctx), textScene(), view, options({ hiddenLayers: new Set(['A']) }));
    expect(ctx.texts).toHaveLength(0);
  });

  it('يستبعد النص البعيد عن الشاشة', () => {
    const ctx = new FakeContext();
    const far = scene(rec('TEXT', [8, 'A'], [10, 9000], [20, 9000], [40, 10], [1, 'بعيد']));
    drawScene(asContext(ctx), far, view, options());
    expect(ctx.texts).toHaveLength(0);
  });

  it('النص متعدد الأسطر: كل سطر بإزاحة رأسية', () => {
    const ctx = new FakeContext();
    const s = scene(rec('MTEXT', [8, 'A'], [10, 50], [20, 40], [40, 10], [71, 7], [1, 'أ\\Pب\\Pج']));
    drawScene(asContext(ctx), s, view, options());
    const ys = ctx.texts.map((t) => t.y);
    expect(ys).toHaveLength(3);
    expect(ys[1]! - ys[0]!).toBeCloseTo(14, 6);
    expect(ys[2]! - ys[1]!).toBeCloseTo(14, 6);
    expect(ctx.texts[0]?.align).toBe('left');
  });

  it('HATCH بثقب يُملأ بقاعدة even-odd في استدعاء واحد', () => {
    const g = (c: number, v: string | number) => `${String(c).padStart(3, ' ')}\n${v}\n`;
    const loop = (pts: number[][]) =>
      g(92, 7) + g(72, 0) + g(73, 1) + g(93, pts.length) + pts.map(([x, y]) => g(10, x as number) + g(20, y as number)).join('');
    const hatch =
      g(0, 'HATCH') + g(8, 'A') + g(70, 1) + g(91, 2) +
      loop([[0, 0], [90, 0], [90, 90], [0, 90]]) + loop([[30, 30], [60, 30], [60, 60], [30, 60]]) + g(75, 0);
    const ctx = new FakeContext();
    drawScene(asContext(ctx), scene(hatch), view, options());
    expect(ctx.fillRules).toEqual(['evenodd']);
    expect(ctx.fills).toEqual([colorToCss(1, 'dark')]);
  });

  it('إخفاء طبقة INSERT يخفي محتوى الكتلة', () => {
    const doc = dxf(
      layersSection(['A', 1], ['B', 3]),
      section('BLOCKS', '  0\nBLOCK\n  2\nBLK\n 10\n0\n 20\n0\n  0\nLINE\n  8\nA\n 10\n0\n 20\n0\n 11\n10\n 21\n10\n  0\nENDBLK\n'),
      section('ENTITIES', rec('INSERT', [8, 'B'], [2, 'BLK'], [10, 0], [20, 0])),
    );
    const s = buildScene(parseDxf(doc));
    const shown = new FakeContext();
    drawScene(asContext(shown), s, view, options());
    expect(shown.strokes).toHaveLength(1);
    const hidden = new FakeContext();
    drawScene(asContext(hidden), s, view, options({ hiddenLayers: new Set(['B']) }));
    expect(hidden.strokes).toHaveLength(0);
  });
});
