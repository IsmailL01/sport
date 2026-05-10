// TopBar — header bar with optional brand / title / trailing actions.
// Phase 8 / M1. Mirror TopBar from ui.jsx.

import { Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '../ThemeProvider';
import { Logo } from './Logo';

export type TopBarProps = {
  /** Big title (e.g. "Чаты", "Журнал"). */
  title?: string;
  /** Sub-title (small under title). */
  sub?: string;
  /** Brand label (renders Logo + label like "cursona"). */
  brand?: string;
  /** Custom leading element (back button, etc). */
  leading?: React.ReactNode;
  /** Custom trailing element (icons row). */
  trailing?: React.ReactNode;
  /** Make background transparent (for hero-style screens). */
  transparent?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function TopBar({
  title,
  sub,
  brand,
  leading,
  trailing,
  transparent,
  style,
}: TopBarProps) {
  const t = useTheme();
  return (
    <View
      style={[
        {
          height: 56,
          paddingHorizontal: 16,
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: transparent ? 'transparent' : t.bg,
        },
        style,
      ]}
    >
      {leading && <View style={{ marginRight: 12 }}>{leading}</View>}

      {brand && (
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Logo size={26} />
          <Text
            style={{
              marginLeft: 8,
              color: t.text,
              fontSize: 19 * t.fontScale,
              fontWeight: '700',
              letterSpacing: -0.5,
              fontFamily: t.font,
            }}
          >
            {brand}
          </Text>
        </View>
      )}

      {title && (
        <View style={{ flex: 1 }}>
          <Text
            style={{
              color: t.text,
              fontSize: 17 * t.fontScale,
              fontWeight: '600',
              letterSpacing: -0.3,
              fontFamily: t.font,
            }}
            numberOfLines={1}
          >
            {title}
          </Text>
          {sub && (
            <Text
              style={{
                color: t.text2,
                fontSize: 12 * t.fontScale,
                marginTop: 1,
                fontFamily: t.font,
              }}
              numberOfLines={1}
            >
              {sub}
            </Text>
          )}
        </View>
      )}

      {!title && brand && <View style={{ flex: 1 }} />}

      {trailing && <View>{trailing}</View>}
    </View>
  );
}
