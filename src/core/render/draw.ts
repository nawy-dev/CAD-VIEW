import type { Bounds } from '../geometry/bounds';
import type { Scene, TextPrim } from '../scene/scene';
import { visibleWorldRect, type View } from '../view/viewport';
import { colorToCss, type Theme } from './aci';

export interface DrawOptions {
  /** أبعاد منطقة الرسم بوحدات CSS. */
  width: number;
  height: number;
  /** نسبة بكسلات الجهاز (devicePixelRatio). */
  dpr: number;
  theme: Theme;
  background: string;
  hiddenLayers: ReadonlySet<string>;
  /** أثناء اللمس/السحب: تخطّي النصوص لسرعة أعلى. */
  interactive?: boolean;
}

/** أصغر ارتفاع نص (بكسل) يستحق الرسم. */
const MIN_TEXT_PX = 4;
/** حد أقصى للنصوص المرسومة في الإطار الواحد. */
const MAX_TEXTS_PER_FRAME = 4000;
/** المسارات الأصغر من هذا (بكسل) لا تُرى فنتخطاها. */
const MIN_PATH_PX = 0.25;

function overlaps(rect: Bounds, minX: number, minY: number, maxX: number, maxY: number): boolean {
  return minX <= rect.maxX && maxX >= rect.minX && minY <= rect.maxY && maxY >= rect.minY;
}

function tracePath(
  ctx: CanvasRenderingContext2D,
  pts: Float64Array,
  closed: boolean,
  scale: number,
  tx: number,
  ty: number,
): void {
  ctx.moveTo((pts[0] as number) * scale + tx, ty - (pts[1] as number) * scale);
  for (let i = 2; i + 1 < pts.length; i += 2) {
    ctx.lineTo((pts[i] as number) * scale + tx, ty - (pts[i + 1] as number) * scale);
  }
  if (closed) ctx.closePath();
}

function drawText(ctx: CanvasRenderingContext2D, t: TextPrim, view: View, px: number): void {
  const sx = t.x * view.scale + view.tx;
  const sy = view.ty - t.y * view.scale;
  const lineHeight = px * 1.4;
  const count = t.lines.length;

  // موضع السطر الأول بالنسبة للمرساة
  let firstBaseline: number;
  if (t.vAlign === 'top') firstBaseline = px;
  else if (t.vAlign === 'middle') firstBaseline = px - ((count - 1) * lineHeight + px) / 2;
  else if (t.vAlign === 'bottom') firstBaseline = -(count - 1) * lineHeight;
  else firstBaseline = 0;

  ctx.save();
  ctx.translate(sx, sy);
  if (t.rotation !== 0) ctx.rotate(-t.rotation);
  if (t.widthFactor !== 1) ctx.scale(t.widthFactor, 1);
  ctx.textAlign = t.hAlign;
  ctx.textBaseline = 'alphabetic';
  for (let i = 0; i < count; i++) {
    ctx.fillText(t.lines[i] as string, 0, firstBaseline + i * lineHeight);
  }
  ctx.restore();
}

/** يرسم المشهد على Canvas. الإحداثيات تُحوَّل يدويًا لإبقاء سماكة الخط ثابتة (1 بكسل). */
export function drawScene(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  view: View,
  options: DrawOptions,
): void {
  const { width, height, dpr, theme, hiddenLayers } = options;
  const { scale, tx, ty } = view;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = options.background;
  ctx.fillRect(0, 0, width, height);

  const rect = visibleWorldRect(view, width, height);
  const minWorldSize = MIN_PATH_PX / scale;

  ctx.lineWidth = 1;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  for (const batch of scene.batches) {
    if (hiddenLayers.has(batch.layer)) continue;
    const css = colorToCss(batch.color, theme);

    if (batch.fills.length > 0) {
      ctx.fillStyle = css;
      ctx.beginPath();
      for (const p of batch.fills) {
        if (!overlaps(rect, p.minX, p.minY, p.maxX, p.maxY)) continue;
        tracePath(ctx, p.pts, true, scale, tx, ty);
      }
      ctx.fill();
    }

    if (batch.paths.length > 0 || batch.fills.length > 0) {
      ctx.strokeStyle = css;
      ctx.beginPath();
      for (const p of batch.paths) {
        if (!overlaps(rect, p.minX, p.minY, p.maxX, p.maxY)) continue;
        if (p.maxX - p.minX < minWorldSize && p.maxY - p.minY < minWorldSize) continue;
        tracePath(ctx, p.pts, p.closed, scale, tx, ty);
      }
      for (const p of batch.fills) {
        if (!overlaps(rect, p.minX, p.minY, p.maxX, p.maxY)) continue;
        tracePath(ctx, p.pts, true, scale, tx, ty);
      }
      ctx.stroke();
    }

    if (batch.points.length > 0) {
      ctx.fillStyle = css;
      for (let i = 0; i + 1 < batch.points.length; i += 2) {
        const x = batch.points[i] as number;
        const y = batch.points[i + 1] as number;
        if (x < rect.minX || x > rect.maxX || y < rect.minY || y > rect.maxY) continue;
        ctx.fillRect(x * scale + tx - 1.5, ty - y * scale - 1.5, 3, 3);
      }
    }
  }

  if (options.interactive || scene.texts.length === 0) return;

  ctx.direction = 'ltr';
  let drawn = 0;
  let currentColor = '';
  for (const t of scene.texts) {
    if (hiddenLayers.has(t.layer)) continue;
    const px = t.height * scale;
    if (px < MIN_TEXT_PX) continue;
    // استبعاد النصوص البعيدة عن المنطقة المرئية (بهامش بحجم النص)
    const margin = t.height * (t.lines.length + 2) * 4;
    if (!overlaps(rect, t.x - margin, t.y - margin, t.x + margin, t.y + margin)) continue;

    const css = colorToCss(t.color, theme);
    if (css !== currentColor) {
      ctx.fillStyle = css;
      currentColor = css;
    }
    ctx.font = `${px.toFixed(1)}px system-ui, "Segoe UI", Tahoma, sans-serif`;
    drawText(ctx, t, view, px);
    if (++drawn >= MAX_TEXTS_PER_FRAME) break;
  }
}
