// Tab: Журнал — список пробежек. Phase 8 / M7.
//
// Заменяет JournalScreenStub. Реальные данные из useHistoryStore.
//
// Layout:
//   - Title "Журнал" + filter / calendar icons (mock — реальные filter в M11+)
//   - WeekSummary (текущая неделя: сколько км / сессий)
//   - FlatList<SessionRow> sorted desc by startedAt
//   - Pull-to-refresh
//   - Tap row → nav SessionDetail
//   - Long-press row → Alert «Удалить?»

import { useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { Card, Icon, useTheme } from '../../../design';
import { useHistoryStore } from '../../../state/history';
import { formatArea, formatDistance, formatDuration, formatPace } from '../../../ui/format';
import type { Session } from '../../../domain/types';
import { aggregateSessions, type StatsPeriod } from '../../../domain/stats';
import { UpdateBanner } from '../../../update/UpdateBanner';
import type { JournalStackParamList } from '../../types';

type Nav = NativeStackNavigationProp<JournalStackParamList, 'JournalList'>;

export function JournalScreen() {
  const t = useTheme();
  const nav = useNavigation<Nav>();
  const sessions = useHistoryStore((s) => s.sessions);
  const loading = useHistoryStore((s) => s.loading);
  const refresh = useHistoryStore((s) => s.refresh);
  const deleteSession = useHistoryStore((s) => s.delete);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // M10.3: period toggle Week/Month.
  const [period, setPeriod] = useState<StatsPeriod>('week');
  const summary = useMemo(() => aggregateSessions(sessions, period), [sessions, period]);

  const handleDelete = (s: Session) => {
    Alert.alert(
      'Удалить пробежку?',
      `${formatStart(s.startedAt)} — действие необратимо.`,
      [
        { text: 'Отмена', style: 'cancel' },
        { text: 'Удалить', style: 'destructive', onPress: () => deleteSession(s.id) },
      ],
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      {/* Phase 8 / Plan 08-01 Task 6: non-blocking update banner. See
          src/update/UpdateBanner.tsx for behavior. */}
      <UpdateBanner />
      {/* Header */}
      <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text
            style={{
              fontSize: 30 * t.fontScale,
              fontWeight: '800',
              letterSpacing: -1,
              color: t.text,
              fontFamily: t.font,
            }}
          >
            Журнал
          </Text>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Icon name="calendar" size={22} color={t.text} />
            <Icon name="filter" size={22} color={t.text} />
          </View>
        </View>
      </View>

      <FlatList
        data={sessions}
        keyExtractor={(s) => String(s.id)}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 6, paddingBottom: 100 }}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={refresh}
            tintColor={t.text2}
          />
        }
        ListHeaderComponent={
          <PeriodSummary period={period} setPeriod={setPeriod} summary={summary} t={t} />
        }
        ListEmptyComponent={
          !loading ? (
            <View style={{ alignItems: 'center', paddingTop: 80 }}>
              <Icon name="run" size={48} color={t.text3} />
              <Text style={{ marginTop: 12, color: t.text2, fontSize: 15 * t.fontScale, fontFamily: t.font }}>
                Пока нет пробежек
              </Text>
              <Text style={{ marginTop: 6, color: t.text3, fontSize: 13 * t.fontScale, fontFamily: t.font, textAlign: 'center' }}>
                Перейди во вкладку «Запись» и нажми «Начать забег»
              </Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <SessionRow
            session={item}
            onPress={() => nav.navigate('SessionDetail', { sessionId: String(item.id) })}
            onLongPress={() => handleDelete(item)}
            t={t}
          />
        )}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
      />
    </View>
  );
}

