import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8')
  .replace(/\/\*__VERSION__\*\/\s*'dev'/, '"v1"')
  .replace(/\/\*__PRECACHE__\*\/\s*\[\]/, '["index.html"]')
  .replace(/\/\*__VENDOR_VERSION__\*\/\s*'dev'/, '"w1"')
  .replace(/\/\*__VENDOR__\*\/\s*\[\]/, '["vendor/e.js","vendor/e.wasm"]');

const SCOPE = 'http://app.test/';
type Handler = (event: Record<string, unknown>) => void;

/** يشغّل sw.js في صندوق مع caches وfetch وهميين. */
function boot(initialCaches: string[] = [], opts: { putFails?: boolean } = {}) {
  const handlers: Record<string, Handler> = {};
  const store = new Map<string, Map<string, Response>>();
  for (const n of initialCaches) store.set(n, new Map());
  const fetched: Array<{ url: string; cache?: string }> = [];
  let network: (url: string) => Response | Promise<Response> = () => new Response('net', { status: 200 });

  const key = (r: Request | string) => new URL(typeof r === 'string' ? r : r.url).href.split('?')[0] as string;
  const makeCache = (name: string) => {
    if (!store.has(name)) store.set(name, new Map());
    const m = store.get(name) as Map<string, Response>;
    return {
      match: async (r: Request | string) => m.get(key(r))?.clone(),
      put: async (r: Request | string, res: Response) => {
        if (opts.putFails || res.status === 206) throw new TypeError('not cacheable');
        m.set(key(r), res.clone());
      },
      addAll: async (rs: Request[]) => rs.forEach((r) => m.set(key(r), new Response('x'))),
      keys: async () => [...m.keys()],
    };
  };
  const sandbox: Record<string, unknown> = {
    URL, Response, Promise, console,
    // في المتصفح تُحل الروابط النسبية نسبةً للـ SW؛ في Node نحلّها نسبةً للنطاق
    Request: class extends Request {
      constructor(input: string | Request, init?: RequestInit) {
        super(typeof input === 'string' ? new URL(input, SCOPE).href : input, init);
      }
    },
    caches: {
      open: async (n: string) => makeCache(n),
      keys: async () => [...store.keys()],
      delete: async (n: string) => store.delete(n),
    },
    fetch: async (r: Request | string) => {
      const url = typeof r === 'string' ? r : r.url;
      fetched.push({ url, cache: typeof r === 'string' ? undefined : r.cache });
      return network(url);
    },
  };
  sandbox.self = {
    location: new URL(SCOPE),
    registration: { scope: SCOPE },
    clients: { claim: async () => undefined },
    skipWaiting: async () => undefined,
    addEventListener: (type: string, fn: Handler) => (handlers[type] = fn),
  };
  vm.runInNewContext(source, sandbox);

  const dispatch = async (type: string, extra: Record<string, unknown> = {}) => {
    const waits: Promise<unknown>[] = [];
    let responded: Promise<Response> | undefined;
    (handlers[type] as Handler)({
      ...extra,
      waitUntil: (p: Promise<unknown>) => waits.push(p),
      respondWith: (p: Promise<Response>) => (responded = p),
    });
    await Promise.all(waits);
    return responded;
  };
  const get = (path: string, mode = 'cors') =>
    dispatch('fetch', { request: { url: SCOPE + path, method: 'GET', mode } });
  return { store, fetched, dispatch, get, setNetwork: (f: typeof network) => (network = f) };
}

describe('service worker', () => {
  it('ملف vendor من الشبكة يُخزَّن في كاش vendor فقط ويُخدَّم أوفلاين', async () => {
    const sw = boot();
    const res = await (await sw.get('vendor/e.wasm')) as Response;
    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 0));
    expect([...(sw.store.get('cad-view-vendor-w1') ?? new Map()).keys()]).toEqual([SCOPE + 'vendor/e.wasm']);
    expect(sw.store.has('cad-view-v1')).toBe(false);
    sw.setNetwork(() => Promise.reject(new Error('offline')));
    const again = await (await sw.get('vendor/e.wasm')) as Response;
    expect(await again.text()).toBe('net');
  });

  it('استجابة 206 تُعاد للصفحة ولا تُخزَّن ولا تكسر الطلب', async () => {
    const sw = boot();
    sw.setNetwork(() => new Response('part', { status: 206 }));
    const res = await (await sw.get('vendor/e.wasm')) as Response;
    expect(res.status).toBe(206);
    expect((sw.store.get('cad-view-vendor-w1') ?? new Map()).size).toBe(0);
  });

  it('فشل التخزين لا يحوّل الاستجابة الناجحة إلى خطأ', async () => {
    const sw = boot([], { putFails: true }); // نحاكي امتلاء التخزين: put يرمي
    sw.setNetwork(() => new Response('ok', { status: 200 }));
    const res = await (await sw.get('vendor/e.js')) as Response;
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('ok');
  });

  it('activate يحذف الكاشات القديمة ويُبقي الحالي وكاش vendor الحالي', async () => {
    const sw = boot(['cad-view-v0', 'cad-view-v1', 'cad-view-vendor-w0', 'cad-view-vendor-w1', 'other-app']);
    sw.setNetwork(() => Promise.reject(new Error('offline')));
    await sw.dispatch('activate');
    expect([...sw.store.keys()].sort()).toEqual(['cad-view-v1', 'cad-view-vendor-w1', 'other-app']);
  });

  it('رسالة warm-vendor تجلب الناقص بـ cache: reload وتخزّن 200 فقط', async () => {
    const sw = boot();
    sw.setNetwork((url) => (url.endsWith('.wasm') ? new Response('', { status: 404 }) : new Response('js')));
    await sw.dispatch('message', { data: { type: 'warm-vendor' } });
    const cached = [...(sw.store.get('cad-view-vendor-w1') ?? new Map()).keys()];
    expect(cached).toEqual([SCOPE + 'vendor/e.js']);
    expect(sw.fetched.every((f) => f.cache === 'reload')).toBe(true);
  });

  it('رسالتان متزامنتان تشتركان في تنزيل واحد', async () => {
    const sw = boot();
    await Promise.all([
      sw.dispatch('message', { data: { type: 'warm-vendor' } }),
      sw.dispatch('message', { data: { type: 'warm-vendor' } }),
    ]);
    expect(sw.fetched).toHaveLength(2); // ملفان فقط لا أربعة
  });

  it('صفحات التطبيق تُخدم من كاش التطبيق، والتنقل يعيد index.html', async () => {
    const sw = boot();
    await sw.dispatch('install');
    sw.setNetwork(() => Promise.reject(new Error('offline')));
    const nav = await (await sw.get('some/route', 'navigate')) as Response;
    expect(await nav.text()).toBe('x');
  });
});
