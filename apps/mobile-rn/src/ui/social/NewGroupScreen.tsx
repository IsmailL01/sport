// Создание group chat: name + multi-select users.
// Phase 8 / B1.

import { useEffect, useState } from 'react';
import {
  ActivityIndicator, FlatList, Pressable, StyleSheet, Text,
  TextInput, View,
} from 'react-native';

import type { Chat, SocialUser } from '../../domain/social';
import { useChatsStore } from '../../state/social/useChatsStore';
import { useUsersStore } from '../../state/social/useUsersStore';

type Props = {
  onBack: () => void;
  onCreated: (chat: Chat) => void;
};

export function NewGroupScreen({ onBack, onCreated }: Props) {
  const search = useUsersStore((s) => s.search);
  const createGroup = useChatsStore((s) => s.createGroup);
  const [title, setTitle] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SocialUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<SocialUser[]>([]);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      const r = await search(query.trim());
      // Отфильтруем уже выбранных.
      const pickedIds = new Set(picked.map((u) => u.id));
      setResults(r.filter((u) => !pickedIds.has(u.id)));
      setSearching(false);
    }, 300);
    return () => clearTimeout(t);
  }, [query, search, picked]);

  const togglePick = (u: SocialUser) => {
    setPicked((cur) => cur.some((x) => x.id === u.id)
      ? cur.filter((x) => x.id !== u.id)
      : [...cur, u]);
    setQuery('');
  };

  const handleCreate = async () => {
    if (title.trim() === '' || picked.length === 0 || creating) return;
    setCreating(true);
    try {
      const chat = await createGroup(title, picked.map((u) => u.id));
      if (chat !== null) {
        onCreated(chat);
      }
    } finally {
      setCreating(false);
    }
  };

  const canCreate = title.trim() !== '' && picked.length > 0 && !creating;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Новая группа</Text>
        <Pressable
          onPress={handleCreate}
          disabled={!canCreate}
          style={[styles.createBtn, !canCreate && styles.createBtnDisabled]}
        >
          <Text style={[styles.createText, !canCreate && styles.createTextDisabled]}>
            Создать
          </Text>
        </Pressable>
      </View>

      <TextInput
        style={styles.titleInput}
        placeholder="Название группы"
        placeholderTextColor="#9CA3AF"
        value={title}
        onChangeText={setTitle}
        maxLength={200}
      />

      {picked.length > 0 && (
        <View style={styles.pickedRow}>
          {picked.map((u) => (
            <Pressable key={u.id} onPress={() => togglePick(u)} style={styles.pickedChip}>
              <Text style={styles.pickedName}>
                {u.displayName ?? u.username ?? u.id.slice(0, 6)}
              </Text>
              <Text style={styles.pickedX}>✕</Text>
            </Pressable>
          ))}
        </View>
      )}

      <TextInput
        style={styles.searchInput}
        placeholder="Найти участника"
        placeholderTextColor="#9CA3AF"
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
        autoCorrect={false}
      />

      {searching ? (
        <ActivityIndicator style={{ marginTop: 24 }} />
      ) : query.trim().length < 2 ? (
        <Text style={styles.hint}>
          {picked.length === 0
            ? 'Выбери хотя бы одного участника.'
            : `${picked.length} участник${picked.length === 1 ? '' : picked.length < 5 ? 'а' : 'ов'} выбрано.`}
        </Text>
      ) : results.length === 0 ? (
        <Text style={styles.hint}>Ничего не найдено.</Text>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(u) => u.id}
          renderItem={({ item }) => (
            <Pressable onPress={() => togglePick(item)} style={styles.row}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {((item.displayName ?? item.username ?? '?')[0] ?? '?').toUpperCase()}
                </Text>
              </View>
              <View style={styles.rowMain}>
                <Text style={styles.rowName}>
                  {item.displayName ?? item.username ?? item.id.slice(0, 8)}
                </Text>
                {item.username !== null && (
                  <Text style={styles.rowHandle}>@{item.username}</Text>
                )}
              </View>
              <Text style={styles.plus}>+</Text>
            </Pressable>
          )}
        />
      )}
    </View>
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
  createBtn: { paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: '#111827', borderRadius: 6 },
  createBtnDisabled: { borderColor: '#D1D5DB' },
  createText: { color: '#111827', fontSize: 13, fontWeight: '600' },
  createTextDisabled: { color: '#9CA3AF' },
  titleInput: {
    margin: 12, paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB',
    borderRadius: 8, fontSize: 15, color: '#111827',
  },
  pickedRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 6,
    paddingHorizontal: 12, paddingBottom: 8,
  },
  pickedChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#F3F4F6', borderRadius: 14,
    paddingHorizontal: 10, paddingVertical: 4,
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  pickedName: { fontSize: 12, color: '#111827', fontWeight: '600' },
  pickedX: { fontSize: 12, color: '#6B7280' },
  searchInput: {
    marginHorizontal: 12, marginBottom: 8, paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB',
    borderRadius: 8, fontSize: 15, color: '#111827',
  },
  hint: { textAlign: 'center', color: '#9CA3AF', marginTop: 16, paddingHorizontal: 24 },
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
  plus: { fontSize: 22, color: '#111827', fontWeight: '300' },
});
