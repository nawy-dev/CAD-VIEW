/** ترميز اللون في المشهد: 1–255 = فهرس ACI، وغير ذلك (≥ TRUE_COLOR_FLAG) = لون حقيقي RGB. */
export const TRUE_COLOR_FLAG = 0x1000000;

export type Theme = 'dark' | 'light';

export function trueColorCode(rgb: number): number {
  return TRUE_COLOR_FLAG + (rgb & 0xffffff);
}

export function isTrueColor(color: number): boolean {
  return color >= TRUE_COLOR_FLAG;
}

type Rgb = readonly [number, number, number];

const GRAYS: readonly Rgb[] = [
  [51, 51, 51],
  [91, 91, 91],
  [132, 132, 132],
  [173, 173, 173],
  [214, 214, 214],
  [255, 255, 255],
];

/** القيم القصوى للمكوّن في كل مستوى من 10 مستويات للون الواحد. */
const LEVEL_VALUE = [255, 255, 204, 204, 153, 153, 127, 127, 76, 76] as const;

function hueToRgb(hueDeg: number, vmax: number, vmin: number): Rgb {
  const sector = Math.floor(hueDeg / 60) % 6;
  const f = (hueDeg % 60) / 60;
  const rising = Math.floor(vmin + (vmax - vmin) * f);
  const falling = Math.floor(vmax - (vmax - vmin) * f);
  switch (sector) {
    case 0:
      return [vmax, rising, vmin];
    case 1:
      return [falling, vmax, vmin];
    case 2:
      return [vmin, vmax, rising];
    case 3:
      return [vmin, falling, vmax];
    case 4:
      return [rising, vmin, vmax];
    default:
      return [vmax, vmin, falling];
  }
}

/** جدول ألوان AutoCAD (ACI) يُولَّد بالمعادلة بدل جدول ضخم. الفهرس 7 يُعالَج حسب الخلفية. */
export function aciToRgb(index: number): Rgb {
  switch (index) {
    case 1:
      return [255, 0, 0];
    case 2:
      return [255, 255, 0];
    case 3:
      return [0, 255, 0];
    case 4:
      return [0, 255, 255];
    case 5:
      return [0, 0, 255];
    case 6:
      return [255, 0, 255];
    case 7:
      return [255, 255, 255];
    case 8:
      return [65, 65, 65];
    case 9:
      return [128, 128, 128];
    default:
  }
  if (index >= 10 && index <= 249) {
    const n = index - 10;
    const hue = Math.floor(n / 10) * 15;
    const level = n % 10;
    const vmax = LEVEL_VALUE[level] as number;
    const vmin = level % 2 === 0 ? 0 : Math.floor(vmax * 0.5);
    return hueToRgb(hue, vmax, vmin);
  }
  if (index >= 250 && index <= 255) return GRAYS[index - 250] as Rgb;
  return [255, 255, 255];
}

const cssCache = new Map<string, string>();

function luminance([r, g, b]: Rgb): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/** لون CSS للرسم مع ضمان تباين مقبول مع الخلفية. */
export function colorToCss(color: number, theme: Theme): string {
  const key = `${color}|${theme}`;
  const cached = cssCache.get(key);
  if (cached) return cached;

  let rgb: Rgb;
  if (isTrueColor(color)) {
    const v = color - TRUE_COLOR_FLAG;
    rgb = [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  } else if (color === 7) {
    rgb = theme === 'dark' ? [255, 255, 255] : [0, 0, 0];
  } else {
    rgb = aciToRgb(color);
  }

  const lum = luminance(rgb);
  if (theme === 'light' && lum > 0.75) {
    rgb = [Math.round(rgb[0] * 0.6), Math.round(rgb[1] * 0.6), Math.round(rgb[2] * 0.6)];
  } else if (theme === 'dark' && lum < 0.18) {
    rgb = [
      Math.round(rgb[0] + (255 - rgb[0]) * 0.55),
      Math.round(rgb[1] + (255 - rgb[1]) * 0.55),
      Math.round(rgb[2] + (255 - rgb[2]) * 0.55),
    ];
  }

  const css = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
  cssCache.set(key, css);
  return css;
}
