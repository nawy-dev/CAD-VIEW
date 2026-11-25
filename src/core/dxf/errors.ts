export type LoadErrorCode =
  | 'EMPTY'
  | 'NOT_DXF'
  | 'BINARY_DXF'
  | 'DWG_UNSUPPORTED'
  | 'DWG_ENGINE'
  | 'TOO_LARGE'
  | 'PARSE';

/** خطأ فتح ملف؛ الواجهة تعرض رسالة مترجمة حسب code. */
export class LoadError extends Error {
  readonly code: LoadErrorCode;
  /** تفاصيل إضافية للعرض (مثل إصدار DWG). */
  readonly detail?: string;

  constructor(code: LoadErrorCode, message: string, detail?: string) {
    super(message);
    this.name = 'LoadError';
    this.code = code;
    if (detail !== undefined) this.detail = detail;
  }
}
