import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { LoadError } from '../src/core/dxf/errors';
import { convertDwgToDxf, resetDwgConverter } from '../src/loader/dwg';
import { createDwgEngine, type DwgModule, type DwgModuleLoader } from '../src/loader/dwg/libredwg';
import { setProviderOverride } from '../src/loader/dwg/registry';
import { openDrawingFile } from '../src/loader/openDrawing';

const fixture = (name: string): ArrayBuffer => {
  const b = readFileSync(new URL(`./fixtures/${name}`, import.meta.url));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};

/** يحمّل نفس ملف WASM المضمَّن في التطبيق، لكن من القرص بدل المتصفح. */
const realLoader = async (): Promise<DwgModule> => {
  const url = new URL('../public/vendor/libredwg/libredwg-web.js', import.meta.url).href;
  const mod = (await import(/* @vite-ignore */ url)) as { default: () => Promise<DwgModule> };
  return mod.default();
};

/** يجعل التطبيق يستعمل هذا المحمّل بدل تحميل المحرك من المتصفح (لاختبار ملفات حقيقية في Node). */
const setDwgModuleLoader = (loader: DwgModuleLoader | null): void => {
  setProviderOverride(
    loader
      ? { id: 'test', label: 'test', license: 'GPL-3.0-or-later', assetDir: 'vendor/libredwg', create: () => createDwgEngine(loader) }
      : undefined,
  );
  resetDwgConverter();
};

describe('DWG عبر LibreDWG المحلي', () => {
  beforeEach(() => setDwgModuleLoader(realLoader));

  it('يحوّل DWG (R14) إلى DXF ويعرضه', async () => {
    const d = await openDrawingFile('v.dwg', fixture('r14-v.dwg'));
    expect(d.version).toBe('AutoCAD R14');
    expect(Number.isFinite(d.scene.bounds.minX)).toBe(true);
    expect(d.scene.layers.length).toBeGreaterThan(1);
  });

  it('يحوّل DWG 2013 مع طبقات وكيانات', async () => {
    const d = await openDrawingFile('example.dwg', fixture('example-2013.dwg'));
    expect(d.version).toBe('AutoCAD 2013');
    expect(d.size).toBe(fixture('example-2013.dwg').byteLength);
    expect(d.scene.layers.length).toBeGreaterThanOrEqual(5);
  });

  it('يفتح Arc من DWG 2010', async () => {
    const d = await openDrawingFile('arc.dwg', fixture('2010-arc.dwg'));
    expect(d.scene.stats.primitives).toBeGreaterThan(0);
  });

  it('ملف DWG تالف يعطي LoadError وليس انهيارًا', async () => {
    const junk = new Uint8Array(500);
    junk.set([...'AC1027'].map((c) => c.charCodeAt(0)));
    let error: unknown;
    try {
      await convertDwgToDxf(junk);
    } catch (e) {
      error = e;
    }
    expect(error instanceof LoadError).toBe(true);
  });

  it('يتعافى بعد ملف تالف ويفتح الملف السليم', async () => {
    const junk = new Uint8Array(300);
    junk.set([...'AC1015'].map((c) => c.charCodeAt(0)));
    await convertDwgToDxf(junk).catch(() => undefined);
    const d = await openDrawingFile('v.dwg', fixture('r14-v.dwg'));
    expect(Number.isFinite(d.scene.bounds.minX)).toBe(true);
  });

  it('فشل تحميل المحرك يعطي DWG_ENGINE ثم يعيد المحاولة', async () => {
    let calls = 0;
    setDwgModuleLoader(async () => {
      calls++;
      if (calls === 1) throw new Error('offline');
      return realLoader();
    });
    const first = await openDrawingFile('v.dwg', fixture('r14-v.dwg')).catch((e) => e);
    expect(first instanceof LoadError && first.code === 'DWG_ENGINE').toBe(true);
    const second = await openDrawingFile('v.dwg', fixture('r14-v.dwg'));
    expect(Number.isFinite(second.scene.bounds.minX)).toBe(true);
    expect(calls).toBe(2);
  });

  it('DXF العادي لا يمسّ المحرك إطلاقًا', async () => {
    let loaded = false;
    setDwgModuleLoader(async () => {
      loaded = true;
      throw new Error('should not load');
    });
    const dxf = new TextEncoder().encode('0\nSECTION\n2\nENTITIES\n0\nLINE\n8\n0\n10\n0\n20\n0\n11\n5\n21\n5\n0\nENDSEC\n0\nEOF\n');
    const d = await openDrawingFile('a.dxf', dxf.buffer as ArrayBuffer);
    expect(Number.isFinite(d.scene.bounds.minX)).toBe(true);
    expect(loaded).toBe(false);
  });

  it('لا يستخدم new Function أثناء التحويل (متوافق مع CSP بلا unsafe-eval)', async () => {
    const mod = await realLoader();
    setDwgModuleLoader(async () => mod);
    const Original = globalThis.Function;
    let calls = 0;
    const Spy = new Proxy(Original, {
      construct(target, args) {
        calls++;
        return Reflect.construct(target, args);
      },
    });
    (globalThis as { Function: unknown }).Function = Spy;
    try {
      await convertDwgToDxf(new Uint8Array(fixture('example-2013.dwg')));
    } finally {
      (globalThis as { Function: unknown }).Function = Original;
    }
    expect(calls).toBe(0);
  });

  it('لا يترك ملفات في نظام ملفات WASM بعد النجاح أو الفشل', async () => {
    const mod = await realLoader();
    setDwgModuleLoader(async () => mod);
    await convertDwgToDxf(new Uint8Array(fixture('r14-v.dwg')));
    await convertDwgToDxf(new Uint8Array(500)).catch(() => undefined);
    expect(mod.FS.analyzePath('in.dwg', false).exists).toBe(false);
    expect(mod.FS.analyzePath('out.dxf', false).exists).toBe(false);
  });

  it('خرج فارغ يعطي EMPTY', async () => {
    const fake: DwgModule = {
      FS: {
        writeFile: () => undefined,
        readFile: () => new Uint8Array(0),
        unlink: () => undefined,
        analyzePath: () => ({ exists: true }),
      },
      dwg_write_dxf: () => 0,
    };
    setDwgModuleLoader(async () => fake);
    const error = await convertDwgToDxf(new Uint8Array(10)).catch((e) => e);
    expect(error instanceof LoadError && error.code === 'EMPTY').toBe(true);
  });

  it('رمز تحذير أقل من 128 يُقبل، وانهيار WASM يعيد تحميل الوحدة', async () => {
    let loads = 0;
    let crash = false;
    const fake: DwgModule = {
      FS: {
        writeFile: () => undefined,
        readFile: () => new Uint8Array([48, 10]),
        unlink: () => undefined,
        analyzePath: () => ({ exists: true }),
      },
      dwg_write_dxf: () => {
        if (crash) throw new Error('Aborted()');
        return 3;
      },
    };
    setDwgModuleLoader(async () => {
      loads++;
      return fake;
    });
    expect((await convertDwgToDxf(new Uint8Array(10))).length).toBe(2);
    crash = true;
    const error = await convertDwgToDxf(new Uint8Array(10)).catch((e) => e);
    expect(error instanceof LoadError && error.code === 'PARSE').toBe(true);
    crash = false;
    await convertDwgToDxf(new Uint8Array(10));
    expect(loads).toBe(2);
  });
});
