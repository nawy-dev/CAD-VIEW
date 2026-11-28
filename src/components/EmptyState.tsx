import type { RecentEntry } from '../core/storage/recent';
import type { Lang, Strings } from '../i18n/strings';
import { dwgEnabled } from '../loader/dwg/registry';
import { IconOpen, LogoMark } from './icons';
import { RecentList } from './RecentList';

interface Props {
  t: Strings;
  lang: Lang;
  recent: readonly RecentEntry[];
  onPick: () => void;
  onSample: () => void;
  onOpenRecent: (id: string) => void;
}

/** الشاشة الأولى قبل فتح أي ملف. */
export function EmptyState({ t, lang, recent, onPick, onSample, onOpenRecent }: Props) {
  return (
    <section className="empty" data-testid="empty">
      <div className="empty-card">
        <div className="empty-logo">
          <LogoMark />
        </div>
        <h1>{t.appName}</h1>
        <p className="tagline">{t.tagline}</p>
        <div className="empty-actions">
          <button type="button" className="btn primary large" onClick={onPick} data-testid="empty-open">
            <IconOpen />
            <span>{t.open}</span>
          </button>
          <button type="button" className="btn large" onClick={onSample} data-testid="open-sample">
            {t.openSample}
          </button>
        </div>
        <p className="muted">{t.dropHint}</p>
        <p className="muted small">{dwgEnabled() ? t.formatsHint : t.formatsHintDxfOnly}</p>
        {recent.length > 0 && (
          <div className="empty-recent">
            <h2>{t.recentTitle}</h2>
            <RecentList entries={recent} lang={lang} t={t} onOpen={onOpenRecent} limit={4} />
          </div>
        )}
      </div>
    </section>
  );
}
