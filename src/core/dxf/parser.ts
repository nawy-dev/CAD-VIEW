import { TAU } from '../geometry/arc';
import { LoadError } from './errors';
import { cleanPlainText } from './text';
import { tokenize, type Tokens } from './tokenizer';
import {
  BYLAYER,
  type DxfBlock,
  type DxfDocument,
  type DxfEntity,
  type DxfLayer,
  type InsertEntity,
  type PolylineEntity,
  type Vec2,
  type Vec3,
} from './types';

/** سجل واحد: من رمز المجموعة 0 (نوع الكيان) حتى السجل التالي. */
interface Rec {
  type: string;
  /** فهرس زوج النوع (0, TYPE). */
  start: number;
  /** نهاية غير شاملة. */
  end: number;
}

interface Section {
  name: string;
  start: number;
  end: number;
}

interface Colored {
  layer: string;
  aci: number;
  trueColor?: number;
}

const num = (value: string): number => {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : 0;
};

const int = (value: string): number => Math.trunc(num(value));

function newExtrusion(): Vec3 {
  return { x: 0, y: 0, z: 1 };
}

function forEachPair(t: Tokens, r: Rec, fn: (code: number, value: string) => void): void {
  for (let i = r.start + 1; i < r.end; i++) fn(t.codes[i] as number, t.values[i] as string);
}

function readCommon(code: number, value: string, e: Colored): void {
  if (code === 8) {
    e.layer = value.trim() || '0';
  } else if (code === 62) {
    const aci = int(value);
    e.aci = aci < 0 || aci > 256 ? BYLAYER : aci;
  } else if (code === 420) {
    e.trueColor = int(value) & 0xffffff;
  }
}

function readExtrusion(code: number, value: string, ext: Vec3): void {
  if (code === 210) ext.x = num(value);
  else if (code === 220) ext.y = num(value);
  else if (code === 230) ext.z = num(value);
}

function splitRecords(t: Tokens, from: number, to: number): Rec[] {
  const records: Rec[] = [];
  let current: Rec | null = null;
  for (let i = from; i < to; i++) {
    if (t.codes[i] === 0) {
      if (current) current.end = i;
      current = { type: (t.values[i] as string).trim().toUpperCase(), start: i, end: to };
      records.push(current);
    }
  }
  return records;
}

function findSections(t: Tokens): Section[] {
  const sections: Section[] = [];
  let i = 0;
  while (i < t.length) {
    const isSection = t.codes[i] === 0 && (t.values[i] as string).trim().toUpperCase() === 'SECTION';
    if (isSection && t.codes[i + 1] === 2) {
      const name = (t.values[i + 1] as string).trim().toUpperCase();
      const start = i + 2;
      let end = start;
      while (
        end < t.length &&
        !(t.codes[end] === 0 && (t.values[end] as string).trim().toUpperCase() === 'ENDSEC')
      ) {
        end++;
      }
      sections.push({ name, start, end });
      i = end + 1;
    } else {
      i++;
    }
  }
  return sections;
}

// ───────────────────────── الكيانات ─────────────────────────

function parseLine(t: Tokens, r: Rec): DxfEntity {
  const e: Extract<DxfEntity, { type: 'LINE' }> = {
    type: 'LINE',
    layer: '0',
    aci: BYLAYER,
    a: { x: 0, y: 0 },
    b: { x: 0, y: 0 },
  };
  forEachPair(t, r, (code, v) => {
    if (code === 10) e.a.x = num(v);
    else if (code === 20) e.a.y = num(v);
    else if (code === 11) e.b.x = num(v);
    else if (code === 21) e.b.y = num(v);
    else readCommon(code, v, e);
  });
  return e;
}

function parseCircle(t: Tokens, r: Rec): DxfEntity {
  const e: Extract<DxfEntity, { type: 'CIRCLE' }> = {
    type: 'CIRCLE',
    layer: '0',
    aci: BYLAYER,
    center: { x: 0, y: 0 },
    radius: 0,
    extrusion: newExtrusion(),
  };
  forEachPair(t, r, (code, v) => {
    if (code === 10) e.center.x = num(v);
    else if (code === 20) e.center.y = num(v);
    else if (code === 40) e.radius = num(v);
    else if (code >= 210 && code <= 230) readExtrusion(code, v, e.extrusion);
    else readCommon(code, v, e);
  });
  return e;
}

