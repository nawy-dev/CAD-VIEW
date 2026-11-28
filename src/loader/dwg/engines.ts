/**
 * بيانات المحركات المعروفة (بلا أي كود): مصدر واحد تقرؤه الواجهة وسكربتات البناء معًا،
 * فلا يختلف ما يُحذف من البناء عمّا يُسجَّل في registry.ts.
 * لإضافة محرك: أضف سطرًا هنا، ثم case في registry.ts (providerFor).
 */
export interface EngineInfo {
  /** ترخيص المحرك (SPDX). */
  license: string;
  /** مجلد ملفاته داخل public/ وdist/. يجب أن يكون تحت vendor/ كي يعامله الـ service worker كملفات ثقيلة. */
  assetDir: string;
}

export const ENGINES: Readonly<Record<string, EngineInfo>> = {
  libredwg: { license: 'GPL-3.0-or-later', assetDir: 'vendor/libredwg' },
};
