/**
 * يولّد public/samples/sample.dxf: مخطط شقة تجريبي بنص عربي، يغطي أغلب أنواع الكيانات
 * (طبقات، كتل، مصفوفة INSERT، أقواس، قطع ناقص، سبلاين، نصوص، ألوان حقيقية...).
 * التشغيل: npm run sample
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const lines: string[] = [];
const pair = (code: number, value: string | number) => {
  lines.push(String(code).padStart(3, ' '), String(value));
};

const entity = (type: string, layer: string, color?: number) => {
  pair(0, type);
  pair(8, layer);
  if (color !== undefined) pair(62, color);
};

const line = (layer: string, x1: number, y1: number, x2: number, y2: number, color?: number) => {
  entity('LINE', layer, color);
  pair(10, x1);
  pair(20, y1);
  pair(11, x2);
  pair(21, y2);
};

const rect = (layer: string, x1: number, y1: number, x2: number, y2: number) => {
  entity('LWPOLYLINE', layer);
  pair(90, 4);
  pair(70, 1);
  for (const [x, y] of [
    [x1, y1],
    [x2, y1],
    [x2, y2],
    [x1, y2],
  ] as const) {
    pair(10, x);
    pair(20, y);
  }
};

const text = (
  layer: string,
  x: number,
  y: number,
  height: number,
  value: string,
  center = false,
  color?: number,
) => {
  entity('TEXT', layer, color);
  pair(10, x);
  pair(20, y);
  pair(40, height);
  pair(1, value);
  if (center) {
    pair(72, 1);
    pair(73, 2);
    pair(11, x);
    pair(21, y);
  }
};

// ───────── HEADER ─────────
pair(0, 'SECTION');
pair(2, 'HEADER');
pair(9, '$ACADVER');
pair(1, 'AC1027');
pair(9, '$INSUNITS');
pair(70, 5);
pair(0, 'ENDSEC');

// ───────── TABLES (الطبقات) ─────────
const layers: Array<[string, number, number]> = [
  ['0', 7, 0],
  ['WALLS', 7, 0],
  ['DOORS', 3, 0],
  ['WINDOWS', 4, 0],
  ['FURNITURE', 30, 0],
  ['DIMENSIONS', 2, 0],
  ['TEXT', 1, 0],
  ['GARDEN', 94, 0],
  ['DRAFT', 8, 1], // مجمّدة: تبدأ مخفية
];
pair(0, 'SECTION');
pair(2, 'TABLES');
pair(0, 'TABLE');
pair(2, 'LAYER');
pair(70, layers.length);
for (const [name, color, flags] of layers) {
  pair(0, 'LAYER');
  pair(2, name);
  pair(70, flags);
  pair(62, color);
  pair(6, 'CONTINUOUS');
}
pair(0, 'ENDTAB');
pair(0, 'ENDSEC');

// ───────── BLOCKS ─────────
pair(0, 'SECTION');
pair(2, 'BLOCKS');

// باب: ضلفة + قوس فتح. عناصره على الطبقة 0 وبلون BYBLOCK فترث طبقة ولون الـ INSERT
pair(0, 'BLOCK');
pair(8, '0');
pair(2, 'DOOR');
pair(70, 0);
pair(10, 0);
pair(20, 0);
entity('LINE', '0', 0);
pair(10, 0);
pair(20, 0);
pair(11, 0);
pair(21, 90);
entity('ARC', '0', 0);
pair(10, 0);
pair(20, 0);
pair(40, 90);
pair(50, 0);
pair(51, 90);
pair(0, 'ENDBLK');
pair(8, '0');

// كرسي: دائرة + مسند
pair(0, 'BLOCK');
pair(8, '0');
pair(2, 'CHAIR');
pair(70, 0);
pair(10, 0);
pair(20, 0);
entity('CIRCLE', 'FURNITURE');
pair(10, 0);
pair(20, 0);
pair(40, 18);
entity('ARC', 'FURNITURE');
pair(10, 0);
pair(20, 0);
pair(40, 26);
pair(50, 20);
pair(51, 160);
pair(0, 'ENDBLK');
pair(8, '0');

pair(0, 'ENDSEC');

// ───────── ENTITIES ─────────
pair(0, 'SECTION');
pair(2, 'ENTITIES');

// الجدران: مستطيلان للجدار الخارجي + جدران داخلية
rect('WALLS', 0, 0, 1000, 800);
rect('WALLS', 20, 20, 980, 780);
rect('WALLS', 490, 20, 510, 520);
rect('WALLS', 20, 490, 490, 510);
rect('WALLS', 510, 400, 980, 420);

// زاوية مقوّسة (bulge) على شكل مدخل
entity('LWPOLYLINE', 'WALLS');
pair(90, 3);
pair(70, 0);
pair(10, 600);
pair(20, 20);
pair(42, 0.6);
pair(10, 760);
pair(20, 20);
pair(10, 760);
pair(20, 120);

// الأبواب (INSERT بدوران وتحجيم مختلفين)
for (const [x, y, rot, sx] of [
  [330, 20, 0, 1],
  [510, 300, 90, 1],
  [150, 490, 0, 1],
  [700, 400, 0, -1],
] as const) {
  entity('INSERT', 'DOORS');
  pair(2, 'DOOR');
  pair(10, x);
  pair(20, y);
  pair(41, sx);
  pair(42, 1);
  pair(50, rot);
}

// النوافذ
for (const [x1, y1, x2, y2] of [
  [120, 0, 260, 0],
  [120, 20, 260, 20],
  [700, 0, 880, 0],
  [700, 20, 880, 20],
  [1000, 200, 1000, 340],
  [980, 200, 980, 340],
] as const) {
  line('WINDOWS', x1, y1, x2, y2);
}

// طاولة (قطع ناقص) وكراسي (مصفوفة INSERT 4×1)
entity('ELLIPSE', 'FURNITURE');
pair(10, 250);
pair(20, 650);
pair(11, 90);
pair(21, 0);
pair(40, 0.55);
pair(41, 0);
pair(42, 6.283185307179586);
entity('INSERT', 'FURNITURE');
pair(2, 'CHAIR');
pair(10, 175);
pair(20, 590);
pair(70, 4);
pair(71, 1);
pair(44, 50);
pair(45, 0);

// سبلاين: ممر الحديقة
entity('SPLINE', 'GARDEN');
pair(70, 8);
pair(71, 3);
pair(72, 10);
pair(73, 6);
for (const k of [0, 0, 0, 0, 1, 2, 3, 3, 3, 3]) pair(40, k);
for (const [x, y] of [
  [1050, 0],
  [1150, 150],
  [1080, 320],
  [1220, 480],
  [1130, 640],
  [1260, 780],
] as const) {
  pair(10, x);
  pair(20, y);
}

// عمود دائري + نقطة + سهم الشمال (SOLID) + مسار بلون حقيقي 420
entity('CIRCLE', 'WALLS');
pair(10, 500);
pair(20, 600);
pair(40, 12);
entity('POINT', 'DIMENSIONS');
pair(10, 1000);
pair(20, 800);
entity('SOLID', 'DIMENSIONS');
pair(10, 1180);
pair(20, 700);
pair(11, 1210);
pair(21, 700);
pair(12, 1180);
pair(22, 760);
pair(13, 1210);
pair(23, 760);
entity('LINE', 'GARDEN');
pair(420, 0xff8800);
pair(10, 1050);
pair(20, 820);
pair(11, 1280);
pair(21, 820);

// الأبعاد
line('DIMENSIONS', 0, -40, 1000, -40);
line('DIMENSIONS', 0, -50, 0, -30);
line('DIMENSIONS', 1000, -50, 1000, -30);
text('DIMENSIONS', 500, -35, 14, '1000', true);
line('DIMENSIONS', -40, 0, -40, 800);
line('DIMENSIONS', -50, 0, -30, 0);
line('DIMENSIONS', -50, 800, -30, 800);
text('DIMENSIONS', -55, 400, 14, '800', true);

// أسماء الغرف (عربي)
text('TEXT', 250, 300, 26, 'غرفة المعيشة', true);
text('TEXT', 250, 650, 22, 'الطعام', true, 3);
text('TEXT', 740, 210, 26, 'غرفة النوم', true);
text('TEXT', 740, 600, 26, 'المطبخ', true);
text('TEXT', 100, 560, 18, 'حمام', true);

// عنوان متعدد الأسطر (MTEXT)
entity('MTEXT', 'TEXT');
pair(10, 0);
pair(20, -120);
pair(40, 24);
pair(71, 7);
pair(1, '{\\fArial|b1;مخطط شقة تجريبي}\\PCAD-VIEW sample plan');

// طبقة مجمّدة: لا تظهر حتى تُفعَّل من لوحة الطبقات
line('DRAFT', 0, 0, 1000, 800);
line('DRAFT', 0, 800, 1000, 0);

pair(0, 'ENDSEC');
pair(0, 'EOF');

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'samples', 'sample.dxf');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, lines.join('\n') + '\n', 'utf8');
console.log(`wrote ${out} (${lines.length / 2} group pairs)`);
