import { libredwgProvider } from './libredwg';
import type { DwgProvider } from './provider';

/** القيمة المحقونة وقت البناء (vite.config.ts): معرّف محرك، أو 'none' لنسخة DXF فقط. */
declare const __DWG_ENGINE__: string | undefined;

/**
 * يعيد المحرك المسجَّل بمعرّفه، ويرمي إن لم يكن معروفًا (فلا يختفي DWG بصمت بسبب خطأ إعداد).
 * لإضافة محرك جديد: أضفه إلى engines.ts ثم أضف case هنا.
 */
export function providerFor(id: string): DwgProvider {
  switch (id) {
    case 'libredwg':
      return libredwgProvider;
    default:
      throw new Error(`محرك DWG غير معروف: ${id}`);
  }
}

/** المحرك المضمَّن في هذا البناء. المقارنة المباشرة بالثابت المحقون تُطوى وقت البناء فيُحذف الكود الميت. */
function builtProvider(): DwgProvider | null {
  // تعبير شرطي واحد (لا if متتالية): المحوِّل يطوي الشرط الثابت ويُسقط الفروع الميتة وما تستورده.
  // اختبارات/تشغيل بلا define → LibreDWG.
  return typeof __DWG_ENGINE__ === 'undefined'
    ? libredwgProvider
    : __DWG_ENGINE__ === 'none'
      ? null
      : providerFor(__DWG_ENGINE__);
}

/** للاختبارات: undefined = القيمة المبنية، null = بلا DWG، أو محرك مخصص. */
let override: DwgProvider | null | undefined;
export function setProviderOverride(next: DwgProvider | null | undefined): void {
  override = next;
}

/** المحرك الفعّال، أو null عندما تكون هذه النسخة بلا دعم DWG. */
export function activeProvider(): DwgProvider | null {
  return override !== undefined ? override : builtProvider();
}

export const dwgEnabled = (): boolean => activeProvider() !== null;
