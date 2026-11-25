/**
 * سياسة أمان المحتوى (CSP) للنسخة المبنية.
 * تمنع أي اتصال أو تحميل من خارج الأصل نفسه، فتضمن أن التطبيق محلي بالكامل.
 */
export const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' blob: data:",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

/** يحقن وسم CSP داخل <head> في ملف index.html المبني. */
export function injectCsp(html: string): string {
  if (html.includes('Content-Security-Policy')) return html;
  return html.replace(
    /<head>/i,
    `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`,
  );
}
