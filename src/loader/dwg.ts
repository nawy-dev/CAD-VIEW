/**
 * تحويل DWG إلى DXF عبر LibreDWG (WASM) المضمَّن محليًا في public/vendor/libredwg.
 * يُحمَّل عند أول فتح لملف DWG فقط، فلا يثقّل بدء التطبيق، ولا يوجد أي اتصال خارجي.
 */
import { LoadError } from '../core/dxf/errors';

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

/** يحمّل الوحدة من نفس الأصل (نسبةً إلى base) بدون أن يضمّنها Vite في الحزمة. */
const defaultLoader: DwgModuleLoader = async () => {
  const url = new URL('vendor/libredwg/libredwg-web.js', document.baseURI).href;
  const mod = (await import(/* @vite-ignore */ url)) as {
    default: (opts?: object) => Promise<DwgModule>;
  };
  return mod.default();
};

let loader: DwgModuleLoader = defaultLoader;
let modulePromise: Promise<DwgModule> | null = null;

/** للاختبارات: استبدال المحمّل وتصفير الذاكرة المؤقتة. */
export function setDwgModuleLoader(next: DwgModuleLoader | null): void {
  loader = next ?? defaultLoader;
  modulePromise = null;
}

function getModule(): Promise<DwgModule> {
  if (!modulePromise) {
    modulePromise = loader().catch((error) => {
      modulePromise = null; // نسمح بإعادة المحاولة
      throw new LoadError('DWG_ENGINE', 'تعذّر تحميل محرك DWG', error instanceof Error ? error.message : undefined);
    });
  }
  return modulePromise;
}

/** أخطاء LibreDWG الحرجة تبدأ من 128؛ ما دونها تحذيرات والملف قابل للقراءة غالبًا. */
const CRITICAL = 128;

export async function convertDwgToDxf(bytes: Uint8Array): Promise<Uint8Array> {
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
}
