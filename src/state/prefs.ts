/** تخزين تفضيلات خفيفة (اللغة، المظهر). كل العمليات آمنة: لا ترمي حتى لو كان التخزين معطّلًا. */

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const PREFIX = 'cad-view:';

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null; // الوصول نفسه قد يرمي (وضع خاص/حظر بيانات الموقع)
  }
}

export function readPref<T extends string>(
  key: string,
  isValid: (value: string) => value is T,
  fallback: T,
  storage: StorageLike | null = defaultStorage(),
): T {
  try {
    const value = storage?.getItem(PREFIX + key);
    return value != null && isValid(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

export function writePref(key: string, value: string, storage: StorageLike | null = defaultStorage()): void {
  try {
    storage?.setItem(PREFIX + key, value);
  } catch {
    // تجاهل: التفضيلات ليست حرجة
  }
}
