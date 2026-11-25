# بناء نسخة أندرويد (Capacitor)

المتطلبات: Node ≥ 20.19، JDK 21، Android Studio (أو Android SDK).

```bash
npm install
npm run verify            # تأكد أن الـ PWA مستقرة أولًا
npm run cap:add           # مرة واحدة: ينشئ مجلد android/
npm run cap:sync          # يبني dist ويزامنه مع المشروع
npm run cap:open          # يفتح Android Studio للتشغيل/التوقيع
npm run cap:apk           # أو APK تجريبي مباشرة: android/app/build/outputs/apk/debug/
```

ملاحظات:
- الـ service worker لا يُسجَّل داخل Capacitor (الملفات مضمّنة في الـ APK أصلًا).
- المسارات نسبية (`base: './'`) فتعمل من `https://localhost` داخل WebView.
- فتح الملفات يتم عبر منتقي الملفات في النظام (`<input type=file>`).
- لم يُجرَّب `cap add android` في بيئة التطوير الحالية (بدون شبكة)؛ شغّله أول مرة على جهازك وأبلغ عن أي مشكلة.
- لإضافة ربط الملفات `.dxf` من مدير الملفات أضف intent-filter في `AndroidManifest.xml` بعد التوليد.
