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
}

/**
 * يُنفَّذ بعد البناء: يحسب قائمة ملفات التطبيق وبصمتها، ثم يكتبهما داخل dist/sw.js
 * مكان العلامتين __VERSION__ و __PRECACHE__.
 * تغيّر محتوى sw.js مع كل إصدار هو ما يجعل المتصفح يكتشف التحديث.
 */
export function writePrecache(distDir: string): PrecacheResult {
  const files = listFiles(distDir).filter((f) => f !== 'sw.js' && !f.endsWith('.map'));
  const hash = createHash('sha256');
  for (const f of files) {
    hash.update(f);
    hash.update(readFileSync(join(distDir, f)));
  }
  const version = hash.digest('hex').slice(0, 12);

  const swPath = join(distDir, 'sw.js');
  const source = readFileSync(swPath, 'utf8');
  const versionMarker = /\/\*__VERSION__\*\/\s*'dev'/;
  const precacheMarker = /\/\*__PRECACHE__\*\/\s*\[\]/;
  if (!versionMarker.test(source) || !precacheMarker.test(source)) {
    throw new Error('sw.js لا يحتوي علامتي __VERSION__ و __PRECACHE__');
  }
  const next = source
    .replace(versionMarker, () => JSON.stringify(version))
    .replace(precacheMarker, () => JSON.stringify(files));
  writeFileSync(swPath, next);
  return { version, files };
}
