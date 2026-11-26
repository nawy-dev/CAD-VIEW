import { describe, expect, it } from 'vitest';
import { parseDxf } from '../src/core/dxf/parser';
import { isHidden } from '../src/core/render/draw';
import { buildScene } from '../src/core/scene/build';
import { block, blocksSection, dxf, layersSection, line, rec, section } from './helpers';

const build = (...parts: string[]) => buildScene(parseDxf(dxf(...parts)));

describe('إخفاء طبقة الـ INSERT يخفي محتوى الكتلة', () => {
  const inner = blocksSection(block('B', [0, 0], line('PIPES', 0, 0, 5, 0)));

  it('الدفعة تحمل طبقة الـ INSERT في via', () => {
    const s = build(
      layersSection(['PIPES', 1], ['UNITS', 2]),
      inner,
      section('ENTITIES', rec('INSERT', [8, 'UNITS'], [2, 'B'], [10, 0], [20, 0])),
    );
    const b = s.batches.find((x) => x.layer === 'PIPES');
    expect(b?.via).toEqual(['UNITS']);
    expect(isHidden(new Set(['UNITS']), 'PIPES', b?.via)).toBe(true);
    expect(isHidden(new Set(['PIPES']), 'PIPES', b?.via)).toBe(true);
    expect(isHidden(new Set(['OTHER']), 'PIPES', b?.via)).toBe(false);
  });

  it('نفس الطبقة والمحتوى من داخل وخارج الكتلة لا يُدمجان في دفعة واحدة', () => {
    const s = build(
      layersSection(['PIPES', 1], ['UNITS', 2]),
      inner,
      section('ENTITIES', line('PIPES', 0, 0, 1, 1), rec('INSERT', [8, 'UNITS'], [2, 'B'], [10, 0], [20, 0])),
    );
    const batches = s.batches.filter((x) => x.layer === 'PIPES');
    expect(batches).toHaveLength(2);
    expect(batches.filter((b) => b.via === undefined)).toHaveLength(1);
  });

  it('الكتل المتداخلة تجمع كل طبقات السلسلة', () => {
    const s = build(
      layersSection(['A', 1], ['B', 2], ['C', 3]),
      blocksSection(
        block('IN', [0, 0], line('C', 0, 0, 1, 1)),
        block('OUT', [0, 0], rec('INSERT', [8, 'B'], [2, 'IN'], [10, 0], [20, 0])),
      ),
      section('ENTITIES', rec('INSERT', [8, 'A'], [2, 'OUT'], [10, 0], [20, 0])),
    );
    expect(s.batches.find((x) => x.layer === 'C')?.via).toEqual(['A', 'B']);
  });

  it('المحتوى داخل INSERT على طبقة مجمّدة لا يدخل حدود الملاءمة', () => {
    const s = build(
      layersSection(['PIPES', 1], ['UNITS', 2, 1]),
      blocksSection(block('B', [0, 0], line('PIPES', 0, 0, 1000, 1000))),
      section('ENTITIES', line('PIPES', 0, 0, 10, 10), rec('INSERT', [8, 'UNITS'], [2, 'B'], [10, 0], [20, 0])),
    );
    expect(s.layers.find((l) => l.name === 'UNITS')?.hiddenByDefault).toBe(true);
    expect(s.bounds.maxX).toBe(10);
  });

  it('الكيان العادي بلا via', () => {
    const s = build(layersSection(['A', 1]), section('ENTITIES', line('A', 0, 0, 1, 1)));
    expect(s.batches[0]?.via).toBeUndefined();
  });
});
