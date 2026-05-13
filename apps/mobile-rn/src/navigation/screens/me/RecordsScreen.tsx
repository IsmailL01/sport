// Tab: Я / Личные рекорды — Phase 8 / M10.1.
//
// Список всех текущих рекордов user'а (по одному per kind), каждый —
// карточка с label, value, date. Empty state если рекордов ещё нет
// (новый user / первая сессия не завершена).

import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback } from 'react';

import { Card, Icon, useTheme } from '../../../design';
import {
  RECORD_ICONS,
  RECORD_LABELS,
  type PersonalRecord,
  type RecordKind,
} from '../../../domain/records';
import { formatRecordValue } from '../../../domain/recordsFormat';
import { listAllRecords } from '../../../storage/recordsRepository';
import type { MeStackParamList } from '../../types';

type Nav = NativeStackNavigationProp<MeStackParamList, 'Records'>;

// Canonical порядок для отображения (важные сверху).
const KIND_ORDER: RecordKind[] = [
  'longest_distance',
  'longest_duration',
  'best_pace_1km',
  'best_pace_5km',
  'best_pace_10km',
  'max_avg_speed',
  'most_calories',
];

export function RecordsScreen() {
  const t = useTheme();
  const nav = useNavigation<Nav>();
  const [records, setRecords] = useState<PersonalRecord[]>([]);

  // Re-load on focus (например после новой сессии).
  useFocusEffect(
    useCallback(() => {
      setRecords(listAllRecords());
    }, []),
  );

  // Initial.
  useEffect(() => {
    setRecords(listAllRecords());
  }, []);

  const byKind = new Map<RecordKind, PersonalRecord>(
    records.map((r) => [r.kind, r]),
  );

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
            fontSize: 28 * t.fontScale,
            fontWeight: '800',
            letterSpacing: -0.5,
            color: t.text,
            fontFamily: t.font,
          }}
        >
          Личные рекорды
        </Text>
      </View>

      {records.length === 0 ? (
        <View style={{ paddingTop: 80, paddingHorizontal: 32, alignItems: 'center' }}>
          <Icon name="trophy" size={48} color={t.text3} />
          <Text style={{ marginTop: 12, color: t.text2, fontSize: 15 * t.fontScale, fontFamily: t.font, textAlign: 'center' }}>
            Пока нет рекордов
          </Text>
          <Text style={{ marginTop: 6, color: t.text3, fontSize: 13 * t.fontScale, fontFamily: t.font, textAlign: 'center' }}>
            Заверши первую пробежку — все начнётся отсюда
          </Text>
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 60, gap: 10 }}
        >
          {KIND_ORDER.map((kind) => {
            const rec = byKind.get(kind);
            return <RecordRow key={kind} kind={kind} rec={rec ?? null} t={t} />;
          })}
        </ScrollView>
      )}
    </View>
  );
}

function RecordRow({
  kind,
  rec,
  t,
}: {
  kind: RecordKind;
  rec: PersonalRecord | null;
  t: ReturnType<typeof useTheme>;
}) {
  const filled = rec !== null;
  return (
    <Card style={{ padding: 16, opacity: filled ? 1 : 0.55 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: filled ? 'rgba(198,245,96,0.12)' : t.surface2,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon
            name={RECORD_ICONS[kind] as 'trophy'}
            size={20}
            color={filled ? t.lime : t.text3}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              color: t.text2,
              fontSize: 12 * t.fontScale,
              fontFamily: t.font,
              letterSpacing: 0.3,
            }}
          >
            {RECORD_LABELS[kind].toUpperCase()}
          </Text>
          <Text
            style={{
              color: t.text,
              fontSize: 22 * t.fontScale,
              fontWeight: '800',
              fontFamily: t.fontDisplay,
              fontStyle: 'italic',
              letterSpacing: -0.3,
              marginTop: 2,
            }}
          >
            {rec !== null ? formatRecordValue(kind, rec.value) : '—'}
          </Text>
          {rec !== null ? (
            <Text style={{ color: t.text3, fontSize: 11 * t.fontScale, marginTop: 2, fontFamily: t.font }}>
              {new Date(rec.achievedAt).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', year: 'numeric' })}
            </Text>
          ) : null}
        </View>
      </View>
    </Card>
  );
}
