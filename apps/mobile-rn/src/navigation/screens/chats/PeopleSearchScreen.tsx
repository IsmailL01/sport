// Tab: Чаты / «Найти людей».
//
// Поиск пользователей через social-graph trigram, tap на row → ForeignProfile
// (modal в RootStack). Не путать с CreateChatScreen где UserSearch → DM.

import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { CompositeNavigationProp } from '@react-navigation/native';

import { Avatar, Icon, useTheme } from '../../../design';
import type { SocialUser } from '../../../domain/social';
import { useUsersStore } from '../../../state/social/useUsersStore';
import type { ChatsStackParamList, RootStackParamList } from '../../types';

type Nav = CompositeNavigationProp<
  NativeStackNavigationProp<ChatsStackParamList, 'PeopleSearch'>,
  NativeStackNavigationProp<RootStackParamList>
>;

export function PeopleSearchScreen() {
  const t = useTheme();
  const nav = useNavigation<Nav>();
  const search = useUsersStore((s) => s.search);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SocialUser[]>([]);
  const [loading, setLoading] = useState(false);

  // Debounced search.
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    let cancelled = false;
    const id = setTimeout(async () => {
      try {
        const list = await search(trimmed);
        if (!cancelled) setResults(list);
      } catch (e) {
        if (!cancelled) console.warn('[PeopleSearch] failed', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [query, search]);

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      {/* Header */}
      <View
        style={{
          paddingTop: 56,
          paddingHorizontal: 20,
          paddingBottom: 14,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <Pressable onPress={() => nav.goBack()} hitSlop={10}>
          <Icon name="back" size={26} color={t.text} />
        </Pressable>
        <Text
          style={{
            fontSize: 22 * t.fontScale,
            fontWeight: '800',
            letterSpacing: -0.5,
            color: t.text,
            fontFamily: t.font,
            flex: 1,
          }}
        >
          Найти людей
        </Text>
      </View>

      {/* Search input */}
      <View
        style={{
          marginHorizontal: 20,
          backgroundColor: t.surface,
          borderRadius: t.r.md,
          paddingHorizontal: 14,
          paddingVertical: 12,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <Icon name="search" size={18} color={t.text3} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Имя или @username"
          placeholderTextColor={t.text3}
          autoCapitalize="none"
          autoCorrect={false}
          style={{
            flex: 1,
            fontSize: 15 * t.fontScale,
            color: t.text,
            fontFamily: t.font,
            padding: 0,
          }}
        />
        {query.length > 0 ? (
          <Pressable onPress={() => setQuery('')} hitSlop={8}>
            <Icon name="close" size={18} color={t.text3} />
          </Pressable>
        ) : null}
      </View>

      {/* Results */}
      {loading ? (
        <View style={{ paddingTop: 40, alignItems: 'center' }}>
          <ActivityIndicator color={t.text2} />
        </View>
      ) : query.trim().length < 2 ? (
        <View style={{ paddingTop: 60, paddingHorizontal: 32, alignItems: 'center' }}>
          <Icon name="search" size={48} color={t.text3} />
          <Text style={{ marginTop: 12, color: t.text2, fontSize: 14 * t.fontScale, fontFamily: t.font, textAlign: 'center' }}>
            Введи имя или username (минимум 2 символа)
          </Text>
        </View>
      ) : results.length === 0 ? (
        <View style={{ paddingTop: 60, alignItems: 'center' }}>
          <Text style={{ color: t.text3, fontSize: 14 * t.fontScale, fontFamily: t.font }}>
            Никого не нашли
          </Text>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(u) => u.id}
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 60 }}
          ItemSeparatorComponent={() => (
            <View style={{ height: 1, backgroundColor: t.divider, marginLeft: 60 }} />
          )}
          renderItem={({ item }) => (
            <UserRow
              user={item}
              onPress={() => nav.navigate('ForeignProfile', { userId: item.id })}
              t={t}
            />
          )}
        />
      )}
    </View>
  );
}

function UserRow({
  user,
  onPress,
  t,
}: {
  user: SocialUser;
  onPress: () => void;
  t: ReturnType<typeof useTheme>;
}) {
  const title = user.displayName ?? user.username ?? user.id.slice(0, 8);
  return (
    <Pressable onPress={onPress} hitSlop={4}>
      {({ pressed }) => (
        <View
          style={{
            paddingVertical: 12,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            opacity: pressed ? 0.6 : 1,
          }}
        >
          <Avatar size={44} src={user.avatarUrl ?? null} name={title} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              numberOfLines={1}
              style={{
                color: t.text,
                fontSize: 15 * t.fontScale,
                fontWeight: '700',
                fontFamily: t.font,
              }}
            >
              {title}
            </Text>
            {user.username ? (
              <Text
                numberOfLines={1}
                style={{
                  color: t.text3,
                  fontSize: 12 * t.fontScale,
                  marginTop: 1,
                  fontFamily: t.font,
                }}
              >
                @{user.username}
              </Text>
            ) : null}
            {user.bio ? (
              <Text
                numberOfLines={1}
                style={{
                  color: t.text2,
                  fontSize: 12 * t.fontScale,
                  marginTop: 2,
                  fontFamily: t.font,
                }}
              >
                {user.bio}
              </Text>
            ) : null}
          </View>
          <Icon name="chevron" size={18} color={t.text3} />
        </View>
      )}
    </Pressable>
  );
}