function parseArc(t: Tokens, r: Rec): DxfEntity {
  const e: Extract<DxfEntity, { type: 'ARC' }> = {
    type: 'ARC',
    layer: '0',
    aci: BYLAYER,
    center: { x: 0, y: 0 },
    radius: 0,
    startAngle: 0,
    endAngle: 360,
    extrusion: newExtrusion(),
  };
  forEachPair(t, r, (code, v) => {
    if (code === 10) e.center.x = num(v);
    else if (code === 20) e.center.y = num(v);
    else if (code === 40) e.radius = num(v);
    else if (code === 50) e.startAngle = num(v);
    else if (code === 51) e.endAngle = num(v);
    else if (code >= 210 && code <= 230) readExtrusion(code, v, e.extrusion);
    else readCommon(code, v, e);
  });
  return e;
}

function parseEllipse(t: Tokens, r: Rec): DxfEntity {
  const e: Extract<DxfEntity, { type: 'ELLIPSE' }> = {
    type: 'ELLIPSE',
    layer: '0',
    aci: BYLAYER,
    center: { x: 0, y: 0 },
    majorAxis: { x: 1, y: 0 },
    ratio: 1,
    startParam: 0,
    endParam: TAU,
    extrusion: newExtrusion(),
  };
  forEachPair(t, r, (code, v) => {
    if (code === 10) e.center.x = num(v);
    else if (code === 20) e.center.y = num(v);
    else if (code === 11) e.majorAxis.x = num(v);
    else if (code === 21) e.majorAxis.y = num(v);
    else if (code === 40) e.ratio = num(v);
    else if (code === 41) e.startParam = num(v);
    else if (code === 42) e.endParam = num(v);
    else if (code >= 210 && code <= 230) readExtrusion(code, v, e.extrusion);
    else readCommon(code, v, e);
  });
  return e;
}

function parseLwPolyline(t: Tokens, r: Rec): DxfEntity {
  const e: PolylineEntity = {
    type: 'POLYLINE',
    layer: '0',
    aci: BYLAYER,
    vertices: [],
    closed: false,
    extrusion: newExtrusion(),
  };
  forEachPair(t, r, (code, v) => {
    if (code === 10) e.vertices.push({ x: num(v), y: 0, bulge: 0 });
    else if (code === 20) {
      const last = e.vertices[e.vertices.length - 1];
      if (last) last.y = num(v);
    } else if (code === 42) {
      const last = e.vertices[e.vertices.length - 1];
      if (last) last.bulge = num(v);
    } else if (code === 70) e.closed = (int(v) & 1) === 1;
    else if (code >= 210 && code <= 230) readExtrusion(code, v, e.extrusion);
    else readCommon(code, v, e);
  });
  return e;
}

/** POLYLINE القديم مع VERTEX التابعة له. يعيد الفهرس التالي بعد SEQEND. */
function parsePolyline(
  t: Tokens,
  records: Rec[],
  index: number,
  unsupported: Record<string, number>,
): { entity: DxfEntity | null; next: number } {
  const header = records[index] as Rec;
  const e: PolylineEntity = {
    type: 'POLYLINE',
    layer: '0',
    aci: BYLAYER,
    vertices: [],
    closed: false,
    extrusion: newExtrusion(),
  };
  let flags = 0;
  forEachPair(t, header, (code, v) => {
    if (code === 70) flags = int(v);
    else if (code >= 210 && code <= 230) readExtrusion(code, v, e.extrusion);
    else readCommon(code, v, e);
  });
  e.closed = (flags & 1) === 1;

  let j = index + 1;
  while (j < records.length && (records[j] as Rec).type === 'VERTEX') {
    let x = 0;
    let y = 0;
    let bulge = 0;
    let vertexFlags = 0;
    forEachPair(t, records[j] as Rec, (code, v) => {
      if (code === 10) x = num(v);
      else if (code === 20) y = num(v);
      else if (code === 42) bulge = num(v);
      else if (code === 70) vertexFlags = int(v);
    });
    // 16 = نقطة تحكم لمنحنى (ليست جزءًا من المسار)، و128 = وجه شبكة
    if ((vertexFlags & 16) === 0 && (vertexFlags & 128) === 0) e.vertices.push({ x, y, bulge });
    j++;
  }
  if (j < records.length && (records[j] as Rec).type === 'SEQEND') j++;

  // 16 = شبكة ثلاثية الأبعاد، 64 = شبكة وجوه
  if ((flags & 16) !== 0 || (flags & 64) !== 0) {
    unsupported['POLYLINE(MESH)'] = (unsupported['POLYLINE(MESH)'] ?? 0) + 1;
    return { entity: null, next: j };
  }
  return { entity: e, next: j };
}

