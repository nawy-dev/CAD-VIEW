import { MemoryStore, type KeyValueStore } from './kv';

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });
}

/** تخزين دائم في IndexedDB (يعمل أوفلاين ويبقى بعد إغلاق التطبيق). */
export class IdbStore implements KeyValueStore {
  private db: Promise<IDBDatabase> | null = null;

  constructor(
    private readonly dbName = 'cad-view',
    private readonly storeName = 'kv',
  ) {}

  private open(): Promise<IDBDatabase> {
    this.db ??= new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(this.dbName, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(this.storeName);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
    });
    return this.db;
  }

  async get<T>(key: string): Promise<T | undefined> {
    const db = await this.open();
    const store = db.transaction(this.storeName, 'readonly').objectStore(this.storeName);
    return (await request(store.get(key))) as T | undefined;
  }

  async set(key: string, value: unknown): Promise<void> {
    const db = await this.open();
    const tx = db.transaction(this.storeName, 'readwrite');
    tx.objectStore(this.storeName).put(value, key);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB write failed'));
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB write aborted'));
    });
  }

  async delete(key: string): Promise<void> {
    const db = await this.open();
    const tx = db.transaction(this.storeName, 'readwrite');
    tx.objectStore(this.storeName).delete(key);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB delete failed'));
    });
  }
}

/** IndexedDB إن توفّر، وإلا ذاكرة مؤقتة (مثلًا في بعض أوضاع التصفح الخاص). */
export function createStore(): KeyValueStore {
  return typeof indexedDB === 'undefined' ? new MemoryStore() : new IdbStore();
}
