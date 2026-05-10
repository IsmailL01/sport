// Button — 5 variants × 3 sizes. Mirror Button from ui.jsx.
// Phase 8 / M1.

import { Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '../ThemeProvider';

export type ButtonVariant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'white';
export type ButtonSize = 'sm' | 'md' | 'lg';

export type ButtonProps = {
  children: React.ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: React.ReactNode;
  full?: boolean;
  onPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

const SIZE_MAP = {
  sm: { h: 36, px: 14, fs: 14 },
  md: { h: 48, px: 18, fs: 15 },
  lg: { h: 56, px: 22, fs: 17 },
} as const;

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  icon,
  full,
  onPress,
  disabled,
  style,
}: ButtonProps) {
  const t = useTheme();
  const s = SIZE_MAP[size];
  const radius = size === 'sm' ? t.r.sm : t.r.md;

  let bg = t.lime;
  let fg = t.limeText;
  let border: string | undefined;

  switch (variant) {
    case 'primary':
      bg = t.lime;
      fg = t.limeText;
      break;
    case 'accent':
      bg = t.accent;
      fg = '#FFFFFF';
      break;
    case 'secondary':
      bg = t.surface2;
      fg = t.text;
      break;
    case 'ghost':
      bg = 'transparent';
      fg = t.text;
      border = t.border;
      break;
    case 'white':
      bg = '#FFFFFF';
      fg = '#0A0A0A';
      break;
  }

  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => [
        {
          height: s.h,
          paddingHorizontal: s.px,
          borderRadius: radius,
          backgroundColor: bg,
          borderWidth: border ? 1 : 0,
          borderColor: border ?? 'transparent',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          alignSelf: full ? 'stretch' : 'flex-start',
          opacity: disabled ? 0.45 : pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      {icon && <View style={{ marginRight: children ? 8 : 0 }}>{icon}</View>}
      <Text
        style={{
          color: fg,
          fontSize: s.fs * t.fontScale,
          fontWeight: '600',
          fontFamily: t.font,
          letterSpacing: -0.2,
        }}
      >
        {children}
      </Text>
    </Pressable>
  );
}
