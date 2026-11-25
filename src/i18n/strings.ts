import type { ErrorCode } from '../loader/openDrawing';

export type Lang = 'ar' | 'en';

export const isLang = (value: string): value is Lang => value === 'ar' || value === 'en';

export interface Strings {
  appName: string;
  tagline: string;
  open: string;
  openSample: string;
  recent: string;
  recentTitle: string;
  recentEmpty: string;
  recentClear: string;
  remove: string;
  layers: string;
  layersEmpty: string;
  showAll: string;
  hideAll: string;
  searchLayers: string;
  zoomIn: string;
  zoomOut: string;
  fitView: string;
  close: string;
  toLight: string;
  toDark: string;
  switchLang: string;
  loading: string;
  dropHint: string;
  formatsHint: string;
  online: string;
  offline: string;
  dismiss: string;
  noGeometry: string;
  truncated: string;
  items: (n: string) => string;
  unsupported: (list: string) => string;
  errors: Record<ErrorCode, (detail?: string) => string>;
}

const ar: Strings = {
  appName: 'CAD-VIEW',
  tagline: 'عارض الرسومات الهندسية',
  open: 'فتح ملف',
  openSample: 'جرّب ملفًا نموذجيًا',
  recent: 'الأخيرة',
  recentTitle: 'الملفات الأخيرة',
  recentEmpty: 'لا توجد ملفات أخيرة بعد. الملفات التي تفتحها تُحفظ هنا على جهازك فقط.',
  recentClear: 'مسح الكل',
  remove: 'حذف',
  layers: 'الطبقات',
  layersEmpty: 'لا توجد طبقات في هذا الرسم',
  showAll: 'إظهار الكل',
  hideAll: 'إخفاء الكل',
  searchLayers: 'بحث في الطبقات…',
  zoomIn: 'تكبير',
  zoomOut: 'تصغير',
  fitView: 'ملاءمة الشاشة',
  close: 'إغلاق',
  toLight: 'الوضع الفاتح',
  toDark: 'الوضع الداكن',
  switchLang: 'English',
  loading: 'جارٍ فتح الملف…',
  dropHint: 'اسحب ملف DXF وأفلته هنا، أو اضغط «فتح ملف»',
  formatsHint: 'يدعم ملفات DXF وDWG ويعمل بدون إنترنت.',
  online: 'متصل',
  offline: 'بدون إنترنت — التطبيق يعمل محليًا',
  dismiss: 'إخفاء',
  noGeometry: 'لا يحتوي الملف على عناصر قابلة للعرض.',
  truncated: 'الرسم كبير جدًا فعُرض جزء منه فقط.',
  items: (n) => `${n} عنصر`,
  unsupported: (list) => `عناصر لا يدعمها العارض بعد ولم تُرسم: ${list}`,
  errors: {
    EMPTY: () => 'الملف فارغ.',
    NOT_DXF: () => 'هذا الملف ليس بصيغة DXF صالحة.',
    BINARY_DXF: () => 'ملفات DXF الثنائية غير مدعومة بعد. صدّر الملف بصيغة DXF نصية (ASCII).',
    DWG_UNSUPPORTED: (detail) =>
      `ملفات DWG غير مدعومة بعد${detail ? ` (الإصدار: ${detail})` : ''}. صدّر الرسم بصيغة DXF من AutoCAD أو من أي محوّل، ثم افتحه هنا.`,
    DWG_ENGINE: () => 'تعذّر تحميل محرك قراءة DWG. أعد تحميل التطبيق وحاول مجددًا، أو افتح الرسم بصيغة DXF.',
    TOO_LARGE: () => 'الملف أكبر من الحد المسموح (150 ميجابايت).',
    PARSE: () => 'تعذّر تحليل الملف، وقد يكون تالفًا.',
    READ: () => 'تعذّرت قراءة الملف.',
    UNKNOWN: () => 'حدث خطأ غير متوقع أثناء فتح الملف.',
  },
};

const en: Strings = {
  appName: 'CAD-VIEW',
  tagline: 'Engineering drawing viewer',
  open: 'Open file',
  openSample: 'Try a sample file',
  recent: 'Recent',
  recentTitle: 'Recent files',
  recentEmpty: 'No recent files yet. Files you open are kept here, on your device only.',
  recentClear: 'Clear all',
  remove: 'Remove',
  layers: 'Layers',
  layersEmpty: 'This drawing has no layers',
  showAll: 'Show all',
  hideAll: 'Hide all',
  searchLayers: 'Search layers…',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  fitView: 'Fit to screen',
  close: 'Close',
  toLight: 'Light mode',
  toDark: 'Dark mode',
  switchLang: 'العربية',
  loading: 'Opening file…',
  dropHint: 'Drop a DXF file here, or press “Open file”',
  formatsHint: 'Opens DXF and DWG files, fully offline.',
  online: 'Online',
  offline: 'Offline — the app runs locally',
  dismiss: 'Dismiss',
  noGeometry: 'This file has no drawable entities.',
  truncated: 'The drawing is very large, so only part of it is shown.',
  items: (n) => `${n} items`,
  unsupported: (list) => `Not supported yet and not drawn: ${list}`,
  errors: {
    EMPTY: () => 'The file is empty.',
    NOT_DXF: () => 'This is not a valid DXF file.',
    BINARY_DXF: () => 'Binary DXF files are not supported yet. Export the file as ASCII DXF.',
    DWG_UNSUPPORTED: (detail) =>
      `DWG files are not supported yet${detail ? ` (version: ${detail})` : ''}. Export the drawing as DXF from AutoCAD or any converter, then open it here.`,
    DWG_ENGINE: () => 'The DWG engine failed to load. Reload the app and try again, or open the drawing as DXF.',
    TOO_LARGE: () => 'The file is larger than the allowed limit (150 MB).',
    PARSE: () => 'The file could not be parsed. It may be corrupted.',
    READ: () => 'The file could not be read.',
    UNKNOWN: () => 'An unexpected error occurred while opening the file.',
  },
};

export const strings: Record<Lang, Strings> = { ar, en };
