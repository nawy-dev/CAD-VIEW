import { existsSync, readdirSync, readFileSync, rmdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ENGINES } from '../src/loader/dwg/engines.ts';

/** يختار المحرك: --mode nodwg أو CADVIEW_DWG=none (بلا DWG)، أو معرّف محرك من engines.ts. */
export function resolveDwgEngine(mode: string, env: string | undefined): string {
  const requested = env?.trim().toLowerCase() || undefined; // نص فارغ (شائع في CI) = غير محدد
  if (mode === 'nodwg') {
    if (requested !== undefined && requested !== 'none') {
      throw new Error(`--mode nodwg يتعارض مع CADVIEW_DWG=${requested}`);
    }
    return 'none';
  }
  const id = requested ?? 'libredwg';
  if (id !== 'none' && !(id in ENGINES)) {
    throw new Error(`CADVIEW_DWG=${id} غير معروف. المتاح: ${Object.keys(ENGINES).join(', ')}, none`);
  }
  return id;
}

/** يزيل ذكر DWG من نصوص الوصف عندما لا يدعمها هذا البناء. */
export function stripDwgText(text: string): string {
  return text.replaceAll('DXF وDWG', 'DXF');
}

/**
 * يُنفَّذ بعد البناء وقبل حساب الـ precache: يحذف ملفات كل محرك غير المختار،
 * وعند 'none' يزيل .dwg من file_handlers في manifest ويعدّل وصفه كي لا يعلن التطبيق ما لا يدعمه.
 */
export function applyDwgEngine(distDir: string, engine: string): void {
  for (const [id, info] of Object.entries(ENGINES)) {
    if (id !== engine) rmSync(join(distDir, info.assetDir), { recursive: true, force: true });
  }
  // لا نترك مجلد vendor فارغًا
  const vendor = join(distDir, 'vendor');
  if (existsSync(vendor) && readdirSync(vendor).length === 0) rmdirSync(vendor);
  if (engine !== 'none') return;

  const manifestPath = join(distDir, 'manifest.webmanifest');
  if (!existsSync(manifestPath)) return;
  type Manifest = { description?: string; file_handlers?: Array<{ accept?: Record<string, string[]> }> };
  let manifest: Manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Manifest;
  } catch (error) {
    throw new Error(`manifest.webmanifest غير صالح: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (manifest.description) manifest.description = stripDwgText(manifest.description);
  if (manifest.file_handlers) {
    for (const handler of manifest.file_handlers) {
      const accept = handler.accept ?? {};
      for (const [type, exts] of Object.entries(accept)) {
        const kept = exts.filter((e) => e.toLowerCase() !== '.dwg');
        if (kept.length === 0) delete accept[type];
        else accept[type] = kept;
      }
    }
    manifest.file_handlers = manifest.file_handlers.filter((h) => Object.keys(h.accept ?? {}).length > 0);
    if (manifest.file_handlers.length === 0) delete manifest.file_handlers;
  }
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
}
