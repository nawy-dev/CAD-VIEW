import { useEffect, useState } from 'react';

/** هيكل مبدئي للمرحلة 1: يثبت أن الـ PWA تعمل. تُستبدل الواجهة الكاملة في المرحلة 3. */
export function App() {
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  return (
    <main className="boot">
      <h1>CAD-VIEW</h1>
      <p>عارض الرسومات الهندسية</p>
      <p id="net-status" data-online={online}>
        {online ? 'متصل بالإنترنت' : 'يعمل بدون إنترنت'}
      </p>
    </main>
  );
}
