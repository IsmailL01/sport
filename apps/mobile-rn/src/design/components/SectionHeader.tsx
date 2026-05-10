// SectionHeader — big bold title + optional right action.
// Phase 8 / M1.

import { Text, View, Pressable, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '../ThemeProvider';

export type SectionHeaderProps = {
  title: string;
  action?: string;
  onActionPress?: () => void;
  style?: StyleProp<ViewStyle>;
};

export function SectionHeader({ title, action, onActionPress, style }: SectionHeaderProps) {
  const t = useTheme();
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          marginBottom: 12,
        },
        style,
      ]}
    >
      <Text
        style={{
          color: t.text,
          fontSize: 22 * t.fontScale,
          fontWeight: '800',
          letterSpacing: -0.6,
          fontFamily: t.font,
        }}
      >
        {title}
      </Text>
      {action ? (
        <Pressable onPress={onActionPress} hitSlop={8}>
          <Text
            style={{
              color: t.text2,
              fontSize: 14 * t.fontScale,
              fontFamily: t.font,
            }}
          >
            {action}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
