import type {
  DxfBlock,
  DxfDocument,
  DxfEntity,
  InsertEntity,
  MTextEntity,
  TextEntity,
} from '../dxf/types';
import { cleanMText } from '../dxf/text';
import {
  DEG,
  arcPoints,
  circlePoints,
  ellipsePoints,
  polylinePoints,
} from '../geometry/arc';
import { emptyBounds, extendBounds } from '../geometry/bounds';
import {
  IDENTITY,
  applyToPoint,
  multiply,
  rotation,
  rotationOf,
  scaling,
  transformFlat,
  translation,
  uniformScaleOf,
  type Matrix,
} from '../geometry/matrix';
import { ocsMatrix } from '../geometry/ocs';
import { splinePoints } from '../geometry/spline';
import { trueColorCode } from '../render/aci';
import type { Batch, HAlign, LayerInfo, PathPrim, Scene, TextPrim, VAlign } from './scene';

export interface BuildOptions {
  /** حد أقصى لعدد العناصر لحماية الذاكرة. */
  maxPrimitives?: number;
}

const DEFAULT_MAX_PRIMITIVES = 3_000_000;
const MAX_INSERT_DEPTH = 24;
const MAX_ARRAY_INSTANCES = 10_000;
/** حد أقصى لعدد نسخ الكتل المُوسَّعة، لمنع الانفجار الأسي في الكتل المتداخلة. */
const MAX_INSERT_EXPANSIONS = 200_000;

interface Context {
  matrix: Matrix;
  /** طبقة الـ INSERT الحاوي: ترثها كيانات الطبقة "0" داخل الكتلة. */
  insertLayer: string | undefined;
  /** لون الـ INSERT الحاوي: يرثه BYBLOCK. */
  blockColor: number | undefined;
  depth: number;
  /** طبقات كل INSERT حاوٍ (من الخارج للداخل)؛ إخفاء أي منها يخفي المحتوى. */
  chain: readonly string[];
}

class SceneBuilder {
  /** سلسلة طبقات الـ INSERT للعنصر الجاري رسمه. */
  private via: readonly string[] = [];
  private readonly layers = new Map<string, LayerInfo>();
  private readonly batches = new Map<string, Batch>();
  private readonly texts: TextPrim[] = [];
  private readonly bounds = emptyBounds();
  private readonly blocksByUpper = new Map<string, DxfBlock>();
  private readonly unsupported: Record<string, number>;
  private readonly maxPrimitives: number;
  private readonly blockStack = new Set<string>();
  private expansions = 0;
  private primitives = 0;
  private truncated = false;

  constructor(
    private readonly doc: DxfDocument,
    options: BuildOptions,
  ) {
    this.maxPrimitives = options.maxPrimitives ?? DEFAULT_MAX_PRIMITIVES;
    this.unsupported = { ...doc.unsupported };
    for (const block of doc.blocks.values()) this.blocksByUpper.set(block.name.toUpperCase(), block);
    for (const l of doc.layers) {
      this.layers.set(l.name.toUpperCase(), {
        name: l.name,
        color: l.trueColor !== undefined ? trueColorCode(l.trueColor) : l.aci,
        hiddenByDefault: l.off || l.frozen,
        count: 0,
      });
    }
  }

  build(): Scene {
    this.emitAll(this.doc.entities, {
      matrix: IDENTITY,
      insertLayer: undefined,
      blockColor: undefined,
      depth: 0,
      chain: [],
    });
    return {
      batches: [...this.batches.values()],
      texts: this.texts,
      layers: [...this.layers.values()],
      bounds: this.bounds,
      stats: {
        primitives: this.primitives,
        truncated: this.truncated,
        unsupported: this.unsupported,
      },
    };
  }

  private layer(name: string): LayerInfo {
    const key = name.toUpperCase();
    let info = this.layers.get(key);
    if (!info) {
      info = { name, color: 7, hiddenByDefault: false, count: 0 };
      this.layers.set(key, info);
    }
    return info;
  }

  /** تبدأ مخفية إن كانت طبقتها أو طبقة أي INSERT حاوٍ مخفية افتراضيًا. */
  private startsHidden(layer: LayerInfo): boolean {
    return layer.hiddenByDefault || this.via.some((name) => this.layer(name).hiddenByDefault);
  }

