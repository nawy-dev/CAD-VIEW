import { formatBytes, formatRelative } from '../i18n/format';
import type { Lang, Strings } from '../i18n/strings';
import type { RecentEntry } from '../core/storage/recent';
import { IconFile, IconTrash } from './icons';

interface Props {
  entries: readonly RecentEntry[];
  lang: Lang;
  t: Strings;
  onOpen: (id: string) => void;
  onRemove?: (id: string) => void;
  onClear?: () => void;
  /** أقصى عدد يُعرض (للشاشة الفارغة). */
  limit?: number;
}

/** قائمة الملفات التي فُتحت مؤخرًا (محفوظة محليًا لفتحها لاحقًا بدون إنترنت). */
export function RecentList({ entries, lang, t, onOpen, onRemove, onClear, limit }: Props) {
  const now = Date.now();
  const list = limit ? entries.slice(0, limit) : entries;

  if (list.length === 0) return <p className="muted pad">{t.recentEmpty}</p>;

  return (
    <div className="recent">
      <ul className="recent-list">
        {list.map((entry) => (
          <li key={entry.id} className="recent-item">
            <button type="button" className="recent-open" onClick={() => onOpen(entry.id)} data-testid="recent-item">
              <IconFile />
              <span className="recent-text">
                <span className="recent-name" dir="auto">
                  {entry.name}
                </span>
                <span className="recent-meta">
                  <bdi>{formatBytes(entry.size)}</bdi> · {formatRelative(entry.openedAt, now, lang)}
                </span>
              </span>
            </button>
            {onRemove && (
              <button
                type="button"
                className="icon-btn"
                onClick={() => onRemove(entry.id)}
                aria-label={`${t.remove}: ${entry.name}`}
                title={t.remove}
              >
                <IconTrash />
              </button>
            )}
          </li>
        ))}
      </ul>
      {onClear && (
        <button type="button" className="btn small clear" onClick={onClear}>
          {t.recentClear}
        </button>
      )}
    </div>
  );
}
