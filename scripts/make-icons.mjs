// يولّد أيقونات PNG من public/icons/icon.svg (يحتاج sharp). التشغيل: npm run icons
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
const svg = await readFile(join(dir, 'icon.svg'));

const targets = [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['icon-maskable-512.png', 512], // المحتوى داخل المنطقة الآمنة، فيصلح كأيقونة maskable
  ['apple-touch-icon.png', 180],
];

for (const [name, size] of targets) {
  await sharp(svg, { density: 384 }).resize(size, size).png().toFile(join(dir, name));
  console.log(`wrote ${name} (${size}x${size})`);
}
