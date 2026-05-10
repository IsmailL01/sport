// RunCard — feed post card with run metrics.
// Phase 8 / M1.
//
// Data-only props (no business logic). Caller formats values:
//   dist: "16,00"
//   time: "01:18:56"
//   pace: "04:55"
//   xp:   17
//
// Caller также передаёт onLike / onComment / onShare callbacks — карточка
// не управляет state.

import { Image, Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '../ThemeProvider';
import { Icon } from '../icons';
import { Avatar } from './Avatar';
import { Chip } from './Chip';
import { GradeBadge } from './GradeBadge';

export type RunCardAuthor = {
  name: string;
  avatar?: string;
  grade?: string;
};

export type RunCardProps = {
  author: RunCardAuthor;
  /** "Dubai, UAE" / "Чувашия, Россия". */
  location?: string;
  /** "сегодня, 13:03" / "вчера, 18:24". */
  when?: string;
  /** Optional photo URL. */
  photo?: string;

  // Metrics (pre-formatted strings)
  dist: string;
  time: string;
  pace: string;

  // Gamification
  xp?: number | string;

  // Optional metadata chips
  device?: string;
  weather?: string;
  mood?: string;

  // Caption + hashtag
  hashtag?: string;
  caption?: string;

  // Social
  likes?: number;
  comments?: number;
  liked?: boolean;
  onLike?: () => void;
  onComment?: () => void;
  onShare?: () => void;
  onMore?: () => void;
  onPress?: () => void;

  style?: StyleProp<ViewStyle>;
};

export function RunCard({
  author,
  location,
  when,
  photo,
  dist,
  time,
  pace,
  xp,
  device,
  weather,
  mood,
  hashtag,
  caption,
  likes = 0,
  comments = 0,
  liked = false,
  onLike,
  onComment,
  onShare,
  onMore,
  onPress,
  style,
}: RunCardProps) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={[
        {
          backgroundColor: t.surface,
          borderRadius: t.r.lg,
          overflow: 'hidden',
        },
        style,
      ]}
    >
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 14,
          paddingTop: 14,
          paddingBottom: 12,
        }}
      >
        <View style={{ position: 'relative', marginRight: 12 }}>
          <Avatar src={author.avatar ?? null} size={44} name={author.name} />
          {author.grade ? (
            <View style={{ position: 'absolute', bottom: -2, left: -2 }}>
              <GradeBadge grade={author.grade} size={20} />
            </View>
          ) : null}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: '600', color: t.text, fontFamily: t.font }} numberOfLines={1}>
            {author.name}
          </Text>
          {(when || location) && (
            <Text style={{ fontSize: 12, color: t.text3, marginTop: 2, fontFamily: t.font }} numberOfLines={1}>
              {when}{when && location ? ' · ' : ''}{location}
            </Text>
          )}
        </View>
        {onMore && (
          <Pressable onPress={onMore} hitSlop={10}>
            <Icon name="more" size={20} color={t.text2} />
          </Pressable>
        )}
      </View>

      {/* Photo */}
      {photo ? (
        <View style={{ aspectRatio: 4 / 3 }}>
          <Image source={{ uri: photo }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
        </View>
      ) : null}

      {/* Body */}
      <View style={{ paddingHorizontal: 14, paddingTop: 12, paddingBottom: 16 }}>
        {/* Chips row */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {xp !== undefined && (
            <Chip
              icon={<Icon name="bolt" size={11} color={t.lime} />}
              bg="rgba(198,245,96,0.15)"
              color={t.lime}
            >
              +{xp} XP
            </Chip>
          )}
          {device && (
            <Chip icon={<Icon name="watch" size={11} color={t.text2} />} bg={t.surface2} color={t.text2}>
              {device}
            </Chip>
          )}
          {weather && (
            <Chip icon={<Icon name="sun" size={11} color={t.text2} />} bg={t.surface2} color={t.text2}>
              {weather}
            </Chip>
          )}
          {mood && (
            <Chip bg={t.surface2} color={t.text2}>
              {mood}
            </Chip>
          )}
        </View>

        {/* Hashtag + caption */}
        {hashtag ? (
          <Text style={{ marginTop: 14, fontSize: 15, color: t.accent, fontWeight: '600', fontFamily: t.font }}>
            {hashtag}
          </Text>
        ) : null}
        {caption ? (
          <Text style={{ marginTop: 6, fontSize: 14, color: t.text, lineHeight: 20, fontFamily: t.font }}>
            {caption}
          </Text>
        ) : null}

        {/* Metrics row */}
        <View
          style={{
            marginTop: 14,
            paddingTop: 14,
            borderTopWidth: 1,
            borderTopColor: t.divider,
            flexDirection: 'row',
            justifyContent: 'space-between',
          }}
        >
          {[
            { label: 'Расстояние, км', value: dist },
            { label: 'Время', value: time },
            { label: 'Темп, /км', value: pace },
          ].map((m) => (
            <View key={m.label}>
              <Text
                style={{
                  fontSize: 22,
                  fontWeight: '700',
                  color: t.text,
                  letterSpacing: -0.5,
                  fontFamily: t.fontDisplay,
                }}
              >
                {m.value}
              </Text>
              <Text style={{ fontSize: 11, color: t.text3, marginTop: 2, fontFamily: t.font }}>
                {m.label}
              </Text>
            </View>
          ))}
        </View>

        {/* Social row */}
        <View
          style={{
            marginTop: 14,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 18,
          }}
        >
          <Pressable onPress={onLike} hitSlop={6} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Icon name={liked ? 'heartFill' : 'heart'} size={18} color={liked ? t.accent : t.text2} />
            <Text style={{ color: t.text2, fontSize: 13, fontFamily: t.font }}>{likes}</Text>
          </Pressable>
          <Pressable onPress={onComment} hitSlop={6} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Icon name="comment" size={18} color={t.text2} />
            <Text style={{ color: t.text2, fontSize: 13, fontFamily: t.font }}>{comments}</Text>
          </Pressable>
          {onShare && (
            <Pressable onPress={onShare} hitSlop={6}>
              <Icon name="share" size={18} color={t.text2} />
            </Pressable>
          )}
          <View style={{ flex: 1 }} />
          <Text style={{ color: t.text3, fontSize: 12, fontFamily: t.font }}>{dist} км</Text>
        </View>
      </View>
    </Pressable>
  );
}
