import type { Lang } from './strings';

const numbers = new Intl.NumberFormat('en', { maximumFractionDigits: 1 });

/** حجم مقروء بأرقام لاتينية: 512 B ، 12.3 KB ، 4.5 MB. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${numbers.format(bytes / 1024)} KB`;
  return `${numbers.format(bytes / (1024 * 1024))} MB`;
}

/** رقم بفواصل آلاف لاتينية. */
export function formatCount(n: number): string {
  return new Intl.NumberFormat('en').format(n);
}

const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['day', 86_400_000],
  ['hour', 3_600_000],
  ['minute', 60_000],
];

/** وقت نسبي ("منذ 5 دقائق") بأرقام لاتينية. */
export function formatRelative(timestamp: number, now: number, lang: Lang): string {
  const locale = lang === 'ar' ? 'ar-u-nu-latn' : 'en';
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const diff = timestamp - now;
  for (const [unit, ms] of UNITS) {
    if (Math.abs(diff) >= ms) return rtf.format(Math.round(diff / ms), unit);
  }
  return rtf.format(0, 'second');
}
