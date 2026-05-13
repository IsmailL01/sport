// Cursona design-system public surface.
// Phase 8 / M1.
//
// Все экраны импортируют примитивы только отсюда.
// Не импортировать из `./tokens` или `./components/*` напрямую — этот
// barrel — единая точка истины для design API.

// === Theme / tokens ===
export type {
  GradeLetter,
  RadiusKey,
  PaddingKey,
  Tokens,
  Theme,
  TweakInputs,
} from './tokens';
export {
  DEFAULT_TWEAKS,
  makeTheme,
  gradeLetter,
} from './tokens';
export {
  ThemeProvider,
  useTheme,
  useTweak,
  useThemeStore,
  getCurrentTokens,
  setTheme,
} from './ThemeProvider';

// === Icons ===
export { Icon } from './icons';
export type { IconName, IconProps } from './icons';

// === Primitives ===
export { Avatar } from './components/Avatar';
export type { AvatarProps } from './components/Avatar';

export { ScreenErrorBoundary } from './components/ScreenErrorBoundary';

export { HeatmapCalendar } from './components/HeatmapCalendar';
export type { HeatmapCalendarProps } from './components/HeatmapCalendar';

export { Button } from './components/Button';
export type { ButtonProps, ButtonVariant, ButtonSize } from './components/Button';

export { FAB } from './components/FAB';
export type { FABProps } from './components/FAB';

export { Chip } from './components/Chip';
export type { ChipProps } from './components/Chip';

export { Card } from './components/Card';
export type { CardProps } from './components/Card';

export { Logo } from './components/Logo';
export type { LogoProps } from './components/Logo';

export { Verified } from './components/Verified';

// === Layout ===
export { TopBar } from './components/TopBar';
export type { TopBarProps } from './components/TopBar';

export { TabBar, TAB_IDS } from './components/TabBar';
export type { TabBarProps, TabId } from './components/TabBar';

export { SectionHeader } from './components/SectionHeader';
export type { SectionHeaderProps } from './components/SectionHeader';

// === Gamification primitives ===
export { GradeBadge } from './components/GradeBadge';
export type { GradeBadgeProps } from './components/GradeBadge';

export { XPBadge } from './components/XPBadge';
export type { XPBadgeProps } from './components/XPBadge';

export { Metric } from './components/Metric';
export type { MetricProps, MetricSize } from './components/Metric';

// === Compound ===
export { StoryRing } from './components/StoryRing';
export type { StoryRingProps } from './components/StoryRing';

export { RunCard } from './components/RunCard';
export type { RunCardProps, RunCardAuthor } from './components/RunCard';

// === Dev only — visual sanity check ===
export { DevPreviewScreen } from './DevPreviewScreen';
