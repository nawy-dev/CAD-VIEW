import { mkdirSync, mkdtempSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { applyDwgEngine, resolveDwgEngine, stripDwgText } from '../scripts/dwg-build';
import { LoadError } from '../src/core/dxf/errors';
import { resetDwgConverter } from '../src/loader/dwg';
import { ENGINES } from '../src/loader/dwg/engines';
import { libredwgProvider, vendorUrl } from '../src/loader/dwg/libredwg';
import type { DwgProvider } from '../src/loader/dwg/provider';
import { dwgEnabled, providerFor, setProviderOverride } from '../src/loader/dwg/registry';
import { openDrawingCore } from '../src/loader/open-core';
import { openDrawingFile } from '../src/loader/openDrawing';
import { dxf, line, section } from './helpers';

const dwgBytes = (): ArrayBuffer => {
  const b = new Uint8Array(200);
  b.set([...'AC1027'].map((c) => c.charCodeAt(0)));
  return b.buffer;
};
const smallDxf = () => new TextEncoder().encode(dxf(section('ENTITIES', line('0', 0, 0, 10, 10))));

describe('تبديل محرك DWG', () => {
  afterEach(() => {
    setProviderOverride(undefined);
    resetDwgConverter();
  });

  it('كل محرك في engines.ts له مزوّد مسجَّل بنفس المعرّف والترخيص ومجلد الملفات', () => {
    for (const [id, info] of Object.entries(ENGINES)) {
      const p = providerFor(id);
      expect(p.id).toBe(id);
      expect(p.license).toBe(info.license);
      expect(p.assetDir).toBe(info.assetDir);
      expect(info.assetDir.startsWith('vendor/')).toBe(true); // يعامله الـ service worker كملفات ثقيلة
    }
  });

  it('معرّف مجهول يرمي خطأً بدل أن يختفي DWG بصمت', () => {
    expect(() => providerFor('nope')).toThrow();
  });

  it('LibreDWG يحسب رابط ملفه من أساس التطبيق (مجلد فرعي وCapacitor)', () => {
    expect(vendorUrl('http://x/app/')).toBe('http://x/app/vendor/libredwg/libredwg-web.js');
    expect(vendorUrl('https://localhost/')).toBe('https://localhost/vendor/libredwg/libredwg-web.js');
    expect(typeof libredwgProvider.create('http://x/app/').convert).toBe('function');
  });

  it('محرك مخصص يُستعمل دون أي تغيير في باقي التطبيق', async () => {
    const calls: number[] = [];
    const custom: DwgProvider = {
      id: 'mine',
      label: 'محرك تجريبي',
      license: 'MIT',
      assetDir: 'vendor/mine',
      create: () => ({
        convert: async (bytes) => {
          calls.push(bytes.length);
          return smallDxf();
        },
      }),
    };
    setProviderOverride(custom);
    resetDwgConverter();
    const d = await openDrawingFile('a.dwg', dwgBytes());
    expect(calls).toEqual([200]);
    expect(d.version).toBe('AutoCAD 2013');
    expect(d.scene.stats.primitives).toBe(1);
  });

  it('خطأ المحرك المخصص يصل للواجهة كما هو (LoadError)', async () => {
    setProviderOverride({
      id: 'bad',
      label: 'x',
      license: 'MIT',
      assetDir: 'vendor/bad',
      create: () => ({
        convert: async () => {
          throw new LoadError('PARSE', 'ملف تالف', 'custom');
        },
      }),
    });
    resetDwgConverter();
    const error = await openDrawingFile('a.dwg', dwgBytes()).catch((e) => e);
    expect(error instanceof LoadError && error.code === 'PARSE' && error.detail === 'custom').toBe(true);
  });

  it('بلا محرك (نسخة DXF فقط): DWG يُرفض برسالة DWG_UNSUPPORTED وDXF يعمل', async () => {
    setProviderOverride(null);
    expect(dwgEnabled()).toBe(false);
    const error = await openDrawingFile('a.dwg', dwgBytes()).catch((e) => e);
    expect(error instanceof LoadError && error.code === 'DWG_UNSUPPORTED').toBe(true);
    const d = await openDrawingFile('a.dxf', smallDxf().buffer as ArrayBuffer);
    expect(d.scene.stats.primitives).toBe(1);
  });

  it('openDrawingCore بلا محوّل لا يستدعي شيئًا ويرفض DWG', async () => {
    const error = await openDrawingCore('a.dwg', dwgBytes(), null).catch((e) => e);
    expect(error instanceof LoadError && error.code === 'DWG_UNSUPPORTED').toBe(true);
  });
});

describe('بناء بدون محرك DWG', () => {
  const makeDist = () => {
    const dir = mkdtempSync(join(tmpdir(), 'cadview-nodwg-'));
    mkdirSync(join(dir, 'vendor/libredwg'), { recursive: true });
    writeFileSync(join(dir, 'vendor/libredwg/libredwg-web.wasm'), 'wasm');
    writeFileSync(
      join(dir, 'manifest.webmanifest'),
      JSON.stringify({
        name: 'x',
        file_handlers: [{ action: './', accept: { 'image/vnd.dxf': ['.dxf'], 'image/vnd.dwg': ['.dwg'] } }],
      }),
    );
    return dir;
  };

  it('none يحذف ملفات المحرك ويزيل .dwg من file_handlers ويُبقي .dxf', () => {
    const dir = makeDist();
    applyDwgEngine(dir, 'none');
    expect(existsSync(join(dir, 'vendor/libredwg'))).toBe(false);
    const m = JSON.parse(readFileSync(join(dir, 'manifest.webmanifest'), 'utf8'));
    expect(m.file_handlers[0].accept).toEqual({ 'image/vnd.dxf': ['.dxf'] });
  });

  it('libredwg يُبقي كل شيء كما هو', () => {
    const dir = makeDist();
    applyDwgEngine(dir, 'libredwg');
    expect(existsSync(join(dir, 'vendor/libredwg/libredwg-web.wasm'))).toBe(true);
    const m = JSON.parse(readFileSync(join(dir, 'manifest.webmanifest'), 'utf8'));
    expect(m.file_handlers[0].accept['image/vnd.dwg']).toEqual(['.dwg']);
  });

  it('اختيار المحرك: mode=nodwg يعني none، وقيمة مجهولة ترمي خطأً واضحًا', () => {
    expect(resolveDwgEngine('nodwg', undefined)).toBe('none');
    expect(resolveDwgEngine('production', undefined)).toBe('libredwg');
    expect(resolveDwgEngine('production', 'none')).toBe('none');
    expect(() => resolveDwgEngine('production', 'typo')).toThrow();
  });

  it('نص فارغ أو حروف كبيرة في CADVIEW_DWG، وتعارض mode مع المتغير', () => {
    expect(resolveDwgEngine('production', '')).toBe('libredwg');
    expect(resolveDwgEngine('production', '  ')).toBe('libredwg');
    expect(resolveDwgEngine('production', 'LibreDWG')).toBe('libredwg');
    expect(resolveDwgEngine('production', 'NONE')).toBe('none');
    expect(resolveDwgEngine('nodwg', 'none')).toBe('none');
    expect(() => resolveDwgEngine('nodwg', 'libredwg')).toThrow();
  });

  it('applyDwgEngine بلا manifest، أو بلا file_handlers، أو .DWG بحروف كبيرة، أو manifest تالف', () => {
    const noManifest = mkdtempSync(join(tmpdir(), 'cadview-a-'));
    expect(() => applyDwgEngine(noManifest, 'none')).not.toThrow();

    const bare = mkdtempSync(join(tmpdir(), 'cadview-b-'));
    writeFileSync(join(bare, 'manifest.webmanifest'), JSON.stringify({ name: 'x', description: 'ملفات DXF وDWG' }));
    applyDwgEngine(bare, 'none');
    const m1 = JSON.parse(readFileSync(join(bare, 'manifest.webmanifest'), 'utf8'));
    expect(m1.file_handlers).toBeUndefined();
    expect(m1.description).toBe('ملفات DXF');

    const upper = mkdtempSync(join(tmpdir(), 'cadview-c-'));
    writeFileSync(
      join(upper, 'manifest.webmanifest'),
      JSON.stringify({ file_handlers: [{ action: './', accept: { 'image/vnd.dwg': ['.DWG'] } }] }),
    );
    applyDwgEngine(upper, 'none');
    expect(JSON.parse(readFileSync(join(upper, 'manifest.webmanifest'), 'utf8')).file_handlers).toBeUndefined();

    const broken = mkdtempSync(join(tmpdir(), 'cadview-d-'));
    writeFileSync(join(broken, 'manifest.webmanifest'), '{ not json');
    expect(() => applyDwgEngine(broken, 'none')).toThrow();
  });

  it('stripDwgText يزيل ذكر DWG من النصوص الوصفية فقط', () => {
    expect(stripDwgText('عارض DXF وDWG يعمل')).toBe('عارض DXF يعمل');
    expect(stripDwgText('no change')).toBe('no change');
  });

  it('حذف المحرك لا يمسّ ملفات vendor الأخرى ويُبقي المجلد الأب إن كان فيه شيء', () => {
    const dir = makeDist();
    mkdirSync(join(dir, 'vendor/other'), { recursive: true });
    writeFileSync(join(dir, 'vendor/other/x.js'), 'x');
    applyDwgEngine(dir, 'none');
    expect(existsSync(join(dir, 'vendor/libredwg'))).toBe(false);
    expect(existsSync(join(dir, 'vendor/other/x.js'))).toBe(true);
  });
});
