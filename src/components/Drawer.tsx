import type { ReactNode } from 'react';
import { IconClose } from './icons';

interface Props {
  title: string;
  open: boolean;
  closeLabel: string;
  onClose: () => void;
  testId: string;
  children: ReactNode;
}

/** لوحة جانبية منزلقة (للطبقات والملفات الأخيرة). المغلقة غير مرئية فلا تُركَّز بلوحة المفاتيح. */
export function Drawer({ title, open, closeLabel, onClose, testId, children }: Props) {
  return (
    <aside className="drawer" data-open={open} aria-hidden={!open} aria-label={title} data-testid={testId}>
      <header className="drawer-head">
        <h2>{title}</h2>
        <button type="button" className="icon-btn" onClick={onClose} aria-label={closeLabel} title={closeLabel}>
          <IconClose />
        </button>
      </header>
      <div className="drawer-body">{children}</div>
    </aside>
  );
}
