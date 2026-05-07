// Простой модальный экран с историей пробежек. Без navigation library —
// один Modal с FlatList. P1-L-01 / P1-L-04.

import { useEffect, useState } from 'react';
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
import { ManualEntryModal } from './ManualEntryModal';
import { SessionDetailModal } from './SessionDetailModal';

export type HistoryModalProps = {
  visible: boolean;
  onClose: () => void;
};

export function HistoryModal({ visible, onClose }: HistoryModalProps) {
  const sessions = useHistoryStore((s) => s.sessions);
  const loading = useHistoryStore((s) => s.loading);
  const refresh = useHistoryStore((s) => s.refresh);
  const delete_ = useHistoryStore((s) => s.delete);
  const [detailSession, setDetailSession] = useState<Session | null>(null);
  const [manualVisible, setManualVisible] = useState(false);

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
          <Pressable onPress={() => setManualVisible(true)} style={styles.addBtn}>
            <Text style={styles.addBtnText}>+ вручную</Text>
          </Pressable>
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
              <SessionRow
                session={item}
                onDelete={() => handleDelete(item)}
                onPress={() => setDetailSession(item)}
              />
            )}
          />
        )}
      </View>
      <SessionDetailModal
        session={detailSession}
        onClose={() => setDetailSession(null)}
      />
      <ManualEntryModal
        visible={manualVisible}
        onClose={() => setManualVisible(false)}
      />
    </Modal>
  );
}

function SessionRow({
  session,
  onDelete,
  onPress,
}: {
  session: Session;
  onDelete: () => void;
  onPress: () => void;
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
    <Pressable onPress={onPress} style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowDate}>{dateStr}</Text>
        <Text style={styles.rowMeta}>
          {dist}  ·  {status}
        </Text>
        {area && <Text style={styles.rowArea}>{area}</Text>}
        {session.avgHrBpm !== null && (
          <Text style={styles.rowHr}>♥ ср. {session.avgHrBpm} bpm</Text>
        )}
      </View>
      <Pressable onPress={onDelete} style={styles.deleteBtn} hitSlop={6}>
        <Text style={styles.deleteText}>×</Text>
      </Pressable>
    </Pressable>
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
  addBtn: {
    backgroundColor: '#10B981',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginRight: 8,
  },
  addBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
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
  rowHr: { color: '#EF4444', fontSize: 12, marginTop: 4, fontWeight: '600' },
  deleteBtn: {
    width: 28,
    height: 28,
    backgroundColor: '#334155',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteText: { color: '#94A3B8', fontSize: 18, fontWeight: '700', marginTop: -3 },
});
