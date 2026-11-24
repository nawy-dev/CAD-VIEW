export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function emptyBounds(): Bounds {
  return { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
}

export function isEmptyBounds(b: Bounds): boolean {
  return !(b.minX <= b.maxX && b.minY <= b.maxY);
}

/** يوسّع الحدود لتشمل النقطة (تعديل في المكان). */
export function extendBounds(b: Bounds, x: number, y: number): void {
  if (x < b.minX) b.minX = x;
  if (x > b.maxX) b.maxX = x;
  if (y < b.minY) b.minY = y;
  if (y > b.maxY) b.maxY = y;
}

export function boundsOfFlat(points: ArrayLike<number>): Bounds {
  const b = emptyBounds();
  for (let i = 0; i + 1 < points.length; i += 2) {
    extendBounds(b, points[i] as number, points[i + 1] as number);
  }
  return b;
}

export function intersects(a: Bounds, b: Bounds): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}
