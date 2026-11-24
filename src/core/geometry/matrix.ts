/**
 * مصفوفة تحويل ثنائية الأبعاد [a, b, c, d, e, f] بنفس ترتيب Canvas:
 *   x' = a·x + c·y + e
 *   y' = b·x + d·y + f
 */
export type Matrix = readonly [number, number, number, number, number, number];

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** m ∘ n : يطبّق n أولًا ثم m. */
export function multiply(m: Matrix, n: Matrix): Matrix {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

export function translation(tx: number, ty: number): Matrix {
  return [1, 0, 0, 1, tx, ty];
}

export function rotation(radians: number): Matrix {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return [cos, sin, -sin, cos, 0, 0];
}

export function scaling(sx: number, sy: number): Matrix {
  return [sx, 0, 0, sy, 0, 0];
}

export function applyToPoint(m: Matrix, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

/** يحوّل مصفوفة نقاط مسطحة [x0, y0, x1, y1, ...] في مكانها. */
export function transformFlat(m: Matrix, points: number[]): void {
  for (let i = 0; i + 1 < points.length; i += 2) {
    const x = points[i] as number;
    const y = points[i + 1] as number;
    points[i] = m[0] * x + m[2] * y + m[4];
    points[i + 1] = m[1] * x + m[3] * y + m[5];
  }
}

export function determinant(m: Matrix): number {
  return m[0] * m[3] - m[1] * m[2];
}

/** معامل التكبير المكافئ (جذر القيمة المطلقة للمحدد). */
export function uniformScaleOf(m: Matrix): number {
  return Math.sqrt(Math.abs(determinant(m)));
}

/** زاوية دوران المحور السيني بعد التحويل (راديان). */
export function rotationOf(m: Matrix): number {
  return Math.atan2(m[1], m[0]);
}
