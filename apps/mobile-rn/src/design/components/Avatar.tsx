// Avatar — circular profile image, optional grade badge / online dot / ring.
// Phase 8 / M1. Mirror Avatar from ui.jsx.

import { Image, View, Text, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '../ThemeProvider';
import { type GradeLetter, gradeLetter } from '../tokens';

export type AvatarProps = {
  /** Image URL. If null/undefined, falls back to pravatar by name hash. */
  src?: string | null;
  /** Diameter (px). */
  size?: number;
  /** Used for pravatar hash fallback. */
  name?: string;
  /** Optional grade ('D', 'A+', 'S'). Renders small badge bottom-left. */
  grade?: string | null;
  /** Online dot bottom-right (online === true). */
  online?: boolean;
  /** Color of ring around avatar (for stories etc). */
  ring?: string | null;
  /** Override container style (e.g. margin). */
  style?: StyleProp<ViewStyle>;
};

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h) + s.charCodeAt(i);
    h |= 0;
  }
  return h;
}

export function Avatar({
  src,
  size = 40,
  name = '',
  grade,
  online,
  ring,
  style,
}: AvatarProps) {
  const t = useTheme();
  const url = src ?? `https://i.pravatar.cc/120?img=${Math.abs(hashCode(name)) % 70 + 1}`;
  const badgeFontSize = Math.max(9, Math.round(size * 0.22));
  const grLetter: GradeLetter = gradeLetter(grade);
  const grColor = t.grades[grLetter];

  return (
    <View
      style={[
        {
          width: size,
          height: size,
          position: 'relative',
          flexShrink: 0,
        },
        ring
          ? {
              shadowColor: ring,
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: 1,
              shadowRadius: 0,
            }
          : null,
        style,
      ]}
    >
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          overflow: 'hidden',
          backgroundColor: t.surface2,
          borderWidth: ring ? 2.5 : 0,
          borderColor: ring || 'transparent',
        }}
      >
        <Image
          source={{ uri: url }}
          style={{ width: '100%', height: '100%' }}
          resizeMode="cover"
        />
      </View>

      {grade && (
        <View
          style={{
            position: 'absolute',
            bottom: -2,
            left: -2,
            paddingHorizontal: 6,
            paddingVertical: 2,
            borderRadius: 6,
            backgroundColor: grColor,
            borderWidth: 2,
            borderColor: t.bg,
          }}
        >
          <Text
            style={{
              color: '#0A0A0A',
              fontSize: badgeFontSize,
              fontWeight: '800',
              fontFamily: t.fontDisplay,
              letterSpacing: -0.3,
              lineHeight: badgeFontSize + 1,
            }}
          >
            {grade}
          </Text>
        </View>
      )}

      {online && (
        <View
          style={{
            position: 'absolute',
            bottom: 0,
            right: 0,
            width: Math.max(10, size * 0.25),
            height: Math.max(10, size * 0.25),
            borderRadius: Math.max(10, size * 0.25) / 2,
            backgroundColor: t.success,
            borderWidth: 2,
            borderColor: t.bg,
          }}
        />
      )}
    </View>
  );
}
