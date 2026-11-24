/** واجهة تخزين مفتاح/قيمة غير متزامنة: IndexedDB في المتصفح وذاكرة عادية في الاختبارات. */
export interface KeyValueStore {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
}

export class MemoryStore implements KeyValueStore {
  private readonly data = new Map<string, unknown>();

  async get<T>(key: string): Promise<T | undefined> {
    return this.data.get(key) as T | undefined;
  }

  async set(key: string, value: unknown): Promise<void> {
    this.data.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.data.delete(key);
  }

  /** للاختبارات: عدد المفاتيح المخزنة. */
  get size(): number {
    return this.data.size;
  }

  keys(): string[] {
    return [...this.data.keys()];
  }
}
