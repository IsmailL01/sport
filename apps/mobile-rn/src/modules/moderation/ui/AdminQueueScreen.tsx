// Phase E admin: queue репортов с возможностью резолвнуть из приложения.
// Доступ: только moderator/admin (gated в App.tsx через isAdmin flag).

import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type { Report, ReportStatus, ResolutionAction } from '../domain/types';
import { useModerationStore } from '../state/useModerationStore';
import { AdminResolveSheet } from './AdminResolveSheet';
import { useUsersStore } from '../../../state/social/useUsersStore';

type Props = {
  onClose: () => void;
};

const TABS: ReadonlyArray<{ key: ReportStatus; label: string }> = [
  { key: 'open', label: 'Open' },
  { key: 'under_review', label: 'In review' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'rejected', label: 'Rejected' },
];

export function AdminQueueScreen({ onClose }: Props) {
  const queue = useModerationStore((s) => s.adminQueue);
  const loading = useModerationStore((s) => s.loading);
  const refreshAdmin = useModerationStore((s) => s.refreshAdmin);
  const resolveReport = useModerationStore((s) => s.resolveReport);
  const [activeTab, setActiveTab] = useState<ReportStatus>('open');
  const [resolveTarget, setResolveTarget] = useState<Report | null>(null);

  useEffect(() => {
    void refreshAdmin(activeTab);
  }, [activeTab, refreshAdmin]);

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Pressable onPress={onClose} hitSlop={10} style={styles.closeBtn}>
          <Text style={styles.closeText}>‹</Text>
        </Pressable>
        <Text style={styles.title}>Очередь модерации</Text>
        <Pressable
          onPress={() => refreshAdmin(activeTab)}
          hitSlop={10}
          style={styles.refreshBtn}
        >
          <Text style={styles.refreshText}>↻</Text>
        </Pressable>
      </View>

      <View style={styles.tabs}>
        {TABS.map((tab) => (
          <Pressable
            key={tab.key}
            onPress={() => setActiveTab(tab.key)}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
          >
            <Text style={[
              styles.tabLabel,
              activeTab === tab.key && styles.tabLabelActive,
            ]}>
              {tab.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {loading && queue.length === 0 ? (
        <ActivityIndicator style={{ marginTop: 24 }} />
      ) : queue.length === 0 ? (
        <Text style={styles.empty}>В этой очереди пока пусто</Text>
      ) : (
        <FlatList
          data={queue}
          keyExtractor={(r) => r.id}
          renderItem={({ item }) => (
            <ReportRow
              r={item}
              canResolve={activeTab === 'open' || activeTab === 'under_review'}
              onResolve={() => setResolveTarget(item)}
            />
          )}
          onRefresh={() => refreshAdmin(activeTab)}
          refreshing={loading}
        />
      )}

      <AdminResolveSheet
        visible={resolveTarget !== null}
        report={resolveTarget}
        onClose={() => setResolveTarget(null)}
        onResolve={async (action: ResolutionAction) => {
          if (resolveTarget === null) return;
          await resolveReport(resolveTarget.id, action);
          setResolveTarget(null);
        }}
      />
    </View>
  );
}

function ReportRow({
  r, canResolve, onResolve,
}: {
  r: Report; canResolve: boolean; onResolve: () => void;
}) {
  const reporter = useUsersStore((s) => s.byId[r.reporterId]);
  const getOrFetch = useUsersStore((s) => s.getOrFetch);
  useEffect(() => {
    if (reporter === undefined) void getOrFetch(r.reporterId);
  }, [r.reporterId, reporter, getOrFetch]);

  const reporterName = reporter?.displayName ?? reporter?.username ?? r.reporterId.slice(0, 6);

  return (
    <View style={styles.row}>
      <View style={styles.rowHeader}>
        <Text style={styles.kind}>{r.targetKind.toUpperCase()}</Text>
        <Text style={styles.reason}>{labelForReason(r.reason)}</Text>
      </View>
      <Text style={styles.targetId} numberOfLines={1}>
        Target: {r.targetId.slice(0, 16)}…
      </Text>
      <Text style={styles.reporter}>
        Reporter: {reporterName} · {timeAgo(r.createdAt)}
      </Text>
      {r.body !== null && r.body.length > 0 ? (
        <Text style={styles.body} numberOfLines={3}>«{r.body}»</Text>
      ) : null}
      {r.resolutionAction !== null ? (
        <Text style={styles.outcome}>
          ✓ {r.resolutionAction.toUpperCase()} · {r.status}
        </Text>
      ) : null}
      {canResolve && (
        <Pressable onPress={onResolve} style={styles.resolveBtn}>
          <Text style={styles.resolveText}>Resolve →</Text>
        </Pressable>
      )}
    </View>
  );
}

function labelForReason(r: Report['reason']): string {
  switch (r) {
    case 'spam': return 'Спам';
    case 'harassment': return 'Оскорбления';
    case 'nudity': return '18+';
    case 'violence': return 'Насилие';
    case 'illegal': return 'Незаконное';
    case 'other': return 'Другое';
    default: return r;
  }
}

function timeAgo(ts: number): string {
  const ms = Date.now() - ts;
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m} мин назад`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ч назад`;
  return new Date(ts).toLocaleDateString('ru-RU', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFFFFF' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 8, paddingTop: 50, paddingBottom: 10,
    borderBottomWidth: 1, borderBottomColor: '#E5E7EB',
  },
  closeBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  closeText: { fontSize: 28, color: '#111827', marginTop: -4 },
  refreshBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  refreshText: { fontSize: 22, color: '#111827' },
  title: { fontSize: 16, fontWeight: '600', color: '#111827' },
  tabs: {
    flexDirection: 'row', gap: 6, paddingHorizontal: 12, paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E5E7EB',
  },
  tab: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 6,
  },
  tabActive: { borderColor: '#111827', backgroundColor: '#111827' },
  tabLabel: { fontSize: 12, color: '#6B7280', fontWeight: '500' },
  tabLabelActive: { color: '#FFFFFF' },
  empty: { textAlign: 'center', color: '#9CA3AF', marginTop: 48 },
  row: {
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E5E7EB',
  },
  rowHeader: {
    flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4,
  },
  kind: { fontSize: 11, fontWeight: '700', color: '#374151', letterSpacing: 0.5 },
  reason: { fontSize: 12, color: '#B91C1C', fontWeight: '600' },
  targetId: { fontSize: 12, color: '#6B7280', marginBottom: 2 },
  reporter: { fontSize: 11, color: '#9CA3AF' },
  body: {
    marginTop: 6, fontSize: 13, color: '#111827',
    backgroundColor: '#F9FAFB',
    borderLeftWidth: 2, borderLeftColor: '#D1D5DB',
    paddingLeft: 8, paddingVertical: 4,
  },
  outcome: { marginTop: 8, fontSize: 12, color: '#059669', fontWeight: '600' },
  resolveBtn: {
    marginTop: 10, alignSelf: 'flex-start',
    paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1, borderColor: '#111827', borderRadius: 6,
  },
  resolveText: { color: '#111827', fontSize: 13, fontWeight: '600' },
});
