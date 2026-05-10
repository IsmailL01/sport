// Cursona logo — abstract running mark.
// Phase 8 / M1. Mirror Logo from ui.jsx.

import Svg, { Path } from 'react-native-svg';

import { useTheme } from '../ThemeProvider';

export type LogoProps = {
  size?: number;
  color?: string;
};

export function Logo({ size = 28, color }: LogoProps) {
  const t = useTheme();
  const c = color || t.lime;
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <Path
        d="M16 3 C 20 5, 24 8, 26 13 C 28 18, 26 24, 21 27 C 16 30, 10 28, 7 24 C 4 20, 5 14, 9 11 L 14 14 L 11 18 L 16 20 L 22 16"
        stroke={c}
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
