import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { writePrecache } from '../scripts/precache';

const sw = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');

function makeDist(vendorBytes: string, appBytes: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'cadview-dist-'));
  mkdirSync(join(dir, 'assets'));
  mkdirSync(join(dir, 'vendor/libredwg'), { recursive: true });
  writeFileSync(join(dir, 'sw.js'), sw);
  writeFileSync(join(dir, 'index.html'), '<html>');
  writeFileSync(join(dir, 'assets/index.js'), appBytes);
  writeFileSync(join(dir, 'vendor/libredwg/engine.wasm'), vendorBytes);
  return dir;
}

describe('precache', () => {
  it('يفصل ملفات vendor عن ملفات التطبيق ويكتب القوائم في sw.js', () => {
    const dir = makeDist('wasm', 'app');
    const r = writePrecache(dir);
    expect(r.vendorFiles).toEqual(['vendor/libredwg/engine.wasm']);
    expect(r.files).toEqual(['assets/index.js', 'index.html']);
    const out = readFileSync(join(dir, 'sw.js'), 'utf8');
    expect(out).toContain(JSON.stringify(r.vendorFiles));
    expect(out).toContain(JSON.stringify(r.version));
    expect(out).not.toContain("/*__VENDOR__*/ []");
  });

  it('تغيّر التطبيق لا يغيّر إصدار vendor والعكس', () => {
    const a = writePrecache(makeDist('wasm', 'app-1'));
    const b = writePrecache(makeDist('wasm', 'app-2'));
    const c = writePrecache(makeDist('wasm-2', 'app-1'));
    expect(a.vendorVersion).toBe(b.vendorVersion);
    expect(a.version).not.toBe(b.version);
    expect(a.version).toBe(c.version);
    expect(a.vendorVersion).not.toBe(c.vendorVersion);
  });

  it('يرمي إن غابت إحدى العلامات', () => {
    const dir = makeDist('w', 'a');
    writeFileSync(join(dir, 'sw.js'), "const VERSION = 'dev';");
    expect(() => writePrecache(dir)).toThrow();
  });
});
