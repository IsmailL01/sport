// XPBadge — small pill showing earned XP (e.g. "+17 XP").
// Phase 8 / M1.
//
// Note: original Cursona design also had money pill (₽). User explicitly
// removed money from app; we keep XP-only.

import { Text, View } from 'react-native';

import { useTheme } from '../ThemeProvider';

export type XPBadgeProps = {
  /** Numeric value to show; will be prefixed with '+'. */
  value: number | string;
};

export function XPBadge({ value }: XPBadgeProps) {
  const t = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 5,
        borderRadius: 9999,
        backgroundColor: 'rgba(168, 230, 240, 0.18)',
        alignSelf: 'flex-start',
      }}
    >
      <Text
        style={{
          color: t.ice,
          fontSize: 12 * t.fontScale,
          fontWeight: '700',
          letterSpacing: -0.2,
          fontFamily: t.font,
        }}
      >
        +{value} XP
      </Text>
    </View>
  );
}