function parsePoint(t: Tokens, r: Rec): DxfEntity {
  const e: Extract<DxfEntity, { type: 'POINT' }> = {
    type: 'POINT',
    layer: '0',
    aci: BYLAYER,
    position: { x: 0, y: 0 },
  };
  forEachPair(t, r, (code, v) => {
    if (code === 10) e.position.x = num(v);
    else if (code === 20) e.position.y = num(v);
    else readCommon(code, v, e);
  });
  return e;
}

function parseText(t: Tokens, r: Rec): DxfEntity {
  const e: Extract<DxfEntity, { type: 'TEXT' }> = {
    type: 'TEXT',
    layer: '0',
    aci: BYLAYER,
    position: { x: 0, y: 0 },
    alignPoint: { x: 0, y: 0 },
    height: 1,
    text: '',
    rotation: 0,
    widthFactor: 1,
    hAlign: 0,
    vAlign: 0,
    extrusion: newExtrusion(),
  };
  forEachPair(t, r, (code, v) => {
    if (code === 10) e.position.x = num(v);
    else if (code === 20) e.position.y = num(v);
    else if (code === 11) e.alignPoint.x = num(v);
    else if (code === 21) e.alignPoint.y = num(v);
    else if (code === 40) e.height = num(v);
    else if (code === 41) e.widthFactor = num(v) || 1;
    else if (code === 50) e.rotation = num(v);
    else if (code === 72) e.hAlign = int(v);
    else if (code === 73) e.vAlign = int(v);
    else if (code === 1) e.text = cleanPlainText(v);
    else if (code >= 210 && code <= 230) readExtrusion(code, v, e.extrusion);
    else readCommon(code, v, e);
  });
  // نقطة المحاذاة (11) صالحة فقط عندما تكون المحاذاة غير الافتراضية
  if (e.hAlign === 0 && e.vAlign === 0) e.alignPoint = { ...e.position };
  return e;
}

function parseMText(t: Tokens, r: Rec): DxfEntity {
  const e: Extract<DxfEntity, { type: 'MTEXT' }> = {
    type: 'MTEXT',
    layer: '0',
    aci: BYLAYER,
    position: { x: 0, y: 0 },
    height: 1,
    text: '',
    rotation: 0,
    attachment: 1,
    extrusion: newExtrusion(),
  };
  let chunks = '';
  let tail = '';
  let direction: Vec2 | null = null;
  let hasRotation = false;
  forEachPair(t, r, (code, v) => {
    if (code === 10) e.position.x = num(v);
    else if (code === 20) e.position.y = num(v);
    else if (code === 40) e.height = num(v);
    else if (code === 71) e.attachment = int(v);
    else if (code === 3) chunks += v;
    else if (code === 1) tail = v;
    else if (code === 50) {
      e.rotation = num(v);
      hasRotation = true;
    } else if (code === 11) direction = { x: num(v), y: direction?.y ?? 0 };
    else if (code === 21) direction = { x: direction?.x ?? 0, y: num(v) };
    else if (code >= 210 && code <= 230) readExtrusion(code, v, e.extrusion);
    else readCommon(code, v, e);
  });
  e.text = chunks + tail;
  if (!hasRotation && direction) {
    const d = direction as Vec2;
    e.rotation = (Math.atan2(d.y, d.x) * 180) / Math.PI;
  }
  return e;
}

/** SOLID/TRACE (مملوء) و3DFACE (إطار). */
function parseSolid(t: Tokens, r: Rec, filled: boolean): DxfEntity {
  const p: Vec2[] = [
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 0, y: 0 },
  ];
  const e: Extract<DxfEntity, { type: 'SOLID' }> = {
    type: 'SOLID',
    layer: '0',
    aci: BYLAYER,
    points: [],
    filled,
    extrusion: newExtrusion(),
  };
  let hasFourth = false;
  forEachPair(t, r, (code, v) => {
    if (code >= 10 && code <= 13) (p[code - 10] as Vec2).x = num(v);
    else if (code >= 20 && code <= 23) {
      (p[code - 20] as Vec2).y = num(v);
      if (code === 23) hasFourth = true;
    } else if (code >= 210 && code <= 230) readExtrusion(code, v, e.extrusion);
    else readCommon(code, v, e);
  });
  const [p0, p1, p2, p3] = p as [Vec2, Vec2, Vec2, Vec2];
  const same = (a: Vec2, b: Vec2) => a.x === b.x && a.y === b.y;
  if (!hasFourth || same(p2, p3)) {
    e.points = [p0, p1, p2];
  } else {
    // SOLID يخزّن الرأس الرابع قبل الثالث في ترتيب الرسم
    e.points = filled ? [p0, p1, p3, p2] : [p0, p1, p2, p3];
  }
  return e;
}

