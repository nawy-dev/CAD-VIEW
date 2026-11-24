import { useEffect, useRef } from 'react';
import type { Theme } from '../core/render/aci';
import { drawScene } from '../core/render/draw';
import type { Scene } from '../core/scene/scene';
import {
  DEFAULT_LIMITS,
  fitBounds,
  limitsFor,
  panBy,
  pinchView,
  screenToWorld,
  zoomAt,
  type Point,
  type View,
  type ZoomLimits,
} from '../core/view/viewport';
import { IconFit, IconMinus, IconPlus } from './icons';

export const BACKGROUND: Record<Theme, string> = { dark: '#14171c', light: '#ffffff' };

interface Props {
  scene: Scene | null;
  hidden: ReadonlySet<string>;
  theme: Theme;
  labels: { zoomIn: string; zoomOut: string; fitView: string };
}

interface Api {
  fit(): void;
  zoomBy(factor: number): void;
  schedule(): void;
}

interface Internals {
  view: View;
  limits: ZoomLimits;
  width: number;
  height: number;
  dpr: number;
  needsFit: boolean;
  interactive: boolean;
  raf: number;
  idleTimer: number;
}

const TAP_MAX_MOVE = 8;
const TAP_MAX_MS = 300;
const DOUBLE_TAP_MS = 320;
const DOUBLE_TAP_DISTANCE = 32;

