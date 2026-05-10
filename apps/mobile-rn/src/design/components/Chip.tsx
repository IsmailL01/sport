// Chip — small rounded pill with optional icon.
// Phase 8 / M1.

import { Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '../ThemeProvider';

export type ChipProps = {
  children: React.ReactNode;
  icon?: React.ReactNode;
  color?: string;
  bg?: string;
  style?: StyleProp<ViewStyle>;
};

export function Chip({ children, icon, color, bg, style }: ChipProps) {
  const t = useTheme();
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 10,
          paddingVertical: 5,
          borderRadius: 9999,
          backgroundColor: bg || t.surface2,
          alignSelf: 'flex-start',
        },
        style,
      ]}
    >
      {icon && <View style={{ marginRight: 5 }}>{icon}</View>}
      <Text
        style={{
          color: color || t.text,
          fontSize: 13 * t.fontScale,
          fontWeight: '600',
          fontFamily: t.font,
          letterSpacing: -0.2,
        }}
        numberOfLines={1}
      >
        {children}
      </Text>
    </View>
  );
}
