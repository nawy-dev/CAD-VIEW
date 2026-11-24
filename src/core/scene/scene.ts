import type { Bounds } from '../geometry/bounds';

/** مسار مرسوم: نقاط مسطحة بإحداثيات عالمية. */
export interface PathPrim {
  pts: Float64Array;
  closed: boolean;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** مجموعة عناصر لها نفس الطبقة واللون، لتقليل استدعاءات الرسم. */
export interface Batch {
  layer: string;
  color: number;
  paths: PathPrim[];
  fills: PathPrim[];
  /** نقاط POINT مسطحة. */
  points: number[];
}

export type HAlign = 'left' | 'center' | 'right';
export type VAlign = 'top' | 'middle' | 'bottom' | 'baseline';

export interface TextPrim {
  layer: string;
  color: number;
  x: number;
  y: number;
  height: number;
  /** راديان، عكس عقارب الساعة. */
  rotation: number;
  lines: string[];
  hAlign: HAlign;
  vAlign: VAlign;
  widthFactor: number;
}

export interface LayerInfo {
  name: string;
  /** لون الطبقة بترميز المشهد (انظر aci.ts). */
  color: number;
  /** الطبقة مطفأة أو مجمّدة في الملف، فتبدأ مخفية. */
  hiddenByDefault: boolean;
  /** عدد العناصر المرسومة على الطبقة. */
  count: number;
}

export interface SceneStats {
  /** عدد المسارات والنقاط والنصوص. */
  primitives: number;
  /** تجاوز الحد الأقصى للعناصر فتوقف البناء. */
  truncated: boolean;
  unsupported: Record<string, number>;
}

export interface Scene {
  batches: Batch[];
  texts: TextPrim[];
  layers: LayerInfo[];
  /** حدود الرسم؛ فارغة (Infinity) إذا لم يوجد شيء مرسوم. */
  bounds: Bounds;
  stats: SceneStats;
}
