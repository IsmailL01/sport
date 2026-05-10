// Tab: Журнал — stub. Real M8 (reads useHistoryStore.sessions).

import { ScrollView, Text, View } from 'react-native';

import { Icon, useTheme } from '../../../design';

type DayCell = null | { km: number; col?: string; hr?: number; badge?: number };

const WEEKS: ReadonlyArray<{ range: string; km: string; rows: ReadonlyArray<DayCell> }> = [
  { range: '4–10 май', km: '29,3', rows: [null, null, null, null, null, { km: 20.9, hr: 112 }, { km: 8.39 }] },
  { range: '27 апр.–3 май', km: '44', rows: [null, { km: 9 }, null, null, { km: 12 }, { km: 16 }, { km: 7 }] },
  { range: '20–26 апр.', km: '68', rows: [{ km: 5 }, { km: 19, badge: 2 }, { km: 13 }, null, null, { km: 28, badge: 2 }, { km: 3 }] },
];

export function JournalScreenStub() {
  const t = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={{ paddingHorizontal: 20, paddingTop: 12 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontSize: 30 * t.fontScale, fontWeight: '800', letterSpacing: -1, color: t.text, fontFamily: t.font }}>
            Журнал
          </Text>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Icon name="calendar" size={22} color={t.text} />
            <Icon name="filter" size={22} color={t.text} />
          </View>
        </View>

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 18 }}>
          {['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС'].map((d) => (
            <View key={d} style={{ width: 38, alignItems: 'center' }}>
              <Text style={{ fontSize: 11 * t.fontScale, color: t.text3, fontWeight: '600', letterSpacing: 0.5, fontFamily: t.font }}>
                {d}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100, paddingTop: 8 }}>
        {WEEKS.map((w, wi) => (
          <View
            key={wi}
            style={{
              paddingTop: 18,
              paddingBottom: 18,
              borderBottomWidth: 1,
              borderBottomColor: t.divider,
              borderStyle: 'dashed',
            }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
              <Text style={{ fontSize: 14 * t.fontScale, color: t.text2, fontFamily: t.font }}>{w.range}</Text>
              <Text style={{ fontSize: 14 * t.fontScale, color: t.text, fontWeight: '700', fontFamily: t.fontDisplay, fontStyle: 'italic' }}>
                {w.km} км
              </Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              {w.rows.map((r, i) => (
                <View
                  key={i}
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 19,
                    backgroundColor: r ? (r.col || t.text2) : t.surface,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: r ? 2 : 0,
                    borderColor: r ? t.text : 'transparent',
                  }}
                >
                  <Text
                    style={{
                      color: r ? '#0A0A0A' : t.text3,
                      fontSize: 12 * t.fontScale,
                      fontWeight: '700',
                      fontFamily: t.fontDisplay,
                    }}
                  >
                    {r ? r.km : '·'}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
