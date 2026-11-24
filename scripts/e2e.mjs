// اختبار شامل في متصفح حقيقي (Chromium) على النسخة المبنية في dist/.
// التشغيل: npm run build && npm run e2e   (يحتاج: npx playwright install chromium عند أول استخدام)
// E2E_SHOTS=/path/dir لحفظ لقطات شاشة.
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, devices } from 'playwright';
import { startServer } from './static-server.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const sample = join(root, 'public', 'samples', 'sample.dxf');
const shots = process.env.E2E_SHOTS;
if (shots) mkdirSync(shots, { recursive: true });

let failed = 0;
const check = (ok, name, extra = '') => {
  console.log(`${ok ? '✓' : '✗'} ${name}${extra ? `  (${extra})` : ''}`);
  if (!ok) failed++;
};

const { server, url } = await startServer(dist);
const browser = await chromium.launch();

/** عدد البكسلات التي تخالف لون الخلفية في الـ canvas. */
const inkPixels = (page) =>
  page.evaluate(() => {
    const c = document.querySelector('[data-testid=canvas]');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    const bg = [d[0], d[1], d[2]];
    let n = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]) > 40) n++;
    }
    return n;
  });

const drawnCount = (page) =>
  page.evaluate(() => Number(document.querySelector('[data-testid=viewport]').dataset.drawn ?? 0));
const scaleOf = (page) =>
  page.evaluate(() => Number(document.querySelector('[data-testid=viewport]').dataset.scale));

/** ينتظر رسمًا كاملًا جديدًا (بعد توقف الحركة). */
async function settled(page, before) {
  await page.waitForFunction(
    (n) => Number(document.querySelector('[data-testid=viewport]').dataset.drawn ?? 0) > n,
    before ?? 0,
    { timeout: 5000 },
  );
}

async function act(page, fn) {
  const before = await drawnCount(page);
  await fn();
  await settled(page, before);
}

