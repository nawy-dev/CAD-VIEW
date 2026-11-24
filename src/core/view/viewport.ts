import { isEmptyBounds, type Bounds } from '../geometry/bounds';

/**
 * حالة العرض: x_شاشة = x_عالم · scale + tx ، y_شاشة = ty − y_عالم · scale
 * (محور Y مقلوب لأن الشاشة تنمو للأسفل).
 */
export interface View {
  scale: number;
  tx: number;
  ty: number;
}

export interface ZoomLimits {
  min: number;
  max: number;
}

export const DEFAULT_LIMITS: ZoomLimits = { min: 1e-9, max: 1e9 };

export function clampScale(scale: number, limits: ZoomLimits): number {
  return Math.min(limits.max, Math.max(limits.min, scale));
}

/** حدود التكبير نسبةً إلى مقياس "ملاءمة الشاشة": تصغير حتى 5% وتكبير حتى 100 ألف ضعف. */
export function limitsFor(fitScale: number): ZoomLimits {
  return { min: fitScale * 0.05, max: fitScale * 100_000 };
}

export function worldToScreen(v: View, x: number, y: number): [number, number] {
  return [x * v.scale + v.tx, v.ty - y * v.scale];
}

export function screenToWorld(v: View, sx: number, sy: number): [number, number] {
  return [(sx - v.tx) / v.scale, (v.ty - sy) / v.scale];
}

/** تكبير/تصغير مع إبقاء نقطة الشاشة (sx, sy) ثابتة فوق نفس النقطة من الرسم. */
export function zoomAt(
  v: View,
  sx: number,
  sy: number,
  factor: number,
  limits: ZoomLimits = DEFAULT_LIMITS,
): View {
  const scale = clampScale(v.scale * factor, limits);
  const [wx, wy] = screenToWorld(v, sx, sy);
  return { scale, tx: sx - wx * scale, ty: sy + wy * scale };
}

export function panBy(v: View, dx: number, dy: number): View {
  return { scale: v.scale, tx: v.tx + dx, ty: v.ty + dy };
}

/** يلائم الحدود داخل منطقة العرض مع هامش نسبي، ويوسّطها. */
export function fitBounds(bounds: Bounds, width: number, height: number, padding = 0.06): View {
  if (isEmptyBounds(bounds) || width <= 0 || height <= 0) {
    return { scale: 1, tx: width / 2, ty: height / 2 };
  }
  const w = bounds.maxX - bounds.minX;
  const h = bounds.maxY - bounds.minY;
  const availW = width * (1 - padding * 2);
  const availH = height * (1 - padding * 2);
  let scale: number;
  if (w <= 0 && h <= 0) scale = 1;
  else if (w <= 0) scale = availH / h;
  else if (h <= 0) scale = availW / w;
  else scale = Math.min(availW / w, availH / h);

  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  return { scale, tx: width / 2 - cx * scale, ty: height / 2 + cy * scale };
}

/** المستطيل المرئي بإحداثيات الرسم. */
export function visibleWorldRect(v: View, width: number, height: number): Bounds {
  const [minX, maxY] = screenToWorld(v, 0, 0);
  const [maxX, minY] = screenToWorld(v, width, height);
  return { minX, minY, maxX, maxY };
}

export interface Point {
  x: number;
  y: number;
}

/**
 * قرص بإصبعين: يحسب العرض الجديد من العرض عند بداية الإيماءة،
 * فتبقى النقطة التي كانت تحت منتصف الإصبعين تحت منتصفهما الجديد (تكبير + تحريك).
 */
export function pinchView(
  start: View,
  startMid: Point,
  startDistance: number,
  mid: Point,
  distance: number,
  limits: ZoomLimits = DEFAULT_LIMITS,
): View {
  const ratio = startDistance > 0 ? distance / startDistance : 1;
  const scale = clampScale(start.scale * ratio, limits);
  const [wx, wy] = screenToWorld(start, startMid.x, startMid.y);
  return { scale, tx: mid.x - wx * scale, ty: mid.y + wy * scale };
}