/** شاشة العرض: Canvas مع تحريك (سحب)، تكبير (عجلة/قرص/نقر مزدوج/أزرار/لوحة مفاتيح) وملاءمة. */
export function Viewport({ scene, hidden, theme, labels }: Props) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const coordRef = useRef<HTMLOutputElement | null>(null);
  const api = useRef<Api | null>(null);
  const live = useRef<Pick<Props, 'scene' | 'hidden' | 'theme'>>({ scene, hidden, theme });
  const internals = useRef<Internals>({
    view: { scale: 1, tx: 0, ty: 0 },
    limits: DEFAULT_LIMITS,
    width: 0,
    height: 0,
    dpr: 1,
    needsFit: true,
    interactive: false,
    raf: 0,
    idleTimer: 0,
  });

  // أحدث خصائص متاحة لمعالجات الأحداث بدون إعادة ربطها
  live.current = { scene, hidden, theme };

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const s = internals.current;
    const pointers = new Map<number, Point>();
    let pinch: { view: View; mid: Point; dist: number } | null = null;
    let tap: { x: number; y: number; t: number } | null = null;
    let lastTap: { x: number; y: number; t: number } | null = null;
    let moved = 0;

    const draw = () => {
      s.raf = 0;
      if (s.width === 0 || s.height === 0) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const { scene: current, hidden: hiddenLayers, theme: currentTheme } = live.current;
      if (!current) {
        ctx.setTransform(s.dpr, 0, 0, s.dpr, 0, 0);
        ctx.fillStyle = BACKGROUND[currentTheme];
        ctx.fillRect(0, 0, s.width, s.height);
        wrap.dataset['ready'] = 'false';
        return;
      }
      drawScene(ctx, current, s.view, {
        width: s.width,
        height: s.height,
        dpr: s.dpr,
        theme: currentTheme,
        background: BACKGROUND[currentTheme],
        hiddenLayers,
        interactive: s.interactive,
      });
      wrap.dataset['ready'] = 'true';
      wrap.dataset['scale'] = String(s.view.scale);
      if (!s.interactive) wrap.dataset['drawn'] = String(Number(wrap.dataset['drawn'] ?? 0) + 1);
    };

    const schedule = () => {
      if (!s.raf) s.raf = requestAnimationFrame(draw);
    };

    /** تفاعل جارٍ: نرسم بدون نصوص لسرعة أعلى، ثم رسم كامل بعد توقف الحركة. */
    const touch = () => {
      s.interactive = true;
      window.clearTimeout(s.idleTimer);
      s.idleTimer = window.setTimeout(() => {
        s.interactive = false;
        schedule();
      }, 160);
      schedule();
    };

    const fit = () => {
      const { scene: current } = live.current;
      if (!current || s.width === 0) {
        s.needsFit = true;
        return;
      }
      s.view = fitBounds(current.bounds, s.width, s.height);
      s.limits = limitsFor(s.view.scale);
      s.needsFit = false;
      schedule();
    };

    const zoomBy = (factor: number) => {
      s.view = zoomAt(s.view, s.width / 2, s.height / 2, factor, s.limits);
      touch();
    };

    const resize = () => {
      const width = wrap.clientWidth;
      const height = wrap.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      if (width === 0 || height === 0) return;
      if (width === s.width && height === s.height && dpr === s.dpr) return;
      const first = s.width === 0;
      if (!first && !s.needsFit) {
        // نُبقي مركز الرسم في مكانه عند تغيّر الحجم
        s.view = { ...s.view, tx: s.view.tx + (width - s.width) / 2, ty: s.view.ty + (height - s.height) / 2 };
      }
      s.width = width;
      s.height = height;
      s.dpr = dpr;
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      if (first || s.needsFit) fit();
      // رسم فوري لتفادي وميض الشاشة الفارغة بعد تغيير حجم الـ canvas
      draw();
    };

    const local = (e: { clientX: number; clientY: number }): Point => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    const showCoords = (p: Point) => {
      const out = coordRef.current;
      if (!out || !live.current.scene) return;
      const [x, y] = screenToWorld(s.view, p.x, p.y);
      const digits = Math.max(0, Math.min(6, Math.ceil(Math.log10(s.view.scale)) + 1));
      out.textContent = `X ${x.toFixed(digits)}   Y ${y.toFixed(digits)}`;
    };

    const startPinch = () => {
      const [a, b] = [...pointers.values()];
      if (!a || !b) return;
      pinch = {
        view: s.view,
        mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        dist: Math.hypot(a.x - b.x, a.y - b.y),
      };
    };

    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 1) return;
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        // المؤشر انتهى قبل المعالجة: نكمل بدون التقاط
      }
      const p = local(e);
      pointers.set(e.pointerId, p);
      if (pointers.size === 1) {
        tap = { x: p.x, y: p.y, t: performance.now() };
        moved = 0;
      } else {
        tap = null;
      }
      if (pointers.size === 2) startPinch();
      else pinch = null;
      wrap.dataset['dragging'] = 'true';
      touch();
    };

    const onMove = (e: PointerEvent) => {
      const p = local(e);
      const prev = pointers.get(e.pointerId);
      if (!prev) {
        if (e.pointerType === 'mouse') showCoords(p);
        return;
      }
      pointers.set(e.pointerId, p);
      moved += Math.abs(p.x - prev.x) + Math.abs(p.y - prev.y);
      if (pointers.size === 1) {
        s.view = panBy(s.view, p.x - prev.x, p.y - prev.y);
      } else if (pinch) {
        const [a, b] = [...pointers.values()] as [Point, Point];
        s.view = pinchView(
          pinch.view,
          pinch.mid,
          pinch.dist,
          { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
          Math.hypot(a.x - b.x, a.y - b.y),
          s.limits,
        );
      }
      if (e.pointerType === 'mouse') showCoords(p);
      touch();
    };

    const onUp = (e: PointerEvent) => {
      const wasTap = tap && pointers.size === 1 && moved < TAP_MAX_MOVE && performance.now() - tap.t < TAP_MAX_MS;
      const tapPoint = tap;
      pointers.delete(e.pointerId);
      pinch = null;
      if (pointers.size === 2) startPinch();
      if (pointers.size === 0) delete wrap.dataset['dragging'];

      // نقر مزدوج (ماوس أو لمس): تكبير عند نقطة النقر
      if (wasTap && tapPoint) {
        if (
          lastTap &&
          tapPoint.t - lastTap.t < DOUBLE_TAP_MS &&
          Math.hypot(tapPoint.x - lastTap.x, tapPoint.y - lastTap.y) < DOUBLE_TAP_DISTANCE
        ) {
          s.view = zoomAt(s.view, tapPoint.x, tapPoint.y, 2, s.limits);
          lastTap = null;
        } else {
          lastTap = tapPoint;
        }
      }
      touch();
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
      const factor = Math.exp(-e.deltaY * unit * (e.ctrlKey ? 0.01 : 0.0018));
      const p = local(e);
      s.view = zoomAt(s.view, p.x, p.y, factor, s.limits);
      showCoords(p);
      touch();
    };

    const onKey = (e: KeyboardEvent) => {
      const step = 60;
      switch (e.key) {
        case '+':
        case '=':
          zoomBy(1.4);
          break;
        case '-':
        case '_':
          zoomBy(1 / 1.4);
          break;
        case '0':
          fit();
          break;
        case 'ArrowLeft':
          s.view = panBy(s.view, step, 0);
          touch();
          break;
        case 'ArrowRight':
          s.view = panBy(s.view, -step, 0);
          touch();
          break;
        case 'ArrowUp':
          s.view = panBy(s.view, 0, step);
          touch();
          break;
        case 'ArrowDown':
          s.view = panBy(s.view, 0, -step);
          touch();
          break;
        default:
          return;
      }
      e.preventDefault();
    };

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    wrap.addEventListener('keydown', onKey);
    const observer = new ResizeObserver(resize);
    observer.observe(wrap);
    resize();

    api.current = { fit, zoomBy, schedule };

    return () => {
      api.current = null;
      observer.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('wheel', onWheel);
      wrap.removeEventListener('keydown', onKey);
      cancelAnimationFrame(s.raf);
      window.clearTimeout(s.idleTimer);
      s.raf = 0;
    };
  }, []);

  // رسم جديد: نلائمه على الشاشة
  useEffect(() => {
    api.current?.fit();
  }, [scene]);

  // تغيّر الطبقات المرئية أو المظهر: إعادة رسم فقط
  useEffect(() => {
    api.current?.schedule();
  }, [hidden, theme]);

  return (
    <div className="viewport" ref={wrapRef} tabIndex={0} data-testid="viewport" data-ready="false">
      <canvas ref={canvasRef} data-testid="canvas" />
      <output ref={coordRef} className="coords" aria-live="off" />
      <div className="zoom-controls" role="group">
        <button
          type="button"
          className="icon-btn float"
          onClick={() => api.current?.zoomBy(1.5)}
          aria-label={labels.zoomIn}
          title={labels.zoomIn}
          data-testid="zoom-in"
        >
          <IconPlus />
        </button>
        <button
          type="button"
          className="icon-btn float"
          onClick={() => api.current?.zoomBy(1 / 1.5)}
          aria-label={labels.zoomOut}
          title={labels.zoomOut}
          data-testid="zoom-out"
        >
          <IconMinus />
        </button>
        <button
          type="button"
          className="icon-btn float"
          onClick={() => api.current?.fit()}
          aria-label={labels.fitView}
          title={labels.fitView}
          data-testid="fit"
        >
          <IconFit />
        </button>
      </div>
    </div>
  );
}