// ───────────────────────── سطح المكتب ─────────────────────────
{
  const context = await browser.newContext({ viewport: { width: 1100, height: 720 } });
  const page = await context.newPage();
  const problems = [];
  const external = [];
  // تحذير getImageData ناتج عن قراءة الاختبار نفسه للـ canvas وليس من التطبيق
  page.on('console', (m) => {
    if (['error', 'warning'].includes(m.type()) && !m.text().includes('willReadFrequently')) {
      problems.push(`${m.type()}: ${m.text()}`);
    }
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('request', (r) => {
    if (!r.url().startsWith(url) && !/^(data|blob):/.test(r.url())) external.push(r.url());
  });

  await page.goto(url);
  await page.waitForSelector('[data-testid=empty]');
  check((await page.title()).includes('CAD-VIEW'), 'عنوان الصفحة');
  check(
    (await page.evaluate(() => `${document.documentElement.dir}/${document.documentElement.lang}`)) === 'rtl/ar',
    'الواجهة عربية RTL افتراضيًا',
  );

  // فتح الملف النموذجي
  await page.getByTestId('open-sample').click();
  await page.waitForFunction(() => document.querySelector('[data-testid=viewport]').dataset.ready === 'true');
  await settled(page, 0);
  check((await page.getByTestId('file-name').textContent()) === 'sample.dxf', 'اسم الملف في الشريط السفلي');
  const ink = await inkPixels(page);
  check(ink > 3000, 'الرسم ظهر على الـ canvas', `${ink} px`);
  if (shots) await page.screenshot({ path: join(shots, 'desktop-dark.png') });

  // الطبقات
  await page.getByTestId('toggle-layers').click();
  const rows = page.getByTestId('layer-row');
  check((await rows.count()) === 9, 'تسع طبقات في اللوحة', String(await rows.count()));
  const draft = rows.filter({ hasText: 'DRAFT' }).locator('input');
  check(!(await draft.isChecked()), 'الطبقة المجمّدة DRAFT تبدأ مخفية');
  const walls = rows.filter({ hasText: 'WALLS' }).locator('input');
  check(await walls.isChecked(), 'طبقة WALLS ظاهرة');
  await act(page, () => walls.uncheck());
  const withoutWalls = await inkPixels(page);
  check(withoutWalls < ink, 'إخفاء WALLS يقلّل الرسم', `${ink} → ${withoutWalls}`);
  await act(page, () => draft.check());
  const withDraft = await inkPixels(page);
  check(withDraft > withoutWalls, 'إظهار DRAFT يزيد الرسم', `${withoutWalls} → ${withDraft}`);
  await act(page, () => page.getByTestId('layers-hide-all').click());
  check((await inkPixels(page)) === 0, 'إخفاء الكل = شاشة فارغة');
  await act(page, () => page.getByTestId('layers-show-all').click());
  check((await inkPixels(page)) > ink, 'إظهار الكل');
  await page.keyboard.press('Escape');
  check(
    (await page.getByTestId('layers-drawer').getAttribute('data-open')) === 'false',
    'Escape يغلق اللوحة',
  );

  // التكبير والتحريك
  const fitScale = await scaleOf(page);
  await act(page, () => page.getByTestId('zoom-in').click());
  const zoomed = await scaleOf(page);
  check(Math.abs(zoomed / fitScale - 1.5) < 1e-6, 'زر التكبير ×1.5', `${(zoomed / fitScale).toFixed(3)}`);
  await act(page, () => page.getByTestId('zoom-out').click());
  check(Math.abs((await scaleOf(page)) - fitScale) < 1e-6, 'زر التصغير يعيد المقياس');

  const box = await page.getByTestId('canvas').boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await act(page, () => page.mouse.wheel(0, -400));
  const wheeled = await scaleOf(page);
  check(wheeled > fitScale * 1.5, 'عجلة الماوس تكبّر', `${(wheeled / fitScale).toFixed(2)}×`);

  const inkBeforePan = await inkPixels(page);
  await act(page, async () => {
    await page.mouse.down();
    await page.mouse.move(cx + 140, cy + 60, { steps: 6 });
    await page.mouse.up();
  });
  check(Math.abs((await scaleOf(page)) - wheeled) < 1e-9, 'السحب لا يغيّر المقياس');
  check((await inkPixels(page)) !== inkBeforePan, 'السحب يحرّك الرسم');

  await act(page, () => page.getByTestId('fit').click());
  check(Math.abs((await scaleOf(page)) - fitScale) < 1e-6, 'زر الملاءمة يعيد العرض الأصلي');

  await act(page, () => page.mouse.dblclick(cx, cy));
  check(Math.abs((await scaleOf(page)) / fitScale - 2) < 1e-6, 'النقر المزدوج يكبّر ×2');
  await act(page, () => page.getByTestId('fit').click());

  // قرص بإصبعين (أحداث مؤشر حقيقية بمعرّفين)
  await act(page, () =>
    page.evaluate(
      ({ cx, cy }) => {
        const canvas = document.querySelector('[data-testid=canvas]');
        const r = canvas.getBoundingClientRect();
        const ev = (type, id, x, y) =>
          canvas.dispatchEvent(
            new PointerEvent(type, {
              pointerId: id,
              pointerType: 'touch',
              clientX: x,
              clientY: y,
              bubbles: true,
              isPrimary: id === 1,
            }),
          );
        const mx = cx, my = cy;
        ev('pointerdown', 1, mx - 50, my);
        ev('pointerdown', 2, mx + 50, my);
        for (let i = 1; i <= 5; i++) {
          ev('pointermove', 1, mx - 50 - i * 20, my);
          ev('pointermove', 2, mx + 50 + i * 20, my);
        }
        ev('pointerup', 1, mx - 150, my);
        ev('pointerup', 2, mx + 150, my);
        return r.width;
      },
      { cx, cy },
    ),
  );
  check((await scaleOf(page)) / fitScale > 2.5, 'القرص بإصبعين يكبّر', `${((await scaleOf(page)) / fitScale).toFixed(2)}×`);
  await act(page, () => page.getByTestId('fit').click());

  // المظهر واللغة
  await act(page, () => page.getByTestId('toggle-theme').click());
  check((await page.evaluate(() => document.documentElement.dataset.theme)) === 'light', 'تبديل المظهر للفاتح');
  if (shots) await page.screenshot({ path: join(shots, 'desktop-light.png') });
  await page.getByTestId('toggle-theme').click();
  await page.getByTestId('toggle-lang').click();
  check(
    (await page.evaluate(() => `${document.documentElement.dir}/${document.documentElement.lang}`)) === 'ltr/en',
    'تبديل اللغة للإنجليزية LTR',
  );
  await page.getByTestId('toggle-lang').click();

  // رفع ملف من المنتقي، ثم ملف DWG مرفوض
  await act(page, () => page.getByTestId('file-input').setInputFiles(sample));
  check((await page.getByTestId('file-name').textContent()) === 'sample.dxf', 'فتح ملف من منتقي الملفات');

  await page.getByTestId('file-input').setInputFiles({
    name: 'plan.dwg',
    mimeType: 'application/octet-stream',
    buffer: Buffer.concat([Buffer.from('AC1027'), Buffer.alloc(200)]),
  });
  await page.waitForSelector('[data-testid=error]');
  const message = await page.getByTestId('error').textContent();
  check(message.includes('DWG') && message.includes('2013'), 'رسالة DWG واضحة بالإصدار', message.trim().slice(0, 60));
  await page.getByTestId('file-input').setInputFiles({
    name: 'bad.dxf',
    mimeType: 'text/plain',
    buffer: Buffer.from('هذا ليس رسمًا'),
  });
  await page.waitForFunction(() => document.querySelector('[data-testid=error]')?.textContent?.includes('DXF'));
  check(true, 'ملف غير صالح يعطي رسالة خطأ');

  // الملفات الأخيرة تبقى بعد إعادة التحميل
  await page.reload();
  await page.waitForSelector('[data-testid=empty]');
  const recentItems = page.locator('[data-testid=empty] [data-testid=recent-item]');
  check((await recentItems.count()) === 1, 'الملف الأخير محفوظ بعد إعادة التحميل', String(await recentItems.count()));
  await recentItems.first().click();
  await page.waitForFunction(() => document.querySelector('[data-testid=viewport]').dataset.ready === 'true');
  check((await page.getByTestId('file-name').textContent()) === 'sample.dxf', 'فتح من الملفات الأخيرة');

  // الأوفلاين: نتأكد أن الـ service worker يتحكم ثم نقطع الشبكة
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 10000 });
  await context.setOffline(true);
  await page.reload();
  await page.waitForSelector('[data-testid=empty]');
  check((await page.getByTestId('net-status').getAttribute('data-online')) === 'false', 'يظهر أنه بدون إنترنت');
  await page.getByTestId('open-sample').click();
  await page.waitForFunction(() => document.querySelector('[data-testid=viewport]').dataset.ready === 'true');
  check(true, 'يعمل أوفلاين بالكامل (إعادة تحميل + فتح الملف النموذجي)');
  await context.setOffline(false);

  check(external.length === 0, 'لا طلبات لخارج التطبيق', external.join(', '));
  check(problems.length === 0, 'لا أخطاء ولا تحذيرات في الـ console', problems.join(' | '));
  await context.close();
}

