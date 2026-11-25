// سيرفر ملفات ثابتة صغير بدون اعتماديات، يُستخدم في اختبار المتصفح (e2e) على مجلد dist.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.dxf': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
};

/** يشغّل السيرفر على منفذ حر ويعيد { server, port, url }. */
export function startServer(root, port = 0) {
  const base = resolve(root);
  const server = createServer(async (req, res) => {
    try {
      const { pathname } = new URL(req.url ?? '/', 'http://localhost');
      let rel = decodeURIComponent(pathname);
      if (rel.endsWith('/')) rel += 'index.html';
      const file = resolve(join(base, rel));
      if (file !== base && !file.startsWith(base + sep)) {
        res.writeHead(403).end('forbidden');
        return;
      }
      const body = await readFile(file);
      res.writeHead(200, {
        'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
        'cache-control': 'no-cache',
      });
      res.end(body);
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  return new Promise((resolveStart) => {
    server.listen(port, '127.0.0.1', () => {
      const { port: actual } = server.address();
      resolveStart({ server, port: actual, url: `http://127.0.0.1:${actual}/` });
    });
  });
}
