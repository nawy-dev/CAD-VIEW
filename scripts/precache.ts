import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** كل ملفات المجلد (مسارات نسبية بصيغة POSIX ومرتبة). */
export function listFiles(dir: string, prefix = ''): string[] {
  const out: string[] = [];
  for (const name of readdirSync(join(dir, prefix)).sort()) {
    const rel = prefix ? `${prefix}/${name}` : name;
    if (statSync(join(dir, rel)).isDirectory()) out.push(...listFiles(dir, rel));
    else out.push(rel);
  }
  return out;
}

export interface PrecacheResult {
  version: string;
  files: string[];
  /** إصدار الملفات الثقيلة (محرك DWG): يتغير فقط إن تغيرت هي نفسها، فلا يُعاد تنزيلها مع كل تحديث للتطبيق. */
  vendorVersion: string;
  vendorFiles: string[];
}

const VENDOR_PREFIX = 'vendor/';

function digest(distDir: string, files: string[]): string {
  const hash = createHash('sha256');
  for (const f of files) {
    hash.update(f);
    hash.update(readFileSync(join(distDir, f)));
  }
  return hash.digest('hex').slice(0, 12);
}

/**
 * يُنفَّذ بعد البناء: يحسب قائمتين ويكتبهما داخل dist/sw.js مكان العلامات:
 * - ملفات التطبيق (تُخزَّن عند التثبيت؛ فشلها يُفشل التثبيت) وبصمتها __VERSION__.
 * - ملفات vendor الثقيلة (تُخزَّن في كاش مستقل بأفضل جهد ولا تُفشل التثبيت) وبصمتها __VENDOR_VERSION__.
 * تغيّر محتوى sw.js مع كل إصدار هو ما يجعل المتصفح يكتشف التحديث.
 */
export function writePrecache(distDir: string): PrecacheResult {
  const all = listFiles(distDir).filter((f) => f !== 'sw.js' && !f.endsWith('.map'));
  const vendorFiles = all.filter((f) => f.startsWith(VENDOR_PREFIX));
  const files = all.filter((f) => !f.startsWith(VENDOR_PREFIX));
  const version = digest(distDir, files);
  const vendorVersion = vendorFiles.length > 0 ? digest(distDir, vendorFiles) : 'none';

  const swPath = join(distDir, 'sw.js');
  const source = readFileSync(swPath, 'utf8');
  const markers = {
    version: /\/\*__VERSION__\*\/\s*'dev'/,
    precache: /\/\*__PRECACHE__\*\/\s*\[\]/,
    vendorVersion: /\/\*__VENDOR_VERSION__\*\/\s*'dev'/,
    vendor: /\/\*__VENDOR__\*\/\s*\[\]/,
  };
  if (!Object.values(markers).every((m) => m.test(source))) {
    throw new Error('sw.js لا يحتوي علامات __VERSION__ و __PRECACHE__ و __VENDOR_VERSION__ و __VENDOR__');
  }
  const next = source
    .replace(markers.version, () => JSON.stringify(version))
    .replace(markers.precache, () => JSON.stringify(files))
    .replace(markers.vendorVersion, () => JSON.stringify(vendorVersion))
    .replace(markers.vendor, () => JSON.stringify(vendorFiles));
  writeFileSync(swPath, next);
  return { version, files, vendorVersion, vendorFiles };
}
