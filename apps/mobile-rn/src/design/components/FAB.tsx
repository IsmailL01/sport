// Floating action button. 56×56 round, accent by default.
// Phase 8 / M1.

import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '../ThemeProvider';

export type FABProps = {
  icon: React.ReactNode;
  onPress?: () => void;
  /** Custom background (defaults to accent). */
  color?: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
};

export function FAB({ icon, onPress, color, size = 56, style }: FABProps) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color || t.accent,
          alignItems: 'center',
          justifyContent: 'center',
          // shadow (iOS) + elevation (Android)
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.4,
          shadowRadius: 12,
          elevation: 8,
          opacity: pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      <View>{icon}</View>
    </Pressable>
  );
}
