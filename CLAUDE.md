# CAD-VIEW — تعليمات للعمل على المشروع

- الأوامر: `npm test`, `npm run typecheck`, `npm run build`, `npm run e2e` (بعد البناء), `npm run verify`.
- كل ما في `src/core` دوال نقية بلا React/DOM وتُختبر مباشرة. أضف اختبارًا مع كل إصلاح.
- ممنوع أي اتصال خارجي (CDN، خطوط، تحليلات). CSP في `scripts/csp.ts` تفرض ذلك.
- المسارات نسبية (`base: './'`) ليعمل التطبيق داخل Capacitor.
- بعد كل مرحلة: شغّل الوكيل `cad-view-reviewer` قبل الرفع.
- عند تغيير ما يخزّنه `sw.js` تأكد أن `scripts/precache.ts` يكتب الإصدار والقائمة.
