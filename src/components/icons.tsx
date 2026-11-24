/** أيقونات SVG مضمّنة (بدون مكتبات خارجية). كلها بحجم 20 وتأخذ لون النص الحالي. */

const base = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: false,
} as const;

export const IconOpen = () => (
  <svg {...base}>
    <path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6z" />
  </svg>
);

export const IconLayers = () => (
  <svg {...base}>
    <path d="M12 2.5 3 7.5l9 5 9-5-9-5z" />
    <path d="m3 12 9 5 9-5" />
    <path d="m3 16.5 9 5 9-5" />
  </svg>
);

export const IconClock = () => (
  <svg {...base}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);

export const IconPlus = () => (
  <svg {...base}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const IconMinus = () => (
  <svg {...base}>
    <path d="M5 12h14" />
  </svg>
);

export const IconFit = () => (
  <svg {...base}>
    <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
  </svg>
);

export const IconSun = () => (
  <svg {...base}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
);

export const IconMoon = () => (
  <svg {...base}>
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
  </svg>
);

export const IconGlobe = () => (
  <svg {...base}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
  </svg>
);

export const IconClose = () => (
  <svg {...base}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);

export const IconTrash = () => (
  <svg {...base}>
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
  </svg>
);

export const IconFile = () => (
  <svg {...base}>
    <path d="M6 3h8l5 5v13H6z" />
    <path d="M14 3v5h5" />
  </svg>
);

export const IconAlert = () => (
  <svg {...base}>
    <path d="M12 3 2 20h20L12 3z" />
    <path d="M12 10v4M12 17v.5" />
  </svg>
);

/** شعار التطبيق (نفس رسم أيقونة التثبيت بشكل مبسّط). */
export const LogoMark = () => (
  <svg width="26" height="26" viewBox="0 0 512 512" aria-hidden="true" focusable="false">
    <rect width="512" height="512" rx="96" fill="var(--logo-bg)" />
    <circle cx="256" cy="256" r="110" fill="none" stroke="#4fc3f7" strokeWidth="26" />
    <rect x="178" y="178" width="156" height="156" fill="none" stroke="#ffb74d" strokeWidth="20" />
    <path d="M178 334 334 178" stroke="var(--logo-line)" strokeWidth="14" strokeLinecap="round" />
  </svg>
);
