/**
 * عقد محركات DWG القابلة للتبديل.
 *
 * التطبيق لا يعرف شيئًا عن أي محرك بعينه: يطلب فقط تحويل بايتات DWG إلى نص DXF،
 * ثم يمرّره على المحلل والعارض نفسيهما. لإضافة محرك جديد (مثلًا Rust→WASM بترخيص MIT)
 * يكفي تنفيذ DwgProvider وتسجيله في registry.ts. راجع docs/DWG-ENGINES.md.
 */

/** محوّل جاهز للاستعمال داخل سياق واحد (Worker أو الخيط الرئيسي). */
export interface DwgConverter {
  /** يحوّل ملف DWG إلى DXF (بايتات نصية). يرمي LoadError عند الفشل. */
  convert(bytes: Uint8Array): Promise<Uint8Array>;
  /** يُسقط أي حالة محمّلة (مثل نسخة WASM) فيُعاد تحميلها عند الاستعمال التالي. اختياري. */
  reset?(): void;
}

export interface DwgProvider {
  /** معرّف قصير ثابت (يطابق قيمة CADVIEW_DWG وقت البناء). */
  readonly id: string;
  readonly label: string;
  /** ترخيص المحرك بصيغة SPDX (للتوثيق؛ المصدر الرسمي engines.ts). */
  readonly license: string;
  /** مجلد ملفاته داخل public/ تحت vendor/ (المصدر الرسمي engines.ts؛ يُحذف من البناء عند اختيار غيره). */
  readonly assetDir: string;
  /** ينشئ محوّلًا. baseUrl = أساس التطبيق المطلق (document.baseURI) لحساب روابط ملفات المحرك. */
  create(baseUrl: string): DwgConverter;
}
