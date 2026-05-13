// Tab: Я / Статистика — Phase 8 / M10.3.
//
// Period toggle (Week/Month) + базовые agg-карточки + sparkline
// pace и distance по последним N сессиям. SVG-графика, без heavy
// chart libs.

import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Svg, { Path, Circle } from 'react-native-svg';

import { Card, Icon, useTheme } from '../../../design';
import { useHistoryStore } from '../../../state/history';
import { aggregateSessions, type StatsPeriod } from '../../../domain/stats';
import {
  formatCalories,
  formatDistance,
  formatDuration,
  formatPace,
} from '../../../ui/format';
import type { Session } from '../../../domain/types';
import type { MeStackParamList } from '../../types';

type Nav = NativeStackNavigationProp<MeStackParamList, 'Stats'>;

export function StatsScreen() {
  const t = useTheme();
  const nav = useNavigation<Nav>();
  const sessions = useHistoryStore((s) => s.sessions);
  const refresh = useHistoryStore((s) => s.refresh);
  const [period, setPeriod] = useState<StatsPeriod>('week');

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  const summary = useMemo(() => aggregateSessions(sessions, period), [sessions, period]);

  // Last 14 finished sessions, oldest → newest (для sparkline).
  const recent = useMemo(() => {
    return [...sessions]
      .filter((s) => s.endedAt !== null && (s.distanceM ?? 0) > 0)
      .sort((a, b) => a.startedAt - b.startedAt)
      .slice(-14);
  }, [sessions]);

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <View
        style={{
          paddingTop: 56, paddingHorizontal: 20, paddingBottom: 14,
          flexDirection: 'row', alignItems: 'center', gap: 12,
        }}
      >
        <Pressable onPress={() => nav.goBack()} hitSlop={10}>
          <Icon name="back" size={26} color={t.text} />
        </Pressable>
        <Text
          style={{
            fontSize: 28 * t.fontScale,
            fontWeight: '800',
            letterSpacing: -0.5,
            color: t.text,
            fontFamily: t.font,
          }}
        >
          Статистика
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 60, gap: 12 }}>
        {/* Toggle */}
        <View
          style={{
            flexDirection: 'row',
            padding: 3,
            backgroundColor: t.surface,
            borderRadius: 999,
            alignSelf: 'flex-start',
          }}
        >
          {(['week', 'month', 'all'] as const).map((p) => (
            <Pressable
              key={p}
              onPress={() => setPeriod(p)}
              style={{
                paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999,
                backgroundColor: period === p ? t.lime : 'transparent',
              }}
            >
              <Text
                style={{
                  color: period === p ? '#000' : t.text2,
                  fontSize: 13 * t.fontScale,
                  fontWeight: '700',
                  fontFamily: t.font,
                }}
              >
                {p === 'week' ? 'Неделя' : p === 'month' ? 'Месяц' : 'Всё'}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Cards */}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <StatCell
            label="ДИСТАНЦИЯ"
            value={formatDistance(summary.totalDistanceM)}
            t={t}
          />
          <StatCell
            label="ВРЕМЯ"
            value={formatDuration(Math.floor(summary.totalDurationS))}
            t={t}
          />
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <StatCell
            label="ПРОБЕЖКИ"
            value={String(summary.totalSessions)}
            t={t}
          />
          <StatCell
            label="СР. ТЕМП"
            value={summary.averagePaceMinKm !== null ? `${formatPace(summary.averagePaceMinKm)}` : '—'}
            t={t}
          />
        </View>

        {/* Sparklines */}
        {recent.length >= 2 ? (
          <>
            <Card style={{ padding: 16 }}>
              <Text style={{ color: t.text3, fontSize: 11, letterSpacing: 0.3, fontFamily: t.font }}>
                ДИСТАНЦИЯ ПО ПРОБЕЖКАМ
              </Text>
              <Sparkline
                values={recent.map((s) => (s.distanceM ?? 0) / 1000)}
                color={t.lime}
                t={t}
              />
              <Text style={{ marginTop: 6, fontSize: 11 * t.fontScale, color: t.text3, fontFamily: t.font }}>
                последние {recent.length} · {formatDistance(recent[0].distanceM ?? 0)} → {formatDistance(recent[recent.length - 1].distanceM ?? 0)}
              </Text>
            </Card>

            <Card style={{ padding: 16 }}>
              <Text style={{ color: t.text3, fontSize: 11, letterSpacing: 0.3, fontFamily: t.font }}>
                СРЕДНИЙ ТЕМП (ниже = быстрее)
              </Text>
              <Sparkline
                values={recent.map((s) => avgPaceForSession(s)).map((p) => p ?? 0)}
                color={t.accent}
                t={t}
              />
            </Card>
          </>
        ) : recent.length > 0 ? (
          <Text style={{ marginTop: 12, color: t.text3, fontSize: 13, textAlign: 'center', fontFamily: t.font }}>
            Минимум 2 пробежки для графика
          </Text>
        ) : (
          <View style={{ paddingTop: 60, alignItems: 'center' }}>
            <Icon name="chart" size={48} color={t.text3} />
            <Text style={{ marginTop: 12, color: t.text2, fontSize: 14, fontFamily: t.font, textAlign: 'center' }}>
              Пока нет данных для графиков
            </Text>
          </View>
        )}

        {summary.totalSessions > 0 ? (
          <Text style={{ marginTop: 4, fontSize: 11 * t.fontScale, color: t.text3, fontFamily: t.font, textAlign: 'center' }}>
            Калории за период: {formatCalories(estimateCaloriesTotal(sessions, summary.startMs, summary.endMs))}
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

function StatCell({
  label,
  value,
  t,
}: {
  label: string;
  value: string;
  t: ReturnType<typeof useTheme>;
}) {
  return (
    <Card p={14} style={{ flex: 1 }}>
      <Text style={{ color: t.text3, fontSize: 11 * t.fontScale, letterSpacing: 0.3, fontFamily: t.font }}>
        {label}
      </Text>
      <Text
        style={{
          color: t.text,
          fontSize: 22 * t.fontScale,
          fontWeight: '800',
          fontFamily: t.fontDisplay,
          fontStyle: 'italic',
          letterSpacing: -0.5,
          marginTop: 4,
        }}
      >
        {value}
      </Text>
    </Card>
  );
}

function Sparkline({
  values,
  color,
  t,
}: {
  values: readonly number[];
  color: string;
  t: ReturnType<typeof useTheme>;
}) {
  // Полная ширина считается на runtime через onLayout; для simplicity
  // используем viewBox 0..100 × 0..30 и SVG растягивается до ширины родителя.
  const W = 100;
  const H = 30;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = values.map((v, i) => {
    const x = (i / Math.max(1, values.length - 1)) * W;
    const y = H - ((v - min) / range) * H;
    return { x, y };
  });
  const d = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`)
    .join(' ');
  const lastPoint = points[points.length - 1];
  return (
    <View style={{ marginTop: 12 }}>
      <Svg viewBox={`0 0 ${W} ${H}`} width="100%" height={50} preserveAspectRatio="none">
        <Path d={d} stroke={color} strokeWidth={1.5} fill="none" />
        <Circle cx={lastPoint.x} cy={lastPoint.y} r={2.5} fill={color} />
      </Svg>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
        <Text style={{ color: t.text3, fontSize: 10 * t.fontScale, fontFamily: t.font }}>
          {min.toFixed(min < 10 ? 2 : 0)}
        </Text>
        <Text style={{ color: t.text3, fontSize: 10 * t.fontScale, fontFamily: t.font }}>
          {max.toFixed(max < 10 ? 2 : 0)}
        </Text>
      </View>
    </View>
  );
}

function avgPaceForSession(s: Session): number | null {
  if (s.endedAt === null || s.distanceM === null || s.distanceM <= 0) return null;
  const durS = (s.endedAt - s.startedAt) / 1000;
  if (durS <= 0) return null;
  return durS / 60 / (s.distanceM / 1000);
}

function estimateCaloriesTotal(sessions: readonly Session[], startMs: number, endMs: number): number {
  let total = 0;
  for (const s of sessions) {
    if (s.startedAt < startMs || s.startedAt >= endMs) continue;
    if (s.caloriesKcal !== null) total += s.caloriesKcal;
  }
  return total;
}
