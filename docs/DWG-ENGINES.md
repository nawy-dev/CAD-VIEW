# محركات DWG القابلة للتبديل

التطبيق لا يعتمد على LibreDWG مباشرة. كل ما يحتاجه من أي محرك: **بايتات DWG ← نص DXF**،
ثم يمرّر الناتج على المحلل والعارض نفسيهما، فتبديل المحرك لا يمسّ الواجهة ولا المحلل ولا الرسم.

```
ملف .dwg ─► open.worker ─► DwgProvider.create(baseUrl).convert() ─► DXF ─► المحلل ─► المشهد ─► الرسم
                              ▲ هنا فقط يختلف المحرك
```

## العقد (`src/loader/dwg/provider.ts`)
```ts
interface DwgConverter { convert(bytes: Uint8Array): Promise<Uint8Array>; reset?(): void }
interface DwgProvider  { id; label; license /* SPDX */; assetDir; create(baseUrl): DwgConverter }
```
- `convert` يرمي `LoadError` (`PARSE` للملف التالف، `DWG_ENGINE` لتعذّر تحميل المحرك، `EMPTY` للناتج الفارغ)؛ الواجهة تعرض الرسالة المترجمة تلقائيًا.
- يعمل داخل Web Worker؛ لا تلمس `window`/`document` (استعمل `baseUrl` لحساب روابط ملفاتك).
- لا اتصال خارجي: ضع ملفاتك داخل `public/` (يخدمها التطبيق ويخزّنها الـ service worker).

## إضافة محرك جديد (4 خطوات، ملفان خارج المحرك نفسه)
1. ضع ملفاته في `public/vendor/<id>/` (مع ملف الترخيص). **يجب أن يكون تحت `vendor/`**: الـ service worker يخزّن هذا المسار في كاش مستقل ولا يُفشل تثبيت التطبيق إن تعذّر تنزيله.
2. أنشئ `src/loader/dwg/<id>.ts` يصدّر `DwgProvider` (انظر `libredwg.ts` نموذجًا).
3. سجّله: سطر في `src/loader/dwg/engines.ts` (الترخيص والمجلد؛ مصدر واحد يقرؤه البناء والتطبيق) وcase في `providerFor()` داخل `src/loader/dwg/registry.ts`. معرّف مجهول يرمي خطأً بدل أن يختفي DWG بصمت، وتفحص الاختبارات أن كل محرك مسجَّل بنفس الترخيص والمجلد.
4. ابنِ به: `CADVIEW_DWG=<id> npm run build`. اختبر بملفات DWG حقيقية على غرار `tests/dwg.test.ts` ثم `npm run verify`.

> قيود يجب أن يحترمها المحرك الجديد:
> - الـ CSP تسمح بـ `wasm-unsafe-eval` فقط (لا `unsafe-eval`)؛ لذلك لا يستعمل `eval` ولا `new Function`. محرك يحتاج غير ذلك يستلزم تعديل `scripts/csp.ts` عن قصد.
> - بدون اتصال خارجي، ويعمل داخل Worker بلا `window`/`document`.
> - اختبار `scripts/e2e.mjs` الخاص بتسخين الكاش يتحقق حاليًا من أسماء ملفات LibreDWG؛ عدّله لأسماء ملفات محركك.
> - المقارنة بـ `__DWG_ENGINE__` في الـ registry تُطوى وقت البناء فيُحذف كود المحركات غير المختارة من الحزمة.

## أنواع البناء
| الأمر | النتيجة |
|---|---|
| `npm run build` | DXF + DWG بمحرك LibreDWG (ترخيص المجموع GPL-3) |
| `npm run build:nodwg` | DXF فقط → `dist-nodwg/`، بلا أي كود أو ملفات من LibreDWG، و`.dwg` يُزال من الواجهة و`manifest` |
| `CADVIEW_DWG=<id> npm run build` | بمحرك مسجَّل آخر |

بناء `nodwg`:
- يُظهر رسالة واضحة عند فتح DWG ("غير مدعوم في هذه النسخة، صدّره DXF")، ويزيل `.dwg` من منتقي الملفات و`file_handlers` ووصف الـ manifest والـ meta، ويشتغل DXF كالمعتاد.
- لا يحتوي أي كود أو ملفات من LibreDWG (يتحقق CI من ذلك). **الحكم على ترخيص ما تبقى يخصّك ويخصّ مستشارك القانوني**؛ الكود المرفق في المستودع لا يضمّنه، لكن المستودع نفسه ما زال يحتوي `public/vendor/libredwg` تحت GPL ما لم تحذفه.
- لأندرويد: `CAP_WEB_DIR=dist-nodwg npx cap sync android` بعد `npm run build:nodwg`.

## خيارات المحرك (حالتها حتى نوفمبر 2026، تحقّق قبل الاعتماد)
| المحرك | الترخيص | ملاحظات |
|---|---|---|
| LibreDWG (الحالي) | GPL-3.0-or-later | ناضج؛ يلزم توزيع المصدر بـ GPL-3 |
| opendwg (Rust) | MIT / Apache-2.0 | قراءة R2000–R2018؛ مشروع صغير بلا إصدارات، لم يُجرَّب هنا |
| dwg-rs (Rust) | Apache-2.0 | pre-alpha، لا يُنصح بالإنتاج بعد |
| Open Design Alliance (Teigha) / RealDWG | تجاري | ناضج جدًا؛ بعقد وفلوس |

أي محرك Rust يلزمه بناء إلى WASM وتغليف يحوّل إلى DXF (أو توسيع العقد لإرجاع الكيانات مباشرة لاحقًا). قبل اعتماده شغّل عليه كل ملفات `tests/fixtures/*.dwg` وملفاتك الحقيقية، وراقب الذاكرة مع ملفات كبيرة.
