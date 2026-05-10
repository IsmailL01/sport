// Cursona design tokens — TS port of tokens.jsx из claude-design bundle.
// Phase 8 / M1.
//
// Используется через ThemeProvider — компоненты читают tokens через
// `useTheme()` hook. Tweaks (accent, radius, density, fontSize) живут в
// useThemeStore с MMKV-persist, ThemeProvider пересоздаёт tokens на change.

import { Platform } from 'react-native';

export type GradeLetter = 'D' | 'C' | 'B' | 'A' | 'S';
export type RadiusKey = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'pill';
export type PaddingKey = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export type Tokens = {
  /** Background base — самый тёмный. */
  bg: string;
  surface: string;
  surface2: string;
  surface3: string;
  border: string;
  divider: string;

  text: string;
  text2: string;
  text3: string;
  text4: string;

  /** Coral / orange — energy, action. */
  accent: string;
  /** Accent at ~16% opacity (for backgrounds). */
  accentDim: string;
  /** Primary CTA — lime green. */
  lime: string;
  /** Text on lime background — always dark. */
  limeText: string;
  /** Info / cool accent. */
  ice: string;
  blueGlow: string;

  success: string;
  error: string;
  warn: string;

  /** Grade badge colors (D=easy → S=elite). */
  grades: Record<GradeLetter, string>;

  /** System / UI font family stack. */
  font: string;
  fontMono: string;
  /** Display font for big numbers (italic / tabular). */
  fontDisplay: string;

  /** Border radius scale; scaled by `radiusScale` tweak. */
  r: Record<RadiusKey, number>;
  /** Padding scale; scaled by `density` tweak. */
  pad: Record<PaddingKey, number>;
  /** Text size multiplier; scaled by `fontSize` tweak. */
  fontScale: number;
};

export type Theme = 'dark' | 'light';

export type TweakInputs = {
  theme: Theme;
  /** Hex string, e.g. '#FF4D2E'. */
  accent: string;
  /** Hex string for lime / money / win. */
  lime: string;
  /** Radius multiplier; 1 = default, 0.6 = sharp, 1.4 = soft. */
  radiusScale: number;
  /** Density multiplier; 1 = default, 0.85 = compact, 1.15 = spacious. */
  density: number;
  /** Font size multiplier; 1 = default. */
  fontSize: number;
};

export const DEFAULT_TWEAKS: TweakInputs = {
  theme: 'dark',
  accent: '#FF4D2E',
  lime: '#C6F560',
  radiusScale: 1,
  density: 1,
  fontSize: 1,
};

const FONT_STACK = Platform.select({
  ios: 'System',
  android: 'sans-serif',
  default: 'Inter',
}) as string;

const FONT_MONO = Platform.select({
  ios: 'Menlo',
  android: 'monospace',
  default: 'monospace',
}) as string;

/** Base radius scale (px). Multiplied by tweaks.radiusScale at theme build. */
const BASE_RADIUS = { xs: 8, sm: 12, md: 16, lg: 20, xl: 28, pill: 9999 } as const;

/** Base padding scale (px). Multiplied by tweaks.density at theme build. */
const BASE_PAD = { xs: 8, sm: 12, md: 16, lg: 20, xl: 24 } as const;

/** Hex → rgba with given alpha (0..1). Returns rgba() string. */
function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Build full Tokens from tweak inputs. Pure function — call from useMemo. */
export function makeTheme(t: TweakInputs): Tokens {
  const isLight = t.theme === 'light';

  const r: Tokens['r'] = {
    xs: Math.round(BASE_RADIUS.xs * t.radiusScale),
    sm: Math.round(BASE_RADIUS.sm * t.radiusScale),
    md: Math.round(BASE_RADIUS.md * t.radiusScale),
    lg: Math.round(BASE_RADIUS.lg * t.radiusScale),
    xl: Math.round(BASE_RADIUS.xl * t.radiusScale),
    pill: BASE_RADIUS.pill,
  };

  const pad: Tokens['pad'] = {
    xs: Math.round(BASE_PAD.xs * t.density),
    sm: Math.round(BASE_PAD.sm * t.density),
    md: Math.round(BASE_PAD.md * t.density),
    lg: Math.round(BASE_PAD.lg * t.density),
    xl: Math.round(BASE_PAD.xl * t.density),
  };

  return {
    bg:       isLight ? '#FFFFFF' : '#0A0A0A',
    surface:  isLight ? '#F4F4F4' : '#161616',
    surface2: isLight ? '#EBEBEB' : '#1F1F1F',
    surface3: isLight ? '#E0E0E0' : '#2A2A2A',
    border:   isLight ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.07)',
    divider:  isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)',

    text:  isLight ? '#0A0A0A' : '#FFFFFF',
    text2: isLight ? '#6B6B6B' : '#9A9A9A',
    text3: isLight ? '#9A9A9A' : '#5E5E5E',
    text4: isLight ? '#C0C0C0' : '#3A3A3A',

    accent:    t.accent,
    accentDim: hexToRgba(t.accent, 0.16),
    lime:      t.lime,
    limeText:  '#0A0A0A',
    ice:       '#A8E6F0',
    blueGlow:  '#4DA8FF',

    success: '#00C853',
    error:   '#FF3B30',
    warn:    '#FFB020',

    grades: {
      D: '#C6F560',
      C: '#7FE3A6',
      B: '#4DC9D9',
      A: '#FFB020',
      S: '#FF4D2E',
    },

    font: FONT_STACK,
    fontMono: FONT_MONO,
    fontDisplay: FONT_STACK,

    r, pad,
    fontScale: t.fontSize,
  };
}

/** Helper: extract grade letter from string like 'C+' / 'A+' / 'S'. */
export function gradeLetter(grade: string | undefined | null): GradeLetter {
  if (!grade) return 'D';
  const first = grade.charAt(0).toUpperCase() as GradeLetter;
  return (['D','C','B','A','S'] as const).includes(first) ? first : 'D';
}
