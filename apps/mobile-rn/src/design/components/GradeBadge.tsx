// GradeBadge — small grade indicator (D / C / B / A / S — with optional '+').
// Phase 8 / M1.

import { Text, View } from 'react-native';

import { useTheme } from '../ThemeProvider';
import { gradeLetter } from '../tokens';

export type GradeBadgeProps = {
  /** e.g. 'D', 'C+', 'A+', 'S'. */
  grade: string;
  /** Pixel diameter; default 22. */
  size?: number;
};

export function GradeBadge({ grade, size = 22 }: GradeBadgeProps) {
  const t = useTheme();
  const color = t.grades[gradeLetter(grade)];
  const fontSize = Math.max(9, Math.round(size * 0.5));
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: 6,
        backgroundColor: color,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 4,
      }}
    >
      <Text
        style={{
          color: '#0A0A0A',
          fontSize,
          fontWeight: '800',
          letterSpacing: -0.2,
          fontFamily: t.fontDisplay,
          lineHeight: fontSize + 1,
        }}
      >
        {grade}
      </Text>
    </View>
  );
}
