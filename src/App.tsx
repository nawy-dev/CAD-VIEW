import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from 'react';
import { Drawer } from './components/Drawer';
import { EmptyState } from './components/EmptyState';
import { IconAlert, IconClock, IconGlobe, IconLayers, IconMoon, IconOpen, IconSun, LogoMark } from './components/icons';
import { LayerPanel } from './components/LayerPanel';
import { RecentList } from './components/RecentList';
import { BACKGROUND, Viewport } from './components/Viewport';
import type { Theme } from './core/render/aci';
import type { RecentEntry } from './core/storage/recent';
import { formatBytes, formatCount } from './i18n/format';
import { isLang, strings, type Lang } from './i18n/strings';
import { openDrawingFile, toErrorInfo, type Drawing, type ErrorInfo, type OpenStage } from './loader/openDrawing';
import { readPref, writePref } from './state/prefs';
import { recentFiles } from './state/services';

const isTheme = (v: string): v is Theme => v === 'dark' || v === 'light';

type Panel = 'layers' | 'recent' | null;

/** ننتظر رسم الشاشة (أو 100ms كحد أقصى) ليظهر مؤشر التحميل قبل التحليل الثقيل. */
const nextPaint = () =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, 100);
    requestAnimationFrame(() => {
      clearTimeout(timer);
      setTimeout(resolve, 0);
    });
  });

function useOnline(): boolean {
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
  return online;
}

