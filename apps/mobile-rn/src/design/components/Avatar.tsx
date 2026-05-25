// Avatar — circular profile image, optional grade badge / online dot / ring.
// Phase 8 / M1. Mirror Avatar from ui.jsx.
//
// 2026-05-25: src=null fallback changed from pravatar.cc external lookup
// (third-party dependency, blank in airplane mode, blank for cert-restricted
// debug APKs hitting Mapbox pk.* problem class) to a deterministic
// initials-on-gradient fallback computed locally per src/design/avatarInitials.ts.

import { Image, View, Text, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { useTheme } from '../ThemeProvider';
import { type GradeLetter, gradeLetter } from '../tokens';
import { colorForName, initialsForName } from '../avatarInitials';

export type AvatarProps = {
  /** Image URL. If null/empty, falls back to deterministic initials + gradient by name. */
  src?: string | null;
  /** Diameter (px). */
  size?: number;
  /** Display name — used for initials + gradient color hash on src-less avatars. */
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
  const hasImage = src !== null && src !== undefined && src !== '';
  const badgeFontSize = Math.max(9, Math.round(size * 0.22));
  const initialsFontSize = Math.max(11, Math.round(size * 0.4));
  const grLetter: GradeLetter = gradeLetter(grade);
  const grColor = t.grades[grLetter];

  // Fallback gradient + initials (when no src). Deterministic per name.
  const { start: gradStart, end: gradEnd } = colorForName(name);
  const initials = initialsForName(name);

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
        {hasImage ? (
          <Image
            source={{ uri: src }}
            style={{ width: '100%', height: '100%' }}
            resizeMode="cover"
          />
        ) : (
          <LinearGradient
            colors={[gradStart, gradEnd]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              width: '100%',
              height: '100%',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text
              style={{
                color: '#FFFFFF',
                fontSize: initialsFontSize,
                fontWeight: '700',
                fontFamily: t.fontDisplay,
                letterSpacing: -0.5,
                // Slight text-shadow so initials read on lighter palette buckets
                textShadowColor: 'rgba(0,0,0,0.25)',
                textShadowOffset: { width: 0, height: 1 },
                textShadowRadius: 1,
              }}
            >
              {initials}
            </Text>
          </LinearGradient>
        )}
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
