export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

/** خطوة التقسيم القصوى: درجتان (180 قطعة لدائرة كاملة). */
const MAX_STEP = Math.PI / 90;

/** عدد القطع المناسب لقوس بالزاوية المعطاة (راديان). */
export function segmentsForSweep(sweep: number): number {
  return Math.min(256, Math.max(4, Math.ceil(Math.abs(sweep) / MAX_STEP)));
}

/** دائرة كاملة: نقاط بدون تكرار النقطة الأولى (المسار مغلق). */
export function circlePoints(cx: number, cy: number, radius: number): number[] {
  const n = segmentsForSweep(TAU);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = (TAU * i) / n;
    out.push(cx + radius * Math.cos(a), cy + radius * Math.sin(a));
  }
  return out;
}

/** قوس يعاكس عقارب الساعة من startDeg إلى endDeg (بالدرجات). */
export function arcPoints(
  cx: number,
  cy: number,
  radius: number,
  startDeg: number,
  endDeg: number,
): number[] {
  let sweepDeg = (((endDeg - startDeg) % 360) + 360) % 360;
  if (sweepDeg < 1e-9) sweepDeg = 360;
  const start = startDeg * DEG;
  const sweep = sweepDeg * DEG;
  const n = segmentsForSweep(sweep);
  const out: number[] = [];
  for (let i = 0; i <= n; i++) {
    const a = start + (sweep * i) / n;
    out.push(cx + radius * Math.cos(a), cy + radius * Math.sin(a));
  }
  return out;
}

/**
 * يضيف النقاط الوسيطة (دون طرفَي القطعة) لقطعة مقوّسة بين (x1,y1) و(x2,y2).
 * bulge = tan(θ/4): موجب = عكس عقارب الساعة، سالب = مع عقارب الساعة.
 */
export function bulgeInterior(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  bulge: number,
  out: number[],
): void {
  if (!bulge || !Number.isFinite(bulge)) return;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const chord = Math.hypot(dx, dy);
  if (chord < 1e-12) return;

  const theta = 4 * Math.atan(bulge);
  const offset = chord / 2 / Math.tan(theta / 2);
  const cx = (x1 + x2) / 2 + (-dy / chord) * offset;
  const cy = (y1 + y2) / 2 + (dx / chord) * offset;
  const radius = Math.hypot(x1 - cx, y1 - cy);
  const a0 = Math.atan2(y1 - cy, x1 - cx);
  const n = segmentsForSweep(theta);
  for (let i = 1; i < n; i++) {
    const a = a0 + (theta * i) / n;
    out.push(cx + radius * Math.cos(a), cy + radius * Math.sin(a));
  }
}

export interface PolylineVertex {
  x: number;
  y: number;
  bulge: number;
}

/** يحوّل رؤوس بوليلاين (مع bulge) إلى نقاط مسطحة. المسار المغلق لا يكرّر الرأس الأول. */
export function polylinePoints(vertices: readonly PolylineVertex[], closed: boolean): number[] {
  const out: number[] = [];
  const count = vertices.length;
  for (let i = 0; i < count; i++) {
    const v = vertices[i] as PolylineVertex;
    out.push(v.x, v.y);
    const isLast = i === count - 1;
    if (isLast && !closed) break;
    const next = vertices[isLast ? 0 : i + 1] as PolylineVertex;
    bulgeInterior(v.x, v.y, next.x, next.y, v.bulge, out);
  }
  return out;
}

export interface EllipseResult {
  points: number[];
  closed: boolean;
}

/**
 * قطع ناقص. (mx,my) محور رئيسي نسبي للمركز، ratio نسبة المحور الصغير،
 * start/end معاملات بالراديان. minorSign = -1 عندما يكون اتجاه البثق سالبًا.
 */
export function ellipsePoints(
  cx: number,
  cy: number,
  mx: number,
  my: number,
  ratio: number,
  startParam: number,
  endParam: number,
  minorSign = 1,
): EllipseResult {
  const nx = -my * ratio * minorSign;
  const ny = mx * ratio * minorSign;
  let end = endParam;
  if (end <= startParam) end += TAU;
  const sweep = end - startParam;
  const closed = sweep >= TAU - 1e-6;
  const n = segmentsForSweep(sweep);
  const count = closed ? n : n + 1;
  const points: number[] = [];
  for (let i = 0; i < count; i++) {
    const t = startParam + (sweep * i) / n;
    const c = Math.cos(t);
    const s = Math.sin(t);
    points.push(cx + mx * c + nx * s, cy + my * c + ny * s);
  }
  return { points, closed };
}
