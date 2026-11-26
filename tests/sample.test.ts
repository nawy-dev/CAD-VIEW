import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isEmptyBounds } from '../src/core/geometry/bounds';
import { buildScene } from '../src/core/scene/build';
import { loadDocument } from '../src/loader/loadFile';
import { toArrayBuffer } from './helpers';

const bytes = readFileSync(new URL('../public/samples/sample.dxf', import.meta.url));
const doc = loadDocument(toArrayBuffer(new Uint8Array(bytes)));
const scene = buildScene(doc);
const layer = (name: string) => scene.layers.find((l) => l.name === name);

describe('الملف التجريبي sample.dxf', () => {
  it('يُحمَّل بلا أخطاء ولا كيانات غير مدعومة', () => {
    expect(doc.version).toBe('AC1027');
    expect(doc.entities.length).toBeGreaterThanOrEqual(30);
    expect(doc.unsupported).toEqual({});
    expect(scene.stats.unsupported).toEqual({});
    expect(scene.stats.truncated).toBe(false);
  });

  it('طبقاته المتوقعة، والمجمّدة تبدأ مخفية', () => {
    const names = scene.layers.map((l) => l.name).sort();
    expect(names).toEqual(
      ['0', 'DIMENSIONS', 'DOORS', 'DRAFT', 'FURNITURE', 'GARDEN', 'TEXT', 'WALLS', 'WINDOWS'].sort(),
    );
    expect(layer('DRAFT')?.hiddenByDefault).toBe(true);
    expect(layer('WALLS')?.hiddenByDefault).toBe(false);
  });

  it('الأبواب ترث طبقة ولون الـ INSERT (4 أبواب × خط وقوس)', () => {
    expect(layer('DOORS')?.count).toBe(8);
    const doors = scene.batches.filter((b) => b.layer === 'DOORS');
    expect(doors).toHaveLength(1);
    expect(doors[0]?.color).toBe(3);
    // لا شيء يتسرّب إلى الطبقة 0 رغم أن عناصر الكتلة معرّفة عليها
    expect(layer('0')?.count).toBe(0);
  });

  it('الكراسي: مصفوفة 4 نسخ × (دائرة + قوس) + طاولة بيضاوية + عمود HATCH', () => {
    expect(layer('FURNITURE')?.count).toBe(10);
  });

  it('عمود HATCH صلب بثقب: حلقتان في تعبئة واحدة', () => {
    const hatches = scene.batches.flatMap((b) => b.hatches);
    expect(hatches).toHaveLength(1);
    expect(hatches[0]?.loops).toHaveLength(2);
  });

  it('النصوص العربية والـ MTEXT متعدد الأسطر', () => {
    const all = scene.texts.map((t) => t.lines.join('\n'));
    expect(all).toContain('غرفة المعيشة');
    expect(all).toContain('المطبخ');
    expect(all).toContain('مخطط شقة تجريبي\nCAD-VIEW sample plan');
  });

  it('حدود الرسم معقولة وتشمل الأبعاد وممر الحديقة', () => {
    expect(isEmptyBounds(scene.bounds)).toBe(false);
    expect(scene.bounds.minX).toBeLessThan(-30);
    expect(scene.bounds.maxX).toBeGreaterThan(1250);
    expect(scene.bounds.minY).toBeLessThan(-30);
    expect(scene.bounds.maxY).toBeGreaterThan(800);
    expect(scene.bounds.maxX).toBeLessThan(1500);
  });

  it('السبلاين والقطع الناقص والـ SOLID والنقطة والخط بلون حقيقي موجودة', () => {
    const garden = scene.batches.filter((b) => b.layer === 'GARDEN');
    expect(garden.some((b) => b.color >= 0x1000000)).toBe(true);
    expect(scene.batches.some((b) => b.fills.length > 0)).toBe(true);
    expect(scene.batches.some((b) => b.points.length > 0)).toBe(true);
  });
});
