import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vitest/config';
import { injectCsp } from './scripts/csp.ts';
import { writePrecache } from './scripts/precache.ts';

/** PWA: يحقن CSP في index.html ويكتب قائمة التخزين المسبق داخل sw.js بعد البناء. */
function pwa(): Plugin {
  let outDir = 'dist';
  return {
    name: 'cad-view-pwa',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    transformIndexHtml: {
      order: 'post',
      handler: (html) => injectCsp(html),
    },
    closeBundle() {
      const { version, files } = writePrecache(outDir);
      console.log(`[pwa] precache v${version}: ${files.length} files`);
    },
  };
}

export default defineConfig(({ mode }) => ({
  // مسارات نسبية ليعمل التطبيق من أي مجلد، ومن داخل Capacitor
  base: './',
  plugins: [react(), pwa()],
  define: {
    __PWA__: JSON.stringify(mode === 'production'),
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
}));
