export interface Vec2 {
  x: number;
  y: number;
}

export interface Vec3 extends Vec2 {
  z: number;
}

/** رقم اللون: 0 = BYBLOCK، 256 = BYLAYER، 1–255 = جدول ACI. */
export const BYBLOCK = 0;
export const BYLAYER = 256;

interface EntityBase {
  /** اسم الطبقة كما ورد في الملف. */
  layer: string;
  /** لون ACI للكيان (62). */
  aci: number;
  /** لون حقيقي 24-بت (420) إن وُجد. */
  trueColor?: number;
}

export interface LineEntity extends EntityBase {
  type: 'LINE';
  a: Vec2;
  b: Vec2;
}

export interface CircleEntity extends EntityBase {
  type: 'CIRCLE';
  center: Vec2;
  radius: number;
  extrusion: Vec3;
}

export interface ArcEntity extends EntityBase {
  type: 'ARC';
  center: Vec2;
  radius: number;
  /** بالدرجات. */
  startAngle: number;
  endAngle: number;
  extrusion: Vec3;
}

export interface EllipseEntity extends EntityBase {
  type: 'ELLIPSE';
  center: Vec2;
  /** نهاية المحور الرئيسي نسبةً إلى المركز. */
  majorAxis: Vec2;
  ratio: number;
  /** معاملات البداية والنهاية بالراديان. */
  startParam: number;
  endParam: number;
  extrusion: Vec3;
}

export interface PolylineVertexData {
  x: number;
  y: number;
  bulge: number;
}

/** يغطي LWPOLYLINE و POLYLINE ثنائي/ثلاثي الأبعاد. */
export interface PolylineEntity extends EntityBase {
  type: 'POLYLINE';
  vertices: PolylineVertexData[];
  closed: boolean;
  extrusion: Vec3;
}

export interface PointEntity extends EntityBase {
  type: 'POINT';
  position: Vec2;
}

export interface TextEntity extends EntityBase {
  type: 'TEXT';
  position: Vec2;
  alignPoint: Vec2;
  height: number;
  text: string;
  /** بالدرجات. */
  rotation: number;
  widthFactor: number;
  /** 72: 0 يسار، 1 وسط، 2 يمين، 3 محاذاة، 4 منتصف، 5 ملاءمة. */
  hAlign: number;
  /** 73: 0 خط الأساس، 1 أسفل، 2 منتصف، 3 أعلى. */
  vAlign: number;
  extrusion: Vec3;
}

export interface MTextEntity extends EntityBase {
  type: 'MTEXT';
  position: Vec2;
  height: number;
  /** النص الخام بتنسيق MTEXT. */
  text: string;
  /** بالدرجات. */
  rotation: number;
  /** 1–9: صف علوي/أوسط/سفلي × عمود أيسر/أوسط/أيمن. */
  attachment: number;
  extrusion: Vec3;
}

/** مضلع مملوء (SOLID/TRACE) أو إطار وجه ثلاثي الأبعاد (3DFACE)، النقاط بترتيب الرسم. */
export interface SolidEntity extends EntityBase {
  type: 'SOLID';
  points: Vec2[];
  filled: boolean;
  extrusion: Vec3;
}

export interface SplineEntity extends EntityBase {
  type: 'SPLINE';
  degree: number;
  knots: number[];
  controlPoints: Vec2[];
  weights: number[];
  fitPoints: Vec2[];
}

export interface InsertEntity extends EntityBase {
  type: 'INSERT';
  block: string;
  position: Vec2;
  scale: Vec2;
  /** بالدرجات. */
  rotation: number;
  columns: number;
  rows: number;
  columnSpacing: number;
  rowSpacing: number;
  extrusion: Vec3;
}

export type DxfEntity =
  | LineEntity
  | CircleEntity
  | ArcEntity
  | EllipseEntity
  | PolylineEntity
  | PointEntity
  | TextEntity
  | MTextEntity
  | SolidEntity
  | SplineEntity
  | InsertEntity;

export interface DxfLayer {
  name: string;
  /** لون ACI للطبقة (موجب دائمًا). */
  aci: number;
  trueColor?: number;
  /** الطبقة مطفأة (لون سالب). */
  off: boolean;
  /** الطبقة مجمّدة. */
  frozen: boolean;
}

export interface DxfBlock {
  name: string;
  basePoint: Vec2;
  entities: DxfEntity[];
}

export interface DxfDocument {
  /** قيمة $ACADVER مثل AC1027، إن وُجدت. */
  version?: string;
  layers: DxfLayer[];
  blocks: Map<string, DxfBlock>;
  entities: DxfEntity[];
  /** عدد الكيانات غير المدعومة حسب نوعها (HATCH مثلًا). */
  unsupported: Record<string, number>;
}
