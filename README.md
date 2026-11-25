# CAD-VIEW — عارض الرسومات الهندسية

عارض DXF يعمل **أوفلاين وأونلاين** كـ PWA، وجاهز للتغليف لأندرويد بـ Capacitor.
React + TypeScript + Vite + Vitest. **لا CDN ولا خطوط ولا خدمات خارجية**: كل شيء محلي، وسياسة CSP تمنع أي اتصال بخارج التطبيق.

## الميزات
- فتح DXF (طبقات، كتل متداخلة، مصفوفات INSERT، أقواس وbulge، قطع ناقص، سبلاين، نصوص عربية، ألوان حقيقية…)
- تكبير/تحريك بالماوس واللمس والقرص بإصبعين والنقر المزدوج ولوحة المفاتيح (`+ - 0` والأسهم)
- لوحة طبقات (إظهار/إخفاء/بحث) والملفات الأخيرة تُحفظ على الجهاز (IndexedDB)
- عربي RTL وإنجليزي، مظهر داكن وفاتح، فتح بالسحب والإفلات

## الحالة الراهنة لـ DWG
**DWG غير مدعوم بعد** (صيغة مغلقة تحتاج محوّلًا). التطبيق يتعرف عليه ويعرض رسالة واضحة بالإصدار تطلب التصدير كـ DXF. الخطة: إضافة LibreDWG مبنيًا كـ WASM داخل `public/vendor/` وتحميله محليًا.

## التشغيل
```bash
npm install
npm run dev          # تطوير
npm test             # اختبارات الوحدة (Vitest)
npm run typecheck
npm run build        # يولّد dist/ مع service worker وCSP
npx playwright install chromium   # مرة واحدة
npm run e2e          # اختبار متصفح حقيقي على dist/ (أوفلاين، لمس، ملفات أخيرة)
npm run verify       # كل ما سبق
```

## البنية
```
src/core/      منطق نقي بلا DOM: dxf/ geometry/ scene/ render/ view/ storage/
src/loader/    كشف الصيغة والترميز وفتح الملف
src/components, src/App.tsx, src/i18n   الواجهة
public/sw.js   service worker (يُحقن إصداره وقائمة ملفاته وقت البناء)
scripts/       e2e، سيرفر ثابت، توليد الأيقونات والملف التجريبي
```
راجع `PLAN.md` للمراحل، و`.claude/agents/cad-view-reviewer.md` للوكيل المراجع.
