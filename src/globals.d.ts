/** يُحدَّد وقت البناء (vite.config.ts): true في النسخة المبنية فقط. */
declare const __PWA__: boolean;

/** محرك DWG المضمَّن وقت البناء: معرّفه، أو 'none' لنسخة DXF فقط. */
declare const __DWG_ENGINE__: string;

/** استيراد ملفات CSS كـ side-effect (يعالجها Vite وقت البناء). */
declare module '*.css';

/** File Handling API: فتح ملفات dxf/dwg من نظام التشغيل بعد تثبيت التطبيق (manifest.file_handlers). */
interface LaunchParams {
  readonly files: ReadonlyArray<{ getFile(): Promise<File> }>;
}

interface Window {
  launchQueue?: { setConsumer(consumer: (params: LaunchParams) => void): void };
}
