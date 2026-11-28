/**
 * محرك تحويل DWG→DXF (LibreDWG WASM). يعمل في أي سياق: خيط رئيسي، Worker، أو Node للاختبار.
 * لا يعرف شيئًا عن الـ Worker؛ dwg.ts يختار أين يُشغَّل.
 */
import { LoadError } from '../../core/dxf/errors';
import type { DwgConverter, DwgProvider } from './provider';

/** الجزء المستخدم من وحدة Emscripten. */
export interface DwgModule {
  FS: {
    writeFile(path: string, data: Uint8Array): void;
    readFile(path: string): Uint8Array;
    unlink(path: string): void;
    analyzePath(path: string, dontResolve?: boolean): { exists: boolean };
  };
  dwg_write_dxf(input: string, output: string): number;
}

export type DwgModuleLoader = () => Promise<DwgModule>;

/** رابط ملف الربط مطلقًا نسبةً لأساس التطبيق (يعمل في التطوير والإنتاج وداخل Capacitor). */
export function vendorUrl(baseUrl: string): string {
  return new URL('vendor/libredwg/libredwg-web.js', baseUrl).href;
}

export const loaderFor = (url: string): DwgModuleLoader => async () => {
  const mod = (await import(/* @vite-ignore */ url)) as {
    default: (opts?: object) => Promise<DwgModule>;
  };
  return mod.default();
};

/** أخطاء LibreDWG الحرجة تبدأ من 128؛ ما دونها تحذيرات والملف قابل للقراءة غالبًا. */
const CRITICAL = 128;

export interface DwgEngine extends DwgConverter {
  reset(): void;
}

export function createDwgEngine(loader: DwgModuleLoader): DwgEngine {
  let modulePromise: Promise<DwgModule> | null = null;

  const getModule = (): Promise<DwgModule> => {
    if (!modulePromise) {
      modulePromise = loader().catch((error) => {
        modulePromise = null; // نسمح بإعادة المحاولة
        throw new LoadError('DWG_ENGINE', 'تعذّر تحميل محرك DWG', error instanceof Error ? error.message : undefined);
      });
    }
    return modulePromise;
  };

  return {
    reset() {
      modulePromise = null;
    },
    async convert(bytes) {
      const mod = await getModule();
      const input = 'in.dwg';
      const output = 'out.dxf';
      try {
        mod.FS.writeFile(input, bytes);
        let code: number;
        try {
          code = mod.dwg_write_dxf(input, output);
        } catch (error) {
          // انهيار WASM (abort أو نفاد الذاكرة) يترك الوحدة غير صالحة: نعيد تحميلها في الفتح التالي
          modulePromise = null;
          throw new LoadError('PARSE', 'تعذّر قراءة ملف DWG', error instanceof Error ? error.message : undefined);
        }
        if (code >= CRITICAL || !mod.FS.analyzePath(output, false).exists) {
          throw new LoadError('PARSE', 'تعذّر قراءة ملف DWG', `LibreDWG ${code}`);
        }
        const dxf = mod.FS.readFile(output);
        if (dxf.length === 0) throw new LoadError('EMPTY', 'نتج عن التحويل ملف فارغ');
        return dxf;
      } finally {
        for (const path of [input, output]) {
          try {
            if (mod.FS.analyzePath(path, false).exists) mod.FS.unlink(path);
          } catch {
            // تنظيف فقط
          }
        }
      }
    },
  };
}

/** المحرك الافتراضي: LibreDWG مبنيًا WASM داخل public/vendor/libredwg (ترخيص GPL-3). */
export const libredwgProvider: DwgProvider = {
  id: 'libredwg',
  label: 'LibreDWG (WASM)',
  // قيم حرفية عمدًا (لا قراءة خصائص) كي تُحذف الوحدة كاملة من بناء nodwg؛
  // يتحقق tests/dwg-providers.test.ts أنها تطابق engines.ts.
  license: 'GPL-3.0-or-later',
  assetDir: 'vendor/libredwg',
  create: (baseUrl) => createDwgEngine(loaderFor(vendorUrl(baseUrl))),
};
