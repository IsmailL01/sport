// ChatSettingsScreen — members + roles management.
// Phase 8 / B1.

import { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text,
  TextInput, View,
} from 'react-native';

import { apiClient } from '../../auth/apiClient';
import type { Chat, ChatRole } from '../../domain/social';
import { useUsersStore } from '../../state/social/useUsersStore';

type Member = {
  userId: string;
  role: ChatRole;
  joinedAt: number;
};

type Props = {
  chat: Chat;
  myUserId: string;
  onBack: () => void;
  onLeft: () => void; // self-leave or kicked
};

export function ChatSettingsScreen({ chat, myUserId, onBack, onLeft }: Props) {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(chat.title ?? '');
  const getOrFetch = useUsersStore((s) => s.getOrFetch);
  const usersById = useUsersStore((s) => s.byId);

  const refresh = async () => {
    setLoading(true);
    try {
      const resp = await apiClient.api(`/conversations/${chat.id}/members`);
      if (resp.ok) {
        const arr = (await resp.json()) as Member[];
        setMembers(arr);
        // Подгрузим профили в кэш.
        for (const m of arr) {
          if (usersById[m.userId] === undefined) getOrFetch(m.userId);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  const myRole = members.find((m) => m.userId === myUserId)?.role ?? chat.myRole;
  const canEdit = myRole === 'owner' || myRole === 'admin';

  const handleSaveTitle = async () => {
    const t = titleDraft.trim();
    if (t === '' || t === chat.title) {
      setEditingTitle(false);
      return;
    }
    try {
      const resp = await apiClient.api(`/conversations/${chat.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ title: t }),
      });
      if (!resp.ok) Alert.alert('Не удалось переименовать', `HTTP ${resp.status}`);
    } catch (e) {
      Alert.alert('Не удалось переименовать', String(e));
    }
    setEditingTitle(false);
  };

  const handleMemberAction = (target: Member) => {
    const isSelf = target.userId === myUserId;
    const options: Array<{ label: string; action: () => void; destructive?: boolean }> = [];

    if (isSelf) {
      options.push({
        label: 'Покинуть группу',
        destructive: true,
        action: async () => {
          const resp = await apiClient.api(
            `/conversations/${chat.id}/members/${target.userId}`,
            { method: 'DELETE' },
          );
          if (resp.ok) onLeft();
          else if (resp.status === 403) {
            Alert.alert('Нельзя покинуть', 'Вы единственный owner — сначала передайте права.');
          } else {
            Alert.alert('Ошибка', `HTTP ${resp.status}`);
          }
        },
      });
    } else if (canEdit) {
      // Кик (если CanRemoveMember)
      const canKick =
        myRole === 'owner'
          ? target.role !== 'owner'
          : myRole === 'admin'
            ? target.role !== 'owner' && target.role !== 'admin'
            : false;
      if (canKick) {
        options.push({
          label: 'Удалить из группы',
          destructive: true,
          action: async () => {
            const resp = await apiClient.api(
              `/conversations/${chat.id}/members/${target.userId}`,
              { method: 'DELETE' },
            );
            if (resp.ok) await refresh();
            else Alert.alert('Ошибка', `HTTP ${resp.status}`);
          },
        });
      }
      // Промоут / демоут
      const possibleRoles: ChatRole[] = myRole === 'owner'
        ? ['owner', 'admin', 'moderator', 'member', 'restricted']
        : ['moderator', 'member', 'restricted'];
      for (const r of possibleRoles) {
        if (r === target.role) continue;
        options.push({
          label: `Назначить ${labelRole(r)}`,
          action: async () => {
            const resp = await apiClient.api(
              `/conversations/${chat.id}/members/${target.userId}`,
              { method: 'PATCH', body: JSON.stringify({ role: r }) },
            );
            if (resp.ok) await refresh();
            else Alert.alert('Ошибка', `HTTP ${resp.status}`);
          },
        });
      }
    }

    if (options.length === 0) return;
    Alert.alert(
      memberLabel(target, usersById),
      `Роль: ${labelRole(target.role)}`,
      [
        ...options.map((o) => ({
          text: o.label, style: o.destructive ? 'destructive' as const : 'default' as const,
          onPress: o.action,
        })),
        { text: 'Отмена', style: 'cancel' as const },
      ],
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Настройки</Text>
        <View style={{ width: 32 }} />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Название</Text>
        {editingTitle ? (
          <View style={styles.titleEditRow}>
            <TextInput
              style={styles.titleInput}
              value={titleDraft}
              onChangeText={setTitleDraft}
              autoFocus
              onSubmitEditing={handleSaveTitle}
              maxLength={200}
            />
            <Pressable onPress={handleSaveTitle} style={styles.saveBtn}>
              <Text style={styles.saveBtnText}>OK</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            onPress={() => canEdit && setEditingTitle(true)}
            style={styles.titleDisplay}
          >
            <Text style={styles.titleValue}>
              {chat.title ?? '(без названия)'}
            </Text>
            {canEdit && <Text style={styles.editHint}>изменить</Text>}
          </Pressable>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>
          Участники ({members.length})
        </Text>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          data={members}
          keyExtractor={(m) => m.userId}
          renderItem={({ item }) => (
            <Pressable onPress={() => handleMemberAction(item)} style={styles.row}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {memberInitial(item, usersById)}
                </Text>
              </View>
              <View style={styles.rowMain}>
                <Text style={styles.rowName}>
                  {memberLabel(item, usersById)}
                  {item.userId === myUserId && ' (вы)'}
                </Text>
                <Text style={styles.rowRole}>{labelRole(item.role)}</Text>
              </View>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

function memberLabel(m: Member, byId: Record<string, { displayName: string | null; username: string | null }>): string {
  const u = byId[m.userId];
  return u?.displayName ?? u?.username ?? m.userId.slice(0, 8);
}

function memberInitial(m: Member, byId: Record<string, { displayName: string | null; username: string | null }>): string {
  const label = memberLabel(m, byId);
  return (label.trim()[0] ?? '?').toUpperCase();
}

function labelRole(r: ChatRole): string {
  switch (r) {
    case 'owner': return 'владелец';
    case 'admin': return 'админ';
    case 'moderator': return 'модератор';
    case 'member': return 'участник';
    case 'restricted': return 'ограниченный';
  }
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
  section: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4 },
  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: '#6B7280',
    letterSpacing: 1, textTransform: 'uppercase',
  },
  titleDisplay: { paddingVertical: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  titleValue: { fontSize: 16, color: '#111827', flex: 1 },
  editHint: { fontSize: 12, color: '#6366F1' },
  titleEditRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  titleInput: {
    flex: 1, paddingHorizontal: 10, paddingVertical: 8,
    backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB',
    borderRadius: 6, fontSize: 15, color: '#111827',
  },
  saveBtn: {
    paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1, borderColor: '#111827', borderRadius: 6,
  },
  saveBtnText: { color: '#111827', fontSize: 13, fontWeight: '600' },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E5E7EB',
  },
  avatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#E5E7EB',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 16, color: '#6B7280', fontWeight: '700' },
  rowMain: { flex: 1 },
  rowName: { fontSize: 15, color: '#111827', fontWeight: '600' },
  rowRole: { fontSize: 12, color: '#6B7280', marginTop: 2 },
});
