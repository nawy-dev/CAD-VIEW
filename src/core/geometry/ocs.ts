import { IDENTITY, type Matrix } from './matrix';

/**
 * مصفوفة الانتقال من نظام الإحداثيات الكائني (OCS) إلى العالمي (WCS) مسقطة على المستوى XY،
 * حسب خوارزمية المحور الاعتباري (Arbitrary Axis Algorithm) في مواصفات DXF.
 * مثال: اتجاه البثق (0,0,-1) يعكس المحور السيني.
 */
export function ocsMatrix(nx: number, ny: number, nz: number): Matrix {
  const length = Math.hypot(nx, ny, nz);
  if (!(length > 1e-12)) return IDENTITY;
  const x = nx / length;
  const y = ny / length;
  const z = nz / length;
  if (Math.abs(x) < 1e-9 && Math.abs(y) < 1e-9 && z > 0) return IDENTITY;

  // Ax = Wy × N  عندما يكون N قريبًا من المحور Z، وإلا Wz × N
  let ax: number;
  let ay: number;
  let az: number;
  if (Math.abs(x) < 1 / 64 && Math.abs(y) < 1 / 64) {
    ax = z;
    ay = 0;
    az = -x;
  } else {
    ax = -y;
    ay = x;
    az = 0;
  }
  const aLength = Math.hypot(ax, ay, az);
  ax /= aLength;
  ay /= aLength;
  az /= aLength;

  // Ay = N × Ax
  const byx = y * az - z * ay;
  const byy = z * ax - x * az;

  return [ax, ay, byx, byy, 0, 0];
}
