/** يُحدَّد وقت البناء (vite.config.ts): true في النسخة المبنية فقط. */
declare const __PWA__: boolean;

/** استيراد ملفات CSS كـ side-effect (يعالجها Vite وقت البناء). */
declare module '*.css';
