# CAD-VIEW — عارض الرسومات الهندسية

عارض DXF يعمل **أوفلاين وأونلاين** كـ PWA، وجاهز للتغليف لأندرويد بـ Capacitor.
React + TypeScript + Vite + Vitest. **لا CDN ولا خطوط ولا خدمات خارجية**: كل شيء محلي، وسياسة CSP تمنع أي اتصال بخارج التطبيق.

## الميزات
- فتح **DXF وDWG** (DWG عبر LibreDWG WASM محلي، يُحمَّل عند الحاجة) (طبقات، كتل متداخلة، مصفوفات INSERT، أقواس وbulge، قطع ناقص، سبلاين، نصوص عربية، ألوان حقيقية…)
- تكبير/تحريك بالماوس واللمس والقرص بإصبعين والنقر المزدوج ولوحة المفاتيح (`+ - 0` والأسهم)
- لوحة طبقات (إظهار/إخفاء/بحث) والملفات الأخيرة تُحفظ على الجهاز (IndexedDB)
- عربي RTL وإنجليزي، مظهر داكن وفاتح، فتح بالسحب والإفلات

## DWG
يُحوَّل DWG إلى DXF داخل الجهاز بمحرك LibreDWG المبني WASM (`public/vendor/libredwg/`)، ثم يمرّ على نفس المحلل والعارض. يعمل أوفلاين لأن الـ service worker يخزّن المحرك.
**تنبيه ترخيص:** LibreDWG مرخّص GPL-3، فتوزيع التطبيق بهذا المحرك يستلزم توزيعه بترخيص GPL-3 متوافق (تفاصيل في `public/vendor/libredwg/README.md`).
المحدودية: التحويل يجري على الخيط الرئيسي، فقد يتجمّد العرض لحظات مع ملفات DWG الضخمة.

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