function parseSpline(t: Tokens, r: Rec): DxfEntity {
  const e: Extract<DxfEntity, { type: 'SPLINE' }> = {
    type: 'SPLINE',
    layer: '0',
    aci: BYLAYER,
    degree: 3,
    knots: [],
    controlPoints: [],
    weights: [],
    fitPoints: [],
  };
  forEachPair(t, r, (code, v) => {
    if (code === 71) e.degree = int(v);
    else if (code === 40) e.knots.push(num(v));
    else if (code === 41) e.weights.push(num(v));
    else if (code === 10) e.controlPoints.push({ x: num(v), y: 0 });
    else if (code === 20) {
      const last = e.controlPoints[e.controlPoints.length - 1];
      if (last) last.y = num(v);
    } else if (code === 11) e.fitPoints.push({ x: num(v), y: 0 });
    else if (code === 21) {
      const last = e.fitPoints[e.fitPoints.length - 1];
      if (last) last.y = num(v);
    } else readCommon(code, v, e);
  });
  return e;
}

function newInsert(block: string): InsertEntity {
  return {
    type: 'INSERT',
    layer: '0',
    aci: BYLAYER,
    block,
    position: { x: 0, y: 0 },
    scale: { x: 1, y: 1 },
    rotation: 0,
    columns: 1,
    rows: 1,
    columnSpacing: 0,
    rowSpacing: 0,
    extrusion: newExtrusion(),
  };
}

function parseInsert(t: Tokens, r: Rec): { entity: InsertEntity; attribsFollow: boolean } {
  const e = newInsert('');
  let attribsFollow = false;
  forEachPair(t, r, (code, v) => {
    if (code === 2) e.block = v.trim();
    else if (code === 10) e.position.x = num(v);
    else if (code === 20) e.position.y = num(v);
    else if (code === 41) e.scale.x = num(v) || 1;
    else if (code === 42) e.scale.y = num(v) || 1;
    else if (code === 50) e.rotation = num(v);
    else if (code === 70) e.columns = Math.max(1, int(v));
    else if (code === 71) e.rows = Math.max(1, int(v));
    else if (code === 44) e.columnSpacing = num(v);
    else if (code === 45) e.rowSpacing = num(v);
    else if (code === 66) attribsFollow = int(v) === 1;
    else if (code >= 210 && code <= 230) readExtrusion(code, v, e.extrusion);
    else readCommon(code, v, e);
  });
  return { entity: e, attribsFollow };
}

/** DIMENSION يرسم كتلته المجهولة (*D1...) فنعامله كـ INSERT بدون تحويل. */
function parseDimension(t: Tokens, r: Rec): InsertEntity {
  const e = newInsert('');
  forEachPair(t, r, (code, v) => {
    if (code === 2) e.block = v.trim();
    else readCommon(code, v, e);
  });
  return e;
}

function parseEntities(t: Tokens, records: Rec[], unsupported: Record<string, number>): DxfEntity[] {
  const out: DxfEntity[] = [];
  for (let i = 0; i < records.length; i++) {
    const r = records[i] as Rec;
    switch (r.type) {
      case 'LINE':
        out.push(parseLine(t, r));
        break;
      case 'CIRCLE':
        out.push(parseCircle(t, r));
        break;
      case 'ARC':
        out.push(parseArc(t, r));
        break;
      case 'ELLIPSE':
        out.push(parseEllipse(t, r));
        break;
      case 'LWPOLYLINE':
        out.push(parseLwPolyline(t, r));
        break;
      case 'POLYLINE': {
        const { entity, next } = parsePolyline(t, records, i, unsupported);
        if (entity) out.push(entity);
        i = next - 1;
        break;
      }
      case 'POINT':
        out.push(parsePoint(t, r));
        break;
      case 'TEXT':
        out.push(parseText(t, r));
        break;
      case 'MTEXT':
        out.push(parseMText(t, r));
        break;
      case 'SOLID':
      case 'TRACE':
        out.push(parseSolid(t, r, true));
        break;
      case '3DFACE':
        out.push(parseSolid(t, r, false));
        break;
      case 'SPLINE':
        out.push(parseSpline(t, r));
        break;
      case 'INSERT': {
        const { entity, attribsFollow } = parseInsert(t, r);
        out.push(entity);
        if (attribsFollow) {
          let j = i + 1;
          while (j < records.length && (records[j] as Rec).type === 'ATTRIB') j++;
          if (j < records.length && (records[j] as Rec).type === 'SEQEND') j++;
          i = j - 1;
        }
        break;
      }
      case 'DIMENSION': {
        const dim = parseDimension(t, r);
        if (dim.block) out.push(dim);
        else unsupported['DIMENSION'] = (unsupported['DIMENSION'] ?? 0) + 1;
        break;
      }
      case 'SEQEND':
      case 'VERTEX':
      case 'ATTRIB':
      case 'ATTDEF':
        break;
      default:
        unsupported[r.type] = (unsupported[r.type] ?? 0) + 1;
    }
  }
  return out;
}