  private bump(type: string): void {
    this.unsupported[type] = (this.unsupported[type] ?? 0) + 1;
  }

  private resolveLayer(e: DxfEntity, ctx: Context): LayerInfo {
    const name = e.layer === '0' && ctx.insertLayer !== undefined ? ctx.insertLayer : e.layer;
    return this.layer(name);
  }

  private resolveColor(e: DxfEntity, layer: LayerInfo, ctx: Context): number {
    if (e.trueColor !== undefined) return trueColorCode(e.trueColor);
    if (e.aci === 0) return ctx.blockColor ?? layer.color;
    if (e.aci >= 1 && e.aci <= 255) return e.aci;
    return layer.color;
  }

  private batch(layer: LayerInfo, color: number): Batch {
    // طبقة الـ INSERT نفسها لا تضيف شيئًا: إخفاؤها يخفي الدفعة أصلًا، فتُدمج الدفعات
    const via = this.via.filter((name) => name !== layer.name);
    const key = `${layer.name}\u0000${color}\u0000${via.join('\u0001')}`;
    let b = this.batches.get(key);
    if (!b) {
      b = { layer: layer.name, color, paths: [], fills: [], hatches: [], points: [] };
      if (via.length > 0) b.via = via;
      this.batches.set(key, b);
    }
    return b;
  }

  private tooMany(): boolean {
    if (this.primitives >= this.maxPrimitives) {
      this.truncated = true;
      return true;
    }
    return false;
  }

  private addPath(layer: LayerInfo, color: number, pts: number[], closed: boolean, fill: boolean): void {
    if (pts.length < 4 || this.tooMany()) return;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i + 1 < pts.length; i += 2) {
      const x = pts[i] as number;
      const y = pts[i + 1] as number;
      if (!Number.isFinite(x) || !Number.isFinite(y)) return; // نتجاهل المسار التالف
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const prim: PathPrim = { pts: Float64Array.from(pts), closed, minX, minY, maxX, maxY };
    const b = this.batch(layer, color);
    (fill ? b.fills : b.paths).push(prim);
    if (!this.startsHidden(layer)) {
      extendBounds(this.bounds, minX, minY);
      extendBounds(this.bounds, maxX, maxY);
    }
    layer.count++;
    this.primitives++;
  }