// ───────────────────────── موبايل (لمس) ─────────────────────────
{
  const context = await browser.newContext({ ...devices['Pixel 7'] });
  const page = await context.newPage();
  await page.goto(url);
  await page.waitForSelector('[data-testid=empty]');
  await page.getByTestId('open-sample').tap();
  await page.waitForFunction(() => document.querySelector('[data-testid=viewport]').dataset.ready === 'true');
  await settled(page, 0);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(overflow <= 0, 'لا تمرير أفقي على شاشة الهاتف', `${overflow}px`);
  const topbarFits = await page.evaluate(() => {
    const bar = document.querySelector('.topbar');
    return bar.scrollWidth <= bar.clientWidth + 1;
  });
  check(topbarFits, 'الشريط العلوي يتسع للهاتف');
  const small = await page.evaluate(() =>
    [...document.querySelectorAll('.topbar button')].every((b) => b.getBoundingClientRect().width >= 38),
  );
  check(small, 'أزرار الشريط بحجم لمس مناسب');
  await page.getByTestId('toggle-layers').tap();
  check((await page.getByTestId('layers-drawer').getAttribute('data-open')) === 'true', 'لوحة الطبقات تُفتح باللمس');
  if (shots) await page.screenshot({ path: join(shots, 'mobile-layers.png') });
  await context.close();
}

await browser.close();
server.close();
console.log(failed ? `\n${failed} فشل` : '\nكل الفحوصات نجحت');
process.exit(failed ? 1 : 0);
