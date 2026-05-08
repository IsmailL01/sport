// Поиск пользователей по username/displayName.
// Phase 8 / A5.

import { useEffect, useState } from 'react';
import {
  ActivityIndicator, FlatList, Pressable, StyleSheet, Text,
  TextInput, View,
} from 'react-native';

import type { SocialUser } from '../../domain/social';
import { useUsersStore } from '../../state/social/useUsersStore';

type Props = {
  onBack: () => void;
  onPick: (user: SocialUser) => void;
};

export function UserSearchScreen({ onBack, onPick }: Props) {
  const search = useUsersStore((s) => s.search);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SocialUser[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      const r = await search(trimmed);
      setResults(r);
      setLoading(false);
    }, 300);
    return () => clearTimeout(t);
  }, [query, search]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Найти пользователя</Text>
        <View style={{ width: 32 }} />
      </View>

      <TextInput
        style={styles.input}
        value={query}
        onChangeText={setQuery}
        placeholder="@username или имя"
        placeholderTextColor="#9CA3AF"
        autoFocus
        autoCapitalize="none"
        autoCorrect={false}
      />

      {loading ? (
        <ActivityIndicator style={{ marginTop: 24 }} />
      ) : query.trim().length < 2 ? (
        <Text style={styles.hint}>Введи минимум 2 символа.</Text>
      ) : results.length === 0 ? (
        <Text style={styles.hint}>Ничего не найдено.</Text>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(u) => u.id}
          renderItem={({ item }) => (
            <UserRow user={item} onPress={() => onPick(item)} />
          )}
        />
      )}
    </View>
  );
}

function UserRow({ user, onPress }: { user: SocialUser; onPress: () => void }) {
  const display = user.displayName ?? user.username ?? user.id.slice(0, 8);
  return (
    <Pressable onPress={onPress} style={styles.row}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>
          {(display.trim()[0] ?? '?').toUpperCase()}
        </Text>
      </View>
      <View style={styles.rowMain}>
        <Text style={styles.rowName} numberOfLines={1}>{display}</Text>
        {user.username !== null && (
          <Text style={styles.rowHandle}>@{user.username}</Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 8, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#E5E7EB',
  },
  backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 28, color: '#111827', marginTop: -4 },
  headerTitle: { flex: 1, fontSize: 16, fontWeight: '600', color: '#111827', textAlign: 'center' },
  input: {
    margin: 12, paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB',
    borderRadius: 8, fontSize: 15, color: '#111827',
  },
  hint: { textAlign: 'center', color: '#9CA3AF', marginTop: 32, paddingHorizontal: 24 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E5E7EB',
  },
  avatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#E5E7EB',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 16, color: '#6B7280', fontWeight: '700' },
  rowMain: { flex: 1 },
  rowName: { fontSize: 15, fontWeight: '600', color: '#111827' },
  rowHandle: { fontSize: 13, color: '#6B7280', marginTop: 2 },
});
