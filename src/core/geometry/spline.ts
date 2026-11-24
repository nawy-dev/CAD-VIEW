export interface Point2 {
  x: number;
  y: number;
}

export interface SplineData {
  degree: number;
  knots: number[];
  controlPoints: Point2[];
  weights: number[];
  fitPoints: Point2[];
}

/** متجه عقد منتظم مشدود الأطراف (clamped uniform) لـ n نقطة تحكم ودرجة p. */
export function clampedUniformKnots(n: number, p: number): number[] {
  const knots: number[] = [];
  for (let i = 0; i < p + 1; i++) knots.push(0);
  for (let i = 1; i < n - p; i++) knots.push(i);
  for (let i = 0; i < p + 1; i++) knots.push(n - p);
  return knots;
}

function findSpan(lastIndex: number, p: number, u: number, knots: number[]): number {
  if (u >= (knots[lastIndex + 1] as number)) return lastIndex;
  if (u <= (knots[p] as number)) return p;
  let low = p;
  let high = lastIndex + 1;
  let mid = (low + high) >> 1;
  while (u < (knots[mid] as number) || u >= (knots[mid + 1] as number)) {
    if (u < (knots[mid] as number)) high = mid;
    else low = mid;
    mid = (low + high) >> 1;
  }
  return mid;
}

function basisFunctions(span: number, u: number, p: number, knots: number[]): number[] {
  const basis: number[] = [1];
  const left: number[] = [];
  const right: number[] = [];
  for (let j = 1; j <= p; j++) {
    left[j] = u - (knots[span + 1 - j] as number);
    right[j] = (knots[span + j] as number) - u;
    let saved = 0;
    for (let r = 0; r < j; r++) {
      const denominator = (right[r + 1] as number) + (left[j - r] as number);
      const temp = denominator === 0 ? 0 : (basis[r] as number) / denominator;
      basis[r] = saved + (right[r + 1] as number) * temp;
      saved = (left[j - r] as number) * temp;
    }
    basis[j] = saved;
  }
  return basis;
}

function evaluateNurbs(s: SplineData, knots: number[]): number[] {
  const n = s.controlPoints.length;
  const p = s.degree;
  const weights = s.weights.length === n ? s.weights : s.controlPoints.map(() => 1);
  const start = knots[p] as number;
  const end = knots[n] as number;
  const samples = Math.min(2000, Math.max(32, n * 10));
  const out: number[] = [];
  for (let k = 0; k <= samples; k++) {
    const u = start + ((end - start) * k) / samples;
    const span = findSpan(n - 1, p, u, knots);
    const basis = basisFunctions(span, u, p, knots);
    let x = 0;
    let y = 0;
    let w = 0;
    for (let j = 0; j <= p; j++) {
      const index = span - p + j;
      const cp = s.controlPoints[index];
      if (!cp) continue;
      const weighted = (basis[j] as number) * (weights[index] as number);
      x += weighted * cp.x;
      y += weighted * cp.y;
      w += weighted;
    }
    if (w !== 0) out.push(x / w, y / w);
  }
  return out;
}

/** منحنى Catmull-Rom منتظم يمر بنقاط الملاءمة (تقريب عندما لا توجد نقاط تحكم). */
function catmullRom(points: Point2[]): number[] {
  const out: number[] = [];
  const last = points.length - 1;
  const steps = 8;
  for (let i = 0; i < last; i++) {
    const p0 = points[Math.max(i - 1, 0)] as Point2;
    const p1 = points[i] as Point2;
    const p2 = points[i + 1] as Point2;
    const p3 = points[Math.min(i + 2, last)] as Point2;
    for (let k = 0; k < steps; k++) {
      const t = k / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push(f(p0.x, p1.x, p2.x, p3.x), f(p0.y, p1.y, p2.y, p3.y));
    }
  }
  const tail = points[last] as Point2;
  out.push(tail.x, tail.y);
  return out;
}

/** يحوّل SPLINE إلى نقاط مسطحة. */
export function splinePoints(s: SplineData): number[] {
  const n = s.controlPoints.length;
  const p = s.degree;
  if (n >= 2 && p >= 1 && p < n) {
    const knots = s.knots.length === n + p + 1 ? s.knots : clampedUniformKnots(n, p);
    const points = evaluateNurbs(s, knots);
    if (points.length >= 4) return points;
  }
  if (s.fitPoints.length >= 2) return catmullRom(s.fitPoints);
  if (n >= 2) return s.controlPoints.flatMap((cp) => [cp.x, cp.y]);
  return [];
}