function PeriodSummary({
  period,
  setPeriod,
  summary,
  t,
}: {
  period: StatsPeriod;
  setPeriod: (p: StatsPeriod) => void;
  summary: ReturnType<typeof aggregateSessions>;
  t: ReturnType<typeof useTheme>;
}) {
  const km = summary.totalDistanceM / 1000;
  const durMin = Math.round(summary.totalDurationS / 60);
  return (
    <Card style={{ marginBottom: 14, padding: 16 }}>
      {/* Toggle Week/Month */}
      <View
        style={{
          flexDirection: 'row',
          gap: 6,
          padding: 3,
          backgroundColor: t.surface2,
          borderRadius: 999,
          alignSelf: 'flex-start',
          marginBottom: 12,
        }}
      >
        {(['week', 'month'] as const).map((p) => (
          <Pressable
            key={p}
            onPress={() => setPeriod(p)}
            style={({ pressed }) => ({
              paddingHorizontal: 14,
              paddingVertical: 6,
              borderRadius: 999,
              backgroundColor: period === p ? t.lime : 'transparent',
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Text
              style={{
                color: period === p ? '#000' : t.text2,
                fontSize: 12 * t.fontScale,
                fontWeight: '700',
                fontFamily: t.font,
              }}
            >
              {p === 'week' ? 'Неделя' : 'Месяц'}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <Text
          style={{
            color: t.text,
            fontSize: 36 * t.fontScale,
            fontWeight: '800',
            fontFamily: t.fontDisplay,
            fontStyle: 'italic',
            letterSpacing: -1,
          }}
        >
          {km.toFixed(2)} км
        </Text>
        <Text style={{ color: t.text2, fontSize: 13 * t.fontScale, fontFamily: t.font }}>
          {summary.totalSessions} {pluralize(summary.totalSessions, 'пробежка', 'пробежки', 'пробежек')}
        </Text>
      </View>

      {summary.totalSessions > 0 ? (
        <View style={{ flexDirection: 'row', gap: 18, marginTop: 12 }}>
          <MiniMetric label="ВРЕМЯ" value={`${durMin} мин`} t={t} />
          {summary.averagePaceMinKm !== null ? (
            <MiniMetric label="СР. ТЕМП" value={`${formatPace(summary.averagePaceMinKm)} /км`} t={t} />
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

function SessionRow({
  session,
  onPress,
  onLongPress,
  t,
}: {
  session: Session;
  onPress: () => void;
  onLongPress: () => void;
  t: ReturnType<typeof useTheme>;
}) {
  const distStr = session.distanceM !== null ? formatDistance(session.distanceM) : '—';
  const durS =
    session.endedAt !== null
      ? Math.max(0, Math.floor((session.endedAt - session.startedAt) / 1000))
      : 0;
  const pace = (() => {
    if (session.distanceM === null || session.distanceM === 0 || durS === 0) return null;
    return durS / 60 / (session.distanceM / 1000);
  })();

  const status = (() => {
    if (session.endedAt === null) return { text: 'не завершена', color: t.warn };
    if (session.isClosed === true) return { text: 'замкнут', color: t.lime };
    return { text: 'открытый трек', color: t.text2 };
  })();

  return (
    <Pressable onPress={onPress} onLongPress={onLongPress}>
      {({ pressed }) => (
        <Card style={{ padding: 16, opacity: pressed ? 0.7 : 1 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <Text style={{ color: t.text2, fontSize: 12 * t.fontScale, fontFamily: t.font }}>
              {formatStart(session.startedAt)}
            </Text>
            <View
              style={{
                paddingHorizontal: 8,
                paddingVertical: 2,
                borderRadius: 999,
                backgroundColor: status.color === t.lime ? 'rgba(198,245,96,0.12)' : 'rgba(255,255,255,0.06)',
              }}
            >
              <Text style={{ color: status.color, fontSize: 11 * t.fontScale, fontWeight: '600', fontFamily: t.font }}>
                {status.text}
              </Text>
            </View>
          </View>

          <Text
            style={{
              color: t.text,
              fontSize: 32 * t.fontScale,
              fontWeight: '800',
              fontFamily: t.fontDisplay,
              fontStyle: 'italic',
              letterSpacing: -1,
              marginTop: 4,
            }}
          >
            {distStr}
          </Text>

          <View style={{ flexDirection: 'row', gap: 18, marginTop: 8, flexWrap: 'wrap' }}>
            <MiniMetric label="ВРЕМЯ" value={formatDuration(durS)} t={t} />
            <MiniMetric label="ТЕМП" value={`${formatPace(pace)} /км`} t={t} />
            {session.avgHrBpm !== null ? (
              <MiniMetric label="ПУЛЬС" value={`${session.avgHrBpm}`} t={t} />
            ) : null}
            {session.isClosed === true && session.areaM2 !== null ? (
              <MiniMetric label="ПЛОЩАДЬ" value={formatArea(session.areaM2)} t={t} />
            ) : null}
          </View>
        </Card>
      )}
    </Pressable>
  );
}

function MiniMetric({
  label,
  value,
  t,
}: {
  label: string;
  value: string;
  t: ReturnType<typeof useTheme>;
}) {
  return (
    <View>
      <Text style={{ color: t.text3, fontSize: 10 * t.fontScale, letterSpacing: 0.5, fontFamily: t.font }}>
        {label}
      </Text>
      <Text style={{ color: t.text, fontSize: 13 * t.fontScale, fontWeight: '700', fontFamily: t.font, marginTop: 1 }}>
        {value}
      </Text>
    </View>
  );
}

function formatStart(epochMs: number): string {
  const d = new Date(epochMs);
  return d.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function pluralize(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}
