import { arcPoints, ellipsePoints, DEG } from './arc';
import { splinePoints } from './spline';

/** حافة من حدود HATCH (إحداثيات OCS، والزوايا بالدرجات). */
export type HatchEdge =
  | { kind: 'line'; x1: number; y1: number; x2: number; y2: number }
  | { kind: 'arc'; cx: number; cy: number; r: number; start: number; end: number; ccw: boolean }
  | {
      kind: 'ellipse';
      cx: number;
      cy: number;
      mx: number;
      my: number;
      ratio: number;
      start: number;
      end: number;
      ccw: boolean;
    }
  | { kind: 'spline'; degree: number; knots: number[]; weights: number[]; control: Array<{ x: number; y: number }> };

function edgePoints(edge: HatchEdge): number[] {
  switch (edge.kind) {
    case 'line':
      return [edge.x1, edge.y1, edge.x2, edge.y2];
    case 'arc': {
      if (!(edge.r > 0)) return [];
      if (edge.ccw) return arcPoints(edge.cx, edge.cy, edge.r, edge.start, edge.end);
      return reversePoints(arcPoints(edge.cx, edge.cy, edge.r, edge.end, edge.start));
    }
    case 'ellipse': {
      if (!(edge.ratio > 0)) return [];
      const pts = ellipsePoints(edge.cx, edge.cy, edge.mx, edge.my, edge.ratio, edge.start * DEG, edge.end * DEG).points;
      return edge.ccw ? pts : reversePoints(ellipsePoints(edge.cx, edge.cy, edge.mx, edge.my, edge.ratio, edge.end * DEG, edge.start * DEG).points);
    }
    case 'spline':
      return splinePoints({
        degree: edge.degree,
        knots: edge.knots,
        weights: edge.weights,
        controlPoints: edge.control,
        fitPoints: [],
      });
  }
}

function reversePoints(pts: number[]): number[] {
  const out: number[] = [];
  for (let i = pts.length - 2; i >= 0; i -= 2) out.push(pts[i] as number, pts[i + 1] as number);
  return out;
}

const dist2 = (pts: number[], i: number, x: number, y: number): number =>
  ((pts[i] as number) - x) ** 2 + ((pts[i + 1] as number) - y) ** 2;

/**
 * يسلسل حواف حلقة واحدة في مسار مغلق مسطح. إن جاءت حافة معكوسة الاتجاه تُقلب
 * لتتصل بنهاية السابقة، ويُحذف الرأس المكرر عند كل وصلة.
 */
export function edgesToLoop(edges: readonly HatchEdge[]): number[] {
  const out: number[] = [];
  for (const edge of edges) {
    let pts = edgePoints(edge);
    if (pts.length < 4) continue;
    if (out.length >= 2) {
      const lastX = out[out.length - 2] as number;
      const lastY = out[out.length - 1] as number;
      if (dist2(pts, 0, lastX, lastY) > dist2(pts, pts.length - 2, lastX, lastY)) pts = reversePoints(pts);
      // أول نقطة تطابق آخر نقطة تقريبًا: نتجاوزها
      pts = dist2(pts, 0, lastX, lastY) < 1e-12 ? pts.slice(2) : pts;
    }
    for (const v of pts) out.push(v);
  }
  // الإغلاق ضمني: لا نكرّر النقطة الأولى في نهاية المسار
  if (out.length >= 6 && dist2(out, out.length - 2, out[0] as number, out[1] as number) < 1e-12) out.length -= 2;
  return out;
}

function pointInLoop(x: number, y: number, loop: readonly number[]): boolean {
  let inside = false;
  const n = loop.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = loop[2 * i] as number;
    const yi = loop[2 * i + 1] as number;
    const xj = loop[2 * j] as number;
    const yj = loop[2 * j + 1] as number;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const MAX_NESTING_LOOPS = 200;

/**
 * نمط الجزر (الرمز 75): 0 عادي (even-odd على كل الحلقات)، 1 خارجي (الخارجية وثقوبها المباشرة فقط)،
 * 2 تجاهل (الحلقات الخارجية فقط وتُملأ كاملة). العمق = عدد الحلقات الحاوية للحلقة.
 */
export function filterIslandStyle(loops: number[][], style: number): number[][] {
  if ((style !== 1 && style !== 2) || loops.length < 2 || loops.length > MAX_NESTING_LOOPS) return loops;
  const maxDepth = style === 1 ? 1 : 0;
  return loops.filter((loop, i) => {
    let depth = 0;
    for (let k = 0; k < loops.length; k++) {
      if (k !== i && pointInLoop(loop[0] as number, loop[1] as number, loops[k] as number[])) depth++;
    }
    return depth <= maxDepth;
  });
}
