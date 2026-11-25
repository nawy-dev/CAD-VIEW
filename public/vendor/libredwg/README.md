# LibreDWG (WASM)

محرك قراءة DWG المستخدم في CAD-VIEW. يُحمَّل محليًا عند أول فتح لملف DWG (لا CDN).

- المصدر: https://github.com/mlightcad/libredwg-web (commit 15feb51bd853d99892cbe18be842e29a06b404ce)، وهو بناء WASM لـ LibreDWG.
- الملفات: `libredwg-web.js` (ربط Emscripten) و`libredwg-web.wasm` (~7.8MB).
- **الترخيص: GNU GPL v3** (انظر `COPYING`). توزيع التطبيق متضمنًا هذه الملفات يُلزم بإتاحة المصدر بترخيص GPL-3 متوافق.
- التعديل الوحيد على الأصل: `scripts/patch-libredwg.mjs` يستبدل `new Function` في `createJsInvoker` بـ closures مطابقة السلوك،
  فيعمل التحويل تحت CSP بدون `unsafe-eval` (يحتاج فقط `wasm-unsafe-eval`).
- قيد: يبقى `new Function` واحد في `__emval_create_invoker`، ولا يُستدعى في مسار DWG→DXF (اختبار `tests/dwg.test.ts` يضمن ذلك). أي استعمال مستقبلي لواجهات `emscripten::val` سيفشل تحت CSP.
- طريقة الاستخدام: DWG ← `dwg_write_dxf` داخل نظام ملفات WASM الافتراضي ← نص DXF ← المحلل الداخلي نفسه.

لتحديثه: انسخ الملفين الجديدين من المستودع أعلاه ثم شغّل `node scripts/patch-libredwg.mjs` وبعدها `npm run verify`.
