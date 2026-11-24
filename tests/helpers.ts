/** أدوات بناء نصوص DXF صغيرة للاختبارات. */

export type Pair = [number, string | number];

/** زوج (رمز، قيمة). */
export const g = (code: number, value: string | number): string =>
  `${String(code).padStart(3, ' ')}\n${value}\n`;

/** سجل: (0, TYPE) ثم أزواجه. */
export const rec = (type: string, ...pairs: Pair[]): string =>
  g(0, type) + pairs.map(([c, v]) => g(c, v)).join('');

export const section = (name: string, ...body: string[]): string =>
  g(0, 'SECTION') + g(2, name) + body.join('') + g(0, 'ENDSEC');

export const dxf = (...sections: string[]): string => sections.join('') + g(0, 'EOF');

/** مستند يحتوي قسم ENTITIES فقط. */
export const entitiesDoc = (...records: string[]): string => dxf(section('ENTITIES', ...records));

/** قسم TABLES بطبقات (اسم، لون، علامات). */
export const layersSection = (...layers: Array<[string, number, number?]>): string =>
  section(
    'TABLES',
    g(0, 'TABLE'),
    g(2, 'LAYER'),
    ...layers.map(([name, color, flags = 0]) =>
      rec('LAYER', [2, name], [70, flags], [62, color]),
    ),
    g(0, 'ENDTAB'),
  );

/** كتلة بنقطة أساس وكيانات. */
export const block = (name: string, base: [number, number], ...records: string[]): string =>
  rec('BLOCK', [8, '0'], [2, name], [70, 0], [10, base[0]], [20, base[1]]) +
  records.join('') +
  rec('ENDBLK', [8, '0']);

export const blocksSection = (...blocks: string[]): string => section('BLOCKS', ...blocks);

export const line = (
  layer: string,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  ...extra: Pair[]
): string =>
  rec('LINE', [8, layer], ...extra, [10, x1], [20, y1], [11, x2], [21, y2]);

/** نسخة ArrayBuffer مستقلة من بايتات. */
export const toArrayBuffer = (bytes: Uint8Array): ArrayBuffer => bytes.slice().buffer;

export const utf8 = (s: string): ArrayBuffer => toArrayBuffer(new TextEncoder().encode(s));
