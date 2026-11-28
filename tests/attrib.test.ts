import { describe, expect, it } from 'vitest';
import { parseDxf } from '../src/core/dxf/parser';
import { buildScene } from '../src/core/scene/build';
import { block, blocksSection, dxf, g, layersSection, rec, section } from './helpers';

const attrib = (value: string, x: number, y: number, extra = '') =>
  g(0, 'ATTRIB') + g(8, 'TAGS') + g(10, x) + g(20, y) + g(40, 2.5) + g(1, value) + g(2, 'NUM') + g(70, 0) + extra;

const insertWith = (...attribs: string[]) =>
  g(0, 'INSERT') + g(8, '0') + g(66, 1) + g(2, 'DOOR') + g(10, 0) + g(20, 0) + attribs.join('') + g(0, 'SEQEND');

const door = blocksSection(block('DOOR', [0, 0], g(0, 'LINE') + g(8, '0') + g(10, 0) + g(20, 0) + g(11, 1) + g(21, 0)));

describe('ATTRIB (قيم سمات الكتل)', () => {
  it('قيمة السمة تظهر كنص مع الكتلة', () => {
    const s = buildScene(parseDxf(dxf(layersSection(['TAGS', 3]), door, section('ENTITIES', insertWith(attrib('D-101', 5, 5))))));
    expect(s.texts.map((t) => t.lines.join(''))).toEqual(['D-101']);
    expect(s.texts[0]?.layer).toBe('TAGS');
  });

  it('عدة سمات تظهر كلها، والسمة المخفية (70=1) لا تظهر', () => {
    const s = buildScene(
      parseDxf(
        dxf(
          door,
          section(
            'ENTITIES',
            insertWith(attrib('A', 1, 1), attrib('HIDDEN', 2, 2).replace(g(70, 0), g(70, 1)), attrib('B', 3, 3)),
          ),
        ),
      ),
    );
    expect(s.texts.map((t) => t.lines.join('')).sort()).toEqual(['A', 'B']);
  });

  it('محاذاة السمة العمودية من الرمز 74 لا 73', () => {
    const doc = parseDxf(dxf(door, section('ENTITIES', insertWith(attrib('X', 0, 0, g(72, 1) + g(74, 2) + g(11, 4) + g(21, 4))))));
    const t = doc.entities.find((e) => e.type === 'TEXT');
    if (t?.type !== 'TEXT') throw new Error('no text');
    expect(t.hAlign).toBe(1);
    expect(t.vAlign).toBe(2);
  });

  it('ما بعد INSERT يُقرأ سليمًا (SEQEND لا يُحسب غير مدعوم)', () => {
    const doc = parseDxf(
      dxf(door, section('ENTITIES', insertWith(attrib('A', 0, 0)), rec('LINE', [8, '0'], [10, 0], [20, 0], [11, 5], [21, 5]))),
    );
    expect(doc.entities.map((e) => e.type)).toEqual(['INSERT', 'TEXT', 'LINE']);
    expect(doc.unsupported['SEQEND']).toBeUndefined();
  });

  it('السمات داخل كتلة متداخلة تتبع تحويل الـ INSERT الخارجي', () => {
    const outer = blocksSection(
      block('DOOR', [0, 0]),
      block('ROOM', [0, 0], insertWith(attrib('N', 1, 0))),
    );
    const s = buildScene(
      parseDxf(dxf(outer, section('ENTITIES', rec('INSERT', [8, '0'], [2, 'ROOM'], [10, 100], [20, 50])))),
    );
    expect(s.texts).toHaveLength(1);
    expect(s.texts[0]?.x).toBeCloseTo(101, 6);
    expect(s.texts[0]?.y).toBeCloseTo(50, 6);
  });

  it('سمة متعددة الأسطر (101): النص من MTEXT المضمّن والموضع والعرض لا يتأثران برموزه', () => {
    const multi =
      g(0, 'ATTRIB') + g(8, 'TAGS') + g(10, 5) + g(20, 5) + g(40, 2.5) + g(1, 'AB') + g(2, 'N') + g(70, 0) +
      g(72, 1) + g(11, 5) + g(21, 5) +
      g(101, 'Embedded Object') + g(41, 80) + g(72, 1) + g(11, 1) + g(21, 0) + g(1, '{\\fArial;A}\\PB');
    const doc = parseDxf(dxf(door, section('ENTITIES', insertWith(multi))));
    const t = doc.entities.find((e) => e.type === 'TEXT');
    if (t?.type !== 'TEXT') throw new Error('no text');
    expect(t.text).toBe('A B');
    expect(t.widthFactor).toBe(1);
    expect(t.alignPoint).toEqual({ x: 5, y: 5 });
    expect(t.hAlign).toBe(1);
  });
});
