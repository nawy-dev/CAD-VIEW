import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vitest/config';
import { injectCsp } from './scripts/csp.ts';
import { applyDwgEngine, resolveDwgEngine, stripDwgText } from './scripts/dwg-build.ts';
import { writePrecache } from './scripts/precache.ts';

/** PWA: يحقن CSP في index.html ويكتب قائمة التخزين المسبق داخل sw.js بعد البناء. */
function pwa(engine: string): Plugin {
  let outDir = 'dist';
  return {
    name: 'cad-view-pwa',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    transformIndexHtml: {
      order: 'post',
      handler: (html) => injectCsp(engine === 'none' ? stripDwgText(html) : html),
    },
    closeBundle() {
      applyDwgEngine(outDir, engine);
      const { version, files } = writePrecache(outDir);
      console.log(`[pwa] precache v${version}: ${files.length} files`);
    },
  };
}

export default defineConfig(({ mode, command }) => {
  // CADVIEW_DWG=none أو --mode nodwg: نسخة DXF فقط بدون أي محرك DWG. راجع docs/DWG-ENGINES.md
  const engine = resolveDwgEngine(mode, process.env.CADVIEW_DWG);
  return {
    // مسارات نسبية ليعمل التطبيق من أي مجلد، ومن داخل Capacitor
    base: './',
    plugins: [react(), pwa(engine)],
    define: {
      // الـ service worker يُسجَّل في النسخة المبنية فقط (وليس في خادم التطوير)
      __PWA__: JSON.stringify(command === 'build'),
      __DWG_ENGINE__: JSON.stringify(engine),
    },
    // Worker بصيغة ES ليستطيع تحميل محرك WASM بـ import()
    worker: { format: 'es' },
    build: {
      target: 'es2022',
      sourcemap: false,
    },
    test: {
      environment: 'node',
      include: ['tests/**/*.test.ts'],
    },
  };
});
