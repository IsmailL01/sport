// StoryRing — circular avatar wrapped in conic-gradient ring for unread
// stories. На своей "истории" (isOwn=true) показывается "+".
// Phase 8 / M1.
//
// Note: React Native не имеет conic-gradient. Эмулируем через SVG circle
// stroke-dasharray + rotation, либо просто solid lime/accent (упрощено
// для MVP, можно улучшить позже).

import { Image, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Circle } from 'react-native-svg';

import { useTheme } from '../ThemeProvider';
import { GradeBadge } from './GradeBadge';

export type StoryRingProps = {
  src: string;
  name: string;
  /** unread → bright lime+accent gradient ring; read → muted grey. */
  unread?: boolean;
  /** Own ring → renders "+" overlay instead of grade. */
  isOwn?: boolean;
  /** Optional grade badge bottom-left (для друзей). */
  grade?: string;
  /** Ring outer size; default 66. */
  size?: number;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
};

export function StoryRing({
  src,
  name,
  unread = true,
  isOwn = false,
  grade,
  size = 66,
  style,
}: StoryRingProps) {
  const t = useTheme();
  const avatarSize = size - 8; // 2px ring + 2px gap + 2px gap + 2px ring
  const innerSize = avatarSize - 4;
  return (
    <View
      style={[
        {
          flexDirection: 'column',
          alignItems: 'center',
          minWidth: size + 4,
        },
        style,
      ]}
    >
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          padding: 2,
          backgroundColor: 'transparent',
          position: 'relative',
        }}
      >
        {/* Gradient ring or solid border */}
        {unread ? (
          <Svg
            width={size}
            height={size}
            viewBox="0 0 100 100"
            style={{ position: 'absolute', top: 0, left: 0 }}
          >
            <Defs>
              <LinearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0%" stopColor={t.lime} />
                <Stop offset="50%" stopColor={t.accent} />
                <Stop offset="100%" stopColor={t.lime} />
              </LinearGradient>
            </Defs>
            <Circle cx="50" cy="50" r="48" stroke="url(#ringGrad)" strokeWidth="4" fill="none" />
          </Svg>
        ) : (
          <View
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: size,
              height: size,
              borderRadius: size / 2,
              borderWidth: 2,
              borderColor: t.surface2,
            }}
          />
        )}

        {/* Inner padding ring (bg-coloured) to create gap */}
        <View
          style={{
            width: avatarSize,
            height: avatarSize,
            borderRadius: avatarSize / 2,
            backgroundColor: t.bg,
            padding: 2,
            margin: 2,
          }}
        >
          <Image
            source={{ uri: src }}
            style={{
              width: innerSize,
              height: innerSize,
              borderRadius: innerSize / 2,
            }}
            resizeMode="cover"
          />
        </View>

        {isOwn ? (
          <View
            style={{
              position: 'absolute',
              bottom: -2,
              right: -2,
              width: 22,
              height: 22,
              borderRadius: 11,
              backgroundColor: t.lime,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 2,
              borderColor: t.bg,
            }}
          >
            <Text
              style={{
                color: '#000',
                fontSize: 18,
                fontWeight: '700',
                lineHeight: 20,
                fontFamily: t.font,
              }}
            >
              +
            </Text>
          </View>
        ) : grade ? (
          <View style={{ position: 'absolute', bottom: -4, left: -4 }}>
            <GradeBadge grade={grade} size={22} />
          </View>
        ) : null}
      </View>

      <Text
        style={{
          marginTop: 6,
          fontSize: 11,
          color: t.text2,
          fontWeight: '500',
          maxWidth: size + 4,
          fontFamily: t.font,
        }}
        numberOfLines={1}
      >
        {name}
      </Text>
    </View>
  );
}
