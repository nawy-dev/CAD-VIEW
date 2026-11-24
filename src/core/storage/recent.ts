import type { KeyValueStore } from './kv';

export interface RecentEntry {
  id: string;
  name: string;
  size: number;
  /** وقت آخر فتح (ms). */
  openedAt: number;
}

export interface RecentOptions {
  /** أقصى عدد ملفات محفوظة. */
  maxEntries?: number;
  /** أكبر حجم ملف يُحفظ للفتح السريع لاحقًا. */
  maxFileBytes?: number;
  now?: () => number;
}

const INDEX_KEY = 'recent:index';
const dataKey = (id: string) => `recent:data:${id}`;

/** بصمة سريعة (FNV-1a) على أول وآخر 64KB مع الحجم، لتمييز الملفات بدون قراءة كاملة. */
export function fingerprint(data: ArrayBuffer): string {
  const bytes = new Uint8Array(data);
  let hash = 0x811c9dc5;
  const mix = (from: number, to: number) => {
    for (let i = from; i < to; i++) {
      hash ^= bytes[i] as number;
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
  };
  const window = 65536;
  mix(0, Math.min(window, bytes.length));
  if (bytes.length > window) mix(Math.max(window, bytes.length - window), bytes.length);
  return `${bytes.length.toString(36)}-${hash.toString(36)}`;
}

/** قائمة الملفات الأخيرة: تحفظ بيانات الملف نفسه ليُفتح لاحقًا حتى بدون إنترنت. */
export class RecentFiles {
  private readonly maxEntries: number;
  private readonly maxFileBytes: number;
  private readonly now: () => number;
  /** تسلسل العمليات لمنع تلف الفهرس عند استدعاءات متزامنة. */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly store: KeyValueStore,
    options: RecentOptions = {},
  ) {
    this.maxEntries = options.maxEntries ?? 8;
    this.maxFileBytes = options.maxFileBytes ?? 30 * 1024 * 1024;
    this.now = options.now ?? Date.now;
  }

  private serial<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async readIndex(): Promise<RecentEntry[]> {
    return (await this.store.get<RecentEntry[]>(INDEX_KEY)) ?? [];
  }

  list(): Promise<RecentEntry[]> {
    return this.serial(async () => (await this.readIndex()).sort((a, b) => b.openedAt - a.openedAt));
  }

  /** يضيف الملف (أو يرفعه لأعلى القائمة إن كان موجودًا). يعيد null إذا كان أكبر من الحد. */
  add(name: string, data: ArrayBuffer): Promise<RecentEntry | null> {
    return this.serial(async () => {
      if (data.byteLength > this.maxFileBytes) return null;
      const id = `${name}:${fingerprint(data)}`;
      const entry: RecentEntry = { id, name, size: data.byteLength, openedAt: this.now() };

      const existing = await this.readIndex();
      const already = existing.some((e) => e.id === id);
      if (!already) await this.store.set(dataKey(id), data);

      const next = [entry, ...existing.filter((e) => e.id !== id)]
        .sort((a, b) => b.openedAt - a.openedAt);
      const kept = next.slice(0, this.maxEntries);
      await this.store.set(INDEX_KEY, kept);
      for (const dropped of next.slice(this.maxEntries)) await this.store.delete(dataKey(dropped.id));
      return entry;
    });
  }

  /** يقرأ بيانات ملف محفوظ ويرفعه لأعلى القائمة. */
  open(id: string): Promise<{ entry: RecentEntry; data: ArrayBuffer } | null> {
    return this.serial(async () => {
      const index = await this.readIndex();
      const found = index.find((e) => e.id === id);
      const data = await this.store.get<ArrayBuffer>(dataKey(id));
      if (!found || !data) return null;
      const entry = { ...found, openedAt: this.now() };
      await this.store.set(INDEX_KEY, [entry, ...index.filter((e) => e.id !== id)]);
      return { entry, data };
    });
  }

  remove(id: string): Promise<void> {
    return this.serial(async () => {
      const index = await this.readIndex();
      await this.store.set(INDEX_KEY, index.filter((e) => e.id !== id));
      await this.store.delete(dataKey(id));
    });
  }

  clear(): Promise<void> {
    return this.serial(async () => {
      for (const e of await this.readIndex()) await this.store.delete(dataKey(e.id));
      await this.store.set(INDEX_KEY, []);
    });
  }
}