// ───────────────────────── الأقسام ─────────────────────────

function parseHeader(t: Tokens, s: Section): string | undefined {
  for (let i = s.start; i + 1 < s.end; i++) {
    if (t.codes[i] === 9 && (t.values[i] as string).trim() === '$ACADVER') {
      return (t.values[i + 1] as string).trim();
    }
  }
  return undefined;
}

function parseLayers(t: Tokens, s: Section): DxfLayer[] {
  const layers: DxfLayer[] = [];
  for (const r of splitRecords(t, s.start, s.end)) {
    if (r.type !== 'LAYER') continue;
    const layer: DxfLayer = { name: '0', aci: 7, off: false, frozen: false };
    forEachPair(t, r, (code, v) => {
      if (code === 2) layer.name = v.trim();
      else if (code === 70) layer.frozen = (int(v) & 1) === 1;
      else if (code === 62) {
        const aci = int(v);
        if (aci < 0) layer.off = true;
        layer.aci = Math.min(255, Math.max(1, Math.abs(aci))) || 7;
      } else if (code === 420) layer.trueColor = int(v) & 0xffffff;
    });
    layers.push(layer);
  }
  return layers;
}

function parseBlocks(t: Tokens, s: Section, unsupported: Record<string, number>): Map<string, DxfBlock> {
  const blocks = new Map<string, DxfBlock>();
  const records = splitRecords(t, s.start, s.end);
  for (let i = 0; i < records.length; i++) {
    const r = records[i] as Rec;
    if (r.type !== 'BLOCK') continue;
    const block: DxfBlock = { name: '', basePoint: { x: 0, y: 0 }, entities: [] };
    forEachPair(t, r, (code, v) => {
      if (code === 2) block.name = v.trim();
      else if (code === 10) block.basePoint.x = num(v);
      else if (code === 20) block.basePoint.y = num(v);
    });
    const body: Rec[] = [];
    let j = i + 1;
    while (j < records.length && (records[j] as Rec).type !== 'ENDBLK') {
      body.push(records[j] as Rec);
      j++;
    }
    block.entities = parseEntities(t, body, unsupported);
    if (block.name) blocks.set(block.name, block);
    i = j;
  }
  return blocks;
}

/**
 * يحلّل نص DXF (صيغة نصية) إلى مستند: طبقات وكتل وكيانات.
 * يرمي LoadError عند عدم صلاحية الملف.
 */
export function parseDxf(text: string): DxfDocument {
  const t = tokenize(text);
  if (t.length === 0) {
    throw text.trim() === ''
      ? new LoadError('EMPTY', 'الملف فارغ')
      : new LoadError('NOT_DXF', 'الملف ليس بصيغة DXF');
  }

  const sections = findSections(t);
  if (sections.length === 0) {
    throw new LoadError('NOT_DXF', 'لا يحتوي الملف على أقسام DXF (SECTION)');
  }

  const doc: DxfDocument = { layers: [], blocks: new Map(), entities: [], unsupported: {} };
  for (const s of sections) {
    if (s.name === 'HEADER') {
      const version = parseHeader(t, s);
      if (version !== undefined) doc.version = version;
    } else if (s.name === 'TABLES') {
      doc.layers = parseLayers(t, s);
    } else if (s.name === 'BLOCKS') {
      doc.blocks = parseBlocks(t, s, doc.unsupported);
    } else if (s.name === 'ENTITIES') {
      doc.entities = parseEntities(t, splitRecords(t, s.start, s.end), doc.unsupported);
    }
  }
  return doc;
}