export function App() {
  const [lang, setLang] = useState<Lang>(() => readPref('lang', isLang, 'ar'));
  const [theme, setTheme] = useState<Theme>(() => readPref('theme', isTheme, 'dark'));
  const [drawing, setDrawing] = useState<Drawing | null>(null);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<OpenStage | null>(null);
  const [error, setError] = useState<ErrorInfo | null>(null);
  const [notesDismissed, setNotesDismissed] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [recent, setRecent] = useState<RecentEntry[]>([]);
  const [dragging, setDragging] = useState(false);
  const online = useOnline();
  const t = strings[lang];
  const fileInput = useRef<HTMLInputElement | null>(null);
  const token = useRef(0);
  const nameOverride = useRef<string | null>(null);

  // اللغة والمظهر على مستوى الصفحة
  useEffect(() => {
    const root = document.documentElement;
    root.lang = lang;
    root.dir = lang === 'ar' ? 'rtl' : 'ltr';
    root.dataset['theme'] = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', BACKGROUND[theme]);
    writePref('lang', lang);
    writePref('theme', theme);
  }, [lang, theme]);

  useEffect(() => {
    document.title = drawing ? `${drawing.name} – ${t.appName}` : `${t.appName} – ${t.tagline}`;
  }, [drawing, t]);

  const refreshRecent = useCallback(async () => {
    try {
      setRecent(await recentFiles.list());
    } catch {
      // التخزين غير متاح: القائمة تبقى فارغة
    }
  }, []);

  useEffect(() => {
    void refreshRecent();
  }, [refreshRecent]);

  /** يفتح ملفًا: يقرأه، يحلله، يعرضه، ثم (اختياريًا) يحفظه في الأخيرة. */
  const open = useCallback(
    async (name: string, read: () => Promise<ArrayBuffer>, remember: boolean) => {
      const mine = ++token.current;
      setBusy(true);
      setStage(null);
      setError(null);
      try {
        const data = await read();
        await nextPaint();
        if (mine !== token.current) return;
        const next = await openDrawingFile(nameOverride.current ?? name, data, (s) => {
          if (mine === token.current) setStage(s);
        });
        if (mine !== token.current) return;
        nameOverride.current = null;
        setDrawing(next);
        setHidden(new Set(next.scene.layers.filter((l) => l.hiddenByDefault).map((l) => l.name)));
        setNotesDismissed(false);
        setPanel(null);
        // الحفظ في الأخيرة لا يُبقي مؤشر التحميل ظاهرًا
        void (remember ? recentFiles.add(name, data).catch(() => null) : Promise.resolve()).then(refreshRecent);
      } catch (e) {
        if (mine === token.current) setError(toErrorInfo(e));
      } finally {
        if (mine === token.current) setBusy(false);
      }
    },
    [refreshRecent],
  );

  const openFile = useCallback(
    (file: File) => open(file.name, () => file.arrayBuffer(), true),
    [open],
  );

  const openSample = useCallback(
    () =>
      open(
        'sample.dxf',
        async () => {
          const res = await fetch('samples/sample.dxf');
          if (!res.ok) throw new DOMException('sample', 'NotFoundError');
          return res.arrayBuffer();
        },
        false,
      ),
    [open],
  );

  const openRecent = useCallback(
    (id: string) =>
      open(
        '',
        async () => {
          const item = await recentFiles.open(id);
          if (!item) throw new DOMException('recent', 'NotFoundError');
          nameOverride.current = item.entry.name;
          return item.data;
        },
        false,
      ),
    [open],
  );

  // فتح الملفات من نظام التشغيل بعد تثبيت التطبيق (File Handling API)
  useEffect(() => {
    window.launchQueue?.setConsumer(async (params) => {
      const handle = params.files[0];
      if (handle) void openFile(await handle.getFile());
    });
  }, [openFile]);

  // Escape يغلق اللوحة المفتوحة
  useEffect(() => {
    if (!panel) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPanel(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [panel]);

  const onPicked = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = ''; // للسماح بإعادة اختيار نفس الملف
    if (file) void openFile(file);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) void openFile(file);
  };

  const toggleLayer = (name: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (!next.delete(name)) next.add(name);
      return next;
    });

  const layers = drawing?.scene.layers ?? [];
  const visibleLayers = layers.filter((l) => !hidden.has(l.name)).length;

  const notes = useMemo(() => {
    if (!drawing || notesDismissed) return [];
    const { stats } = drawing.scene;
    const out: string[] = [];
    if (stats.primitives === 0) out.push(t.noGeometry);
    if (stats.truncated) out.push(t.truncated);
    const list = Object.entries(stats.unsupported)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([type, n]) => `${type}×${formatCount(n)}`)
      .join(lang === 'ar' ? '، ' : ', ');
    if (list) out.push(t.unsupported(list));
    return out;
  }, [drawing, notesDismissed, t, lang]);

  const togglePanel = (p: Exclude<Panel, null>) => setPanel((cur) => (cur === p ? null : p));

  return (
    <div
      className="app"
      onDragOver={(e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e: DragEvent<HTMLDivElement>) => {
        if (e.currentTarget === (e as unknown as { target: unknown }).target) setDragging(false);
      }}
      onDrop={onDrop}
    >
      <header className="topbar">
        <div className="brand">
          <LogoMark />
          <span>{t.appName}</span>
        </div>
        <button type="button" className="btn primary" onClick={() => fileInput.current?.click()} data-testid="open">
          <IconOpen />
          <span className="btn-label">{t.open}</span>
        </button>
        <button
          type="button"
          className="btn"
          aria-pressed={panel === 'recent'}
          onClick={() => togglePanel('recent')}
          aria-label={t.recent}
          data-testid="toggle-recent"
        >
          <IconClock />
          <span className="btn-label">{t.recent}</span>
        </button>
        <button
          type="button"
          className="btn"
          disabled={!drawing}
          aria-pressed={panel === 'layers'}
          onClick={() => togglePanel('layers')}
          aria-label={t.layers}
          data-testid="toggle-layers"
        >
          <IconLayers />
          <span className="btn-label">{t.layers}</span>
          {drawing && layers.length > 0 && (
            <span className="badge">
              {visibleLayers}/{layers.length}
            </span>
          )}
        </button>
        <button
          type="button"
          className="icon-btn"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          aria-label={theme === 'dark' ? t.toLight : t.toDark}
          title={theme === 'dark' ? t.toLight : t.toDark}
          data-testid="toggle-theme"
        >
          {theme === 'dark' ? <IconSun /> : <IconMoon />}
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
          data-testid="toggle-lang"
        >
          <IconGlobe />
          <span className="btn-label">{t.switchLang}</span>
        </button>
        <input
          ref={fileInput}
          type="file"
          hidden
          accept=".dxf,.dwg,.DXF,.DWG,image/vnd.dxf,image/vnd.dwg,application/dxf,application/acad,application/octet-stream"
          onChange={onPicked}
          data-testid="file-input"
        />
      </header>

      {error && (
        <div className="banner error" role="alert" data-testid="error">
          <IconAlert />
          <p>{t.errors[error.code](error.detail)}</p>
          <button type="button" className="btn small" onClick={() => setError(null)}>
            {t.dismiss}
          </button>
        </div>
      )}
      {notes.length > 0 && (
        <div className="banner note" role="status" data-testid="notes">
          <IconAlert />
          <div>
            {notes.map((n) => (
              <p key={n}>{n}</p>
            ))}
          </div>
          <button type="button" className="btn small" onClick={() => setNotesDismissed(true)}>
            {t.dismiss}
          </button>
        </div>
      )}

      <main className="stage">
        <Viewport
          scene={drawing?.scene ?? null}
          hidden={hidden}
          theme={theme}
          labels={{ zoomIn: t.zoomIn, zoomOut: t.zoomOut, fitView: t.fitView }}
        />
        {!drawing && !busy && (
          <EmptyState
            t={t}
            lang={lang}
            recent={recent}
            onPick={() => fileInput.current?.click()}
            onSample={() => void openSample()}
            onOpenRecent={(id) => void openRecent(id)}
          />
        )}
        {busy && (
          <div className="loading" role="status" data-testid="loading">
            <span className="spinner" />
            {stage === 'convert' ? t.stageConvert : stage === 'parse' ? t.stageParse : stage === 'build' ? t.stageBuild : t.loading}
          </div>
        )}
        <Drawer
          title={t.layers}
          open={panel === 'layers'}
          closeLabel={t.close}
          onClose={() => setPanel(null)}
          testId="layers-drawer"
        >
          <LayerPanel
            layers={layers}
            hidden={hidden}
            theme={theme}
            t={t}
            onToggle={toggleLayer}
            onShowAll={() => setHidden(new Set())}
            onHideAll={() => setHidden(new Set(layers.map((l) => l.name)))}
          />
        </Drawer>
        <Drawer
          title={t.recentTitle}
          open={panel === 'recent'}
          closeLabel={t.close}
          onClose={() => setPanel(null)}
          testId="recent-drawer"
        >
          <RecentList
            entries={recent}
            lang={lang}
            t={t}
            onOpen={(id) => {
              setPanel(null);
              void openRecent(id);
            }}
            onRemove={(id) => void recentFiles.remove(id).then(refreshRecent)}
            onClear={recent.length ? () => void recentFiles.clear().then(refreshRecent) : undefined}
          />
        </Drawer>
        {dragging && <div className="drop-overlay">{t.dropHint}</div>}
      </main>

      <footer className="statusbar">
        <span className="file-name" dir="auto" data-testid="file-name">
          {drawing?.name ?? ''}
        </span>
        {drawing && (
          <span className="muted">
            <bdi>{t.items(formatCount(drawing.scene.stats.primitives))}</bdi> · <bdi>{formatBytes(drawing.size)}</bdi>
          </span>
        )}
        <span className="net" data-online={online} data-testid="net-status">
          <i aria-hidden="true" />
          {online ? t.online : t.offline}
        </span>
      </footer>
    </div>
  );
}
