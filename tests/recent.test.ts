import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryStore } from '../src/core/storage/kv';
import { RecentFiles, fingerprint } from '../src/core/storage/recent';
import { toArrayBuffer } from './helpers';

const bytes = (...values: number[]): ArrayBuffer => toArrayBuffer(new Uint8Array(values));

describe('RecentFiles', () => {
  let store: MemoryStore;
  let clock: number;
  let recent: RecentFiles;

  beforeEach(() => {
    store = new MemoryStore();
    clock = 1000;
    recent = new RecentFiles(store, { maxEntries: 3, maxFileBytes: 100, now: () => ++clock });
  });

  it('قائمة فارغة في البداية', async () => {
    expect(await recent.list()).toEqual([]);
  });

  it('يرتّب الأحدث أولًا', async () => {
    await recent.add('a.dxf', bytes(1));
    await recent.add('b.dxf', bytes(2));
    const list = await recent.list();
    expect(list.map((e) => e.name)).toEqual(['b.dxf', 'a.dxf']);
    expect(list[0]).toMatchObject({ size: 1 });
  });

  it('نفس الملف مرتين: مدخل واحد يصعد للأعلى بدون تكرار بياناته', async () => {
    await recent.add('a.dxf', bytes(1, 2, 3));
    await recent.add('b.dxf', bytes(9));
    await recent.add('a.dxf', bytes(1, 2, 3));
    const list = await recent.list();
    expect(list.map((e) => e.name)).toEqual(['a.dxf', 'b.dxf']);
    expect(store.size).toBe(3); // الفهرس + بيانات الملفين
  });

  it('نفس الاسم بمحتوى مختلف = ملف مختلف', async () => {
    await recent.add('a.dxf', bytes(1));
    await recent.add('a.dxf', bytes(2));
    expect(await recent.list()).toHaveLength(2);
  });

  it('يحذف الأقدم ويحذف بياناته عند تجاوز الحد', async () => {
    for (const n of [1, 2, 3, 4]) await recent.add(`f${n}.dxf`, bytes(n));
    const list = await recent.list();
    expect(list.map((e) => e.name)).toEqual(['f4.dxf', 'f3.dxf', 'f2.dxf']);
    expect(store.size).toBe(4); // الفهرس + 3 ملفات فقط
  });

  it('يرفض الملفات الأكبر من الحد ولا يخزّن شيئًا', async () => {
    const big = toArrayBuffer(new Uint8Array(101));
    expect(await recent.add('big.dxf', big)).toBeNull();
    expect(await recent.list()).toEqual([]);
    expect(store.size).toBe(0);
  });

  it('open يعيد البيانات ويرفع المدخل للأعلى', async () => {
    const first = await recent.add('a.dxf', bytes(7, 8));
    await recent.add('b.dxf', bytes(9));
    const opened = await recent.open(first!.id);
    expect(Array.from(new Uint8Array(opened!.data))).toEqual([7, 8]);
    expect((await recent.list()).map((e) => e.name)).toEqual(['a.dxf', 'b.dxf']);
  });

  it('open لملف غير موجود يعيد null', async () => {
    expect(await recent.open('nope')).toBeNull();
  });

  it('open لمدخل بياناته مفقودة يعيد null', async () => {
    const entry = await recent.add('a.dxf', bytes(1));
    await store.delete(`recent:data:${entry!.id}`);
    expect(await recent.open(entry!.id)).toBeNull();
  });

  it('remove و clear', async () => {
    const a = await recent.add('a.dxf', bytes(1));
    await recent.add('b.dxf', bytes(2));
    await recent.remove(a!.id);
    expect((await recent.list()).map((e) => e.name)).toEqual(['b.dxf']);
    expect(store.size).toBe(2);
    await recent.clear();
    expect(await recent.list()).toEqual([]);
    expect(store.size).toBe(1); // الفهرس الفارغ فقط
  });

  it('استدعاءات متزامنة لا تُتلف الفهرس', async () => {
    await Promise.all([
      recent.add('a.dxf', bytes(1)),
      recent.add('b.dxf', bytes(2)),
      recent.add('c.dxf', bytes(3)),
    ]);
    expect(await recent.list()).toHaveLength(3);
  });
});

describe('fingerprint', () => {
  it('يختلف بتغيّر المحتوى أو الحجم', () => {
    expect(fingerprint(bytes(1, 2, 3))).not.toBe(fingerprint(bytes(1, 2, 4)));
    expect(fingerprint(bytes(1, 2, 3))).not.toBe(fingerprint(bytes(1, 2, 3, 0)));
    expect(fingerprint(bytes(1, 2, 3))).toBe(fingerprint(bytes(1, 2, 3)));
  });

  it('يلتقط التغيّر في آخر الملف الكبير', () => {
    const a = new Uint8Array(200_000);
    const b = new Uint8Array(200_000);
    b[199_999] = 1;
    expect(fingerprint(toArrayBuffer(a))).not.toBe(fingerprint(toArrayBuffer(b)));
  });
});