  /** تعبئة HATCH صلبة بعدة حلقات (الثقوب تظهر بقاعدة even-odd عند الرسم). */
  private addHatch(layer: LayerInfo, color: number, loops: number[][]): void {
    if (this.tooMany()) return;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const pts of loops) {
      for (let i = 0; i + 1 < pts.length; i += 2) {
        const x = pts[i] as number;
        const y = pts[i + 1] as number;
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    if (minX > maxX) return;
    this.batch(layer, color).hatches.push({ loops: loops.map((l) => Float64Array.from(l)), minX, minY, maxX, maxY });
    if (!this.startsHidden(layer)) {
      extendBounds(this.bounds, minX, minY);
      extendBounds(this.bounds, maxX, maxY);
    }
    layer.count++;
    // HATCH ضخم بنقاط كثيرة يُحتسب بوزنه كي يعمل حد العناصر
    this.primitives += 1 + Math.floor(loops.reduce((n, l) => n + l.length, 0) / 128);
  }

  private addPoint(layer: LayerInfo, color: number, x: number, y: number): void {
    if (!Number.isFinite(x) || !Number.isFinite(y) || this.tooMany()) return;
    this.batch(layer, color).points.push(x, y);
    if (!this.startsHidden(layer)) extendBounds(this.bounds, x, y);
    layer.count++;
    this.primitives++;
  }

  private addText(prim: TextPrim): void {
    if (!Number.isFinite(prim.x) || !Number.isFinite(prim.y) || this.tooMany()) return;
    const textVia = this.via.filter((name) => name !== prim.layer);
    if (textVia.length > 0) prim.via = textVia;
    this.texts.push(prim);
    if (!this.startsHidden(this.layer(prim.layer))) extendBounds(this.bounds, prim.x, prim.y);
    this.layer(prim.layer).count++;
    this.primitives++;
  }

  private emitAll(entities: readonly DxfEntity[], ctx: Context): void {
    for (const e of entities) {
      if (this.truncated) return;
      this.emit(e, ctx);
    }
  }

  private emit(e: DxfEntity, ctx: Context): void {
    this.via = ctx.chain;
    if (e.type === 'INSERT') {
      this.emitInsert(e, ctx);
      return;
    }
    const layer = this.resolveLayer(e, ctx);
    const color = this.resolveColor(e, layer, ctx);
    const m = ctx.matrix;

    switch (e.type) {
      case 'LINE': {
        const pts = [e.a.x, e.a.y, e.b.x, e.b.y];
        transformFlat(m, pts);
        this.addPath(layer, color, pts, false, false);
        break;
      }
      case 'CIRCLE': {
        if (!(e.radius > 0)) break;
        const pts = circlePoints(e.center.x, e.center.y, e.radius);
        transformFlat(multiply(m, ocsMatrix(e.extrusion.x, e.extrusion.y, e.extrusion.z)), pts);
        this.addPath(layer, color, pts, true, false);
        break;
      }
      case 'ARC': {
        if (!(e.radius > 0)) break;
        const pts = arcPoints(e.center.x, e.center.y, e.radius, e.startAngle, e.endAngle);
        transformFlat(multiply(m, ocsMatrix(e.extrusion.x, e.extrusion.y, e.extrusion.z)), pts);
        this.addPath(layer, color, pts, false, false);
        break;
      }
      case 'ELLIPSE': {
        const minorSign = e.extrusion.z < 0 ? -1 : 1;
        const result = ellipsePoints(
          e.center.x,
          e.center.y,
          e.majorAxis.x,
          e.majorAxis.y,
          e.ratio,
          e.startParam,
          e.endParam,
          minorSign,
        );
        transformFlat(m, result.points);
        this.addPath(layer, color, result.points, result.closed, false);
        break;
      }
      case 'POLYLINE': {
        const pts = polylinePoints(e.vertices, e.closed);
        transformFlat(multiply(m, ocsMatrix(e.extrusion.x, e.extrusion.y, e.extrusion.z)), pts);
        this.addPath(layer, color, pts, e.closed, false);
        break;
      }
      case 'POINT': {
        const [x, y] = applyToPoint(m, e.position.x, e.position.y);
        this.addPoint(layer, color, x, y);
        break;
      }
      case 'SOLID': {
        const pts = e.points.flatMap((p) => [p.x, p.y]);
        transformFlat(multiply(m, ocsMatrix(e.extrusion.x, e.extrusion.y, e.extrusion.z)), pts);
        this.addPath(layer, color, pts, true, e.filled);
        break;
      }
      case 'SPLINE': {
        const pts = splinePoints(e);
        transformFlat(m, pts);
        this.addPath(layer, color, pts, false, false);
        break;
      }
      case 'HATCH': {
        const hm = multiply(m, ocsMatrix(e.extrusion.x, e.extrusion.y, e.extrusion.z));
        const loops = e.loops.map((l) => {
          const p = [...l];
          transformFlat(hm, p);
          return p;
        });
        if (e.solid) this.addHatch(layer, color, loops);
        else {
          this.bump('HATCH(pattern)');
          for (const loop of loops) this.addPath(layer, color, loop, true, false);
        }
        break;
      }
      case 'TEXT':
        this.emitText(e, layer, color, ctx);
        break;
      case 'MTEXT':
        this.emitMText(e, layer, color, ctx);
        break;
    }
  }

  private emitText(e: TextEntity, layer: LayerInfo, color: number, ctx: Context): void {
    if (!e.text.trim() || !(e.height > 0)) return;
    const m = multiply(ctx.matrix, ocsMatrix(e.extrusion.x, e.extrusion.y, e.extrusion.z));

    // محاذاة 3 (aligned) و5 (fit) تبدأ من نقطة الإدراج؛ نقطة 11 فيهما هي النهاية فقط
    const aligned = [1, 2, 4].includes(e.hAlign) || e.vAlign !== 0;
    const anchor = aligned ? e.alignPoint : e.position;
    const [x, y] = applyToPoint(m, anchor.x, anchor.y);

    // 72: 0 يسار، 1 وسط، 2 يمين، 3 محاذاة، 4 منتصف، 5 ملاءمة
    let hAlign: HAlign = 'left';
    if (e.hAlign === 1 || e.hAlign === 4) hAlign = 'center';
    else if (e.hAlign === 2) hAlign = 'right';
    // 73: 0 خط الأساس، 1 أسفل، 2 منتصف، 3 أعلى
    let vAlign: VAlign = 'baseline';
    if (e.vAlign === 1) vAlign = 'bottom';
    else if (e.vAlign === 2 || e.hAlign === 4) vAlign = 'middle';
    else if (e.vAlign === 3) vAlign = 'top';

    this.addText({
      layer: layer.name,
      color,
      x,
      y,
      height: e.height * uniformScaleOf(m),
      rotation: e.rotation * DEG + rotationOf(m),
      lines: [e.text],
      hAlign,
      vAlign,
      widthFactor: e.widthFactor,
    });
  }

  private emitMText(e: MTextEntity, layer: LayerInfo, color: number, ctx: Context): void {
    const lines = cleanMText(e.text).split('\n');
    if (lines.every((l) => !l.trim()) || !(e.height > 0)) return;
    const m = multiply(ctx.matrix, ocsMatrix(e.extrusion.x, e.extrusion.y, e.extrusion.z));
    const [x, y] = applyToPoint(m, e.position.x, e.position.y);

    const column = (e.attachment - 1) % 3;
    const row = Math.floor((e.attachment - 1) / 3);
    const hAlign: HAlign = column === 1 ? 'center' : column === 2 ? 'right' : 'left';
    const vAlign: VAlign = row === 1 ? 'middle' : row === 2 ? 'bottom' : 'top';

    this.addText({
      layer: layer.name,
      color,
      x,
      y,
      height: e.height * uniformScaleOf(m),
      rotation: e.rotation * DEG + rotationOf(m),
      lines,
      hAlign,
      vAlign,
      widthFactor: 1,
    });
  }

  private emitInsert(e: InsertEntity, ctx: Context): void {
    if (ctx.depth >= MAX_INSERT_DEPTH) {
      this.bump('INSERT(depth)');
      return;
    }
    const block = this.doc.blocks.get(e.block) ?? this.blocksByUpper.get(e.block.toUpperCase());
    if (!block) {
      this.bump('INSERT(missing block)');
      return;
    }
    if (this.blockStack.has(block.name)) {
      this.bump('INSERT(cycle)');
      return;
    }
    const layer = this.resolveLayer(e, ctx);
    const color = this.resolveColor(e, layer, ctx);
    const ocs = ocsMatrix(e.extrusion.x, e.extrusion.y, e.extrusion.z);
    const angle = e.rotation * DEG;

    let columns = Math.max(1, e.columns);
    let rows = Math.max(1, e.rows);
    if (columns * rows > MAX_ARRAY_INSTANCES) {
      this.bump('INSERT(array too large)');
      columns = Math.min(columns, MAX_ARRAY_INSTANCES);
      rows = Math.max(1, Math.floor(MAX_ARRAY_INSTANCES / columns));
    }

    const toBase = translation(-block.basePoint.x, -block.basePoint.y);
    const scale = scaling(e.scale.x, e.scale.y);
    const place = multiply(translation(e.position.x, e.position.y), rotation(angle));

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < columns; c++) {
        if (this.truncated) return;
        if (++this.expansions > MAX_INSERT_EXPANSIONS) {
          this.truncated = true;
          return;
        }
        const offset = translation(c * e.columnSpacing, r * e.rowSpacing);
        const local = multiply(place, multiply(offset, multiply(scale, toBase)));
        this.blockStack.add(block.name);
        this.emitAll(block.entities, {
          matrix: multiply(ctx.matrix, multiply(ocs, local)),
          insertLayer: layer.name,
          blockColor: color,
          depth: ctx.depth + 1,
          chain: ctx.chain.includes(layer.name) ? ctx.chain : [...ctx.chain, layer.name],
        });
        this.blockStack.delete(block.name);
      }
    }
  }
}

/** يحوّل مستند DXF إلى مشهد مسطّح جاهز للرسم (الكتل محلولة والألوان محسومة). */
export function buildScene(doc: DxfDocument, options: BuildOptions = {}): Scene {
  return new SceneBuilder(doc, options).build();
}
