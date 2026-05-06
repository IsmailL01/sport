// Простой модальный экран с историей пробежек. Без navigation library —
// один Modal с FlatList. P1-L-01 / P1-L-04.

import { useEffect } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type { Session } from '../domain/types';
import { useHistoryStore } from '../state/history';
import { formatArea, formatDistance } from './format';

export type HistoryModalProps = {
  visible: boolean;
  onClose: () => void;
};

export function HistoryModal({ visible, onClose }: HistoryModalProps) {
  const sessions = useHistoryStore((s) => s.sessions);
  const loading = useHistoryStore((s) => s.loading);
  const refresh = useHistoryStore((s) => s.refresh);
  const delete_ = useHistoryStore((s) => s.delete);

  useEffect(() => {
    if (visible) refresh();
  }, [visible, refresh]);

  const handleDelete = (s: Session) => {
    Alert.alert(
      'Удалить пробежку?',
      `${formatStartDate(s.startedAt)} — действие нельзя отменить.`,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: () => delete_(s.id),
        },
      ],
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>История</Text>
          <Pressable onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeText}>✕</Text>
          </Pressable>
        </View>
        {loading ? (
          <Text style={styles.empty}>Загрузка…</Text>
        ) : sessions.length === 0 ? (
          <Text style={styles.empty}>Пока нет ни одной пробежки.</Text>
        ) : (
          <FlatList
            data={sessions}
            keyExtractor={(s) => String(s.id)}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <SessionRow session={item} onDelete={() => handleDelete(item)} />
            )}
          />
        )}
      </View>
    </Modal>
  );
}

function SessionRow({
  session,
  onDelete,
}: {
  session: Session;
  onDelete: () => void;
}) {
  const dateStr = formatStartDate(session.startedAt);
  const dist = session.distanceM !== null ? formatDistance(session.distanceM) : '—';
  const area =
    session.areaM2 !== null && session.isClosed === true
      ? `🏆 ${formatArea(session.areaM2)}`
      : null;
  const status =
    session.endedAt === null
      ? '⏳ не завершена'
      : session.isClosed === true
        ? '✓ замкнут'
        : '↪ открытый трек';

  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowDate}>{dateStr}</Text>
        <Text style={styles.rowMeta}>
          {dist}  ·  {status}
        </Text>
        {area && <Text style={styles.rowArea}>{area}</Text>}
      </View>
      <Pressable onPress={onDelete} style={styles.deleteBtn}>
        <Text style={styles.deleteText}>Удалить</Text>
      </Pressable>
    </View>
  );
}

function formatStartDate(epochMs: number): string {
  const d = new Date(epochMs);
  return d.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F1419' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#1E293B',
  },
  title: { color: '#FFFFFF', fontSize: 22, fontWeight: '700', flex: 1 },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: { color: '#94A3B8', fontSize: 18 },
  empty: { color: '#64748B', fontSize: 14, textAlign: 'center', padding: 32 },
  list: { padding: 16, gap: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 16,
  },
  rowDate: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  rowMeta: { color: '#94A3B8', fontSize: 13, marginTop: 4 },
  rowArea: { color: '#10B981', fontSize: 13, marginTop: 4, fontWeight: '600' },
  deleteBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#EF4444',
    borderRadius: 8,
  },
  deleteText: { color: '#FFFFFF', fontSize: 12, fontWeight: '600' },
});
