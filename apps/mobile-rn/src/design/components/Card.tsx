// Card — basic surface container with rounded corners.
// Phase 8 / M1.

import { View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '../ThemeProvider';

export type CardProps = {
  children: React.ReactNode;
  /** Inner padding (px); default 16. */
  p?: number;
  /** Background override (defaults to t.surface). */
  bg?: string;
  /** Radius override (defaults to t.r.lg). */
  radius?: number;
  style?: StyleProp<ViewStyle>;
};

export function Card({ children, p = 16, bg, radius, style }: CardProps) {
  const t = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: bg || t.surface,
          borderRadius: radius ?? t.r.lg,
          padding: p,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
