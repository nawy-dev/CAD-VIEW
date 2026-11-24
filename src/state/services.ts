import { createStore } from '../core/storage/idb-store';
import { RecentFiles } from '../core/storage/recent';

/** خدمة الملفات الأخيرة الوحيدة في التطبيق (IndexedDB، وذاكرة مؤقتة إن لم يتوفر). */
export const recentFiles = new RecentFiles(createStore());
