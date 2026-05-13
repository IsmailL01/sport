// HeatmapCalendar — 12-недельная сетка интенсивности.
// Phase 8 / M10.2.
//
// Чисто-визуальный компонент. Принимает cells (84 ячейки row-major,
// первая ячейка = понедельник самой старой нужной недели). UI окрашивает
// каждую ячейку по intensity 0..4: lime градиент.

import { Text, View } from 'react-native';

import { useTheme } from '../ThemeProvider';
import {
  buildHeatmap,
  intensityForCell,
  type HeatmapCell,
  type StreakSession,
} from '../../domain/streak';

const WEEKS = 12;
const DOW_LABELS = ['П', 'В', 'С', 'Ч', 'П', 'С', 'В']; // Mon..Sun

export type HeatmapCalendarProps = {
  sessions: readonly StreakSession[];
  /** Опциональная подпись над сеткой. */
  title?: string;
};

export function HeatmapCalendar({ sessions, title }: HeatmapCalendarProps) {
  const t = useTheme();
  const cells = buildHeatmap(sessions, WEEKS);
  const maxDistance = cells.reduce((m, c) => (c.distanceM > m ? c.distanceM : m), 0);

  // Re-layout: cells row-major (week × day) → нужна column-major сетка
  // (день × неделя), потому что DOW labels слева, недели горизонтально.
  // cells[weekIdx * 7 + dowIdx]. Поэтому строим day-row arrays.
  const rows: HeatmapCell[][] = Array.from({ length: 7 }, () => []);
  for (let i = 0; i < cells.length; i++) {
    const dow = i % 7;
    rows[dow].push(cells[i]);
  }

  return (
    <View>
      {title ? (
        <Text style={{ color: t.text3, fontSize: 11, fontFamily: t.font, letterSpacing: 0.5, marginBottom: 8 }}>
          {title.toUpperCase()}
        </Text>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {/* DOW column labels */}
        <View style={{ gap: 4, justifyContent: 'space-between', paddingVertical: 2 }}>
          {DOW_LABELS.map((d, i) => (
            <Text
              key={i}
              style={{
                fontSize: 9,
                color: t.text3,
                fontFamily: t.font,
                width: 10,
                textAlign: 'center',
              }}
            >
              {d}
            </Text>
          ))}
        </View>
        {/* Weeks grid: 12 columns */}
        <View style={{ flex: 1 }}>
          <View style={{ gap: 4 }}>
            {rows.map((row, di) => (
              <View key={di} style={{ flexDirection: 'row', gap: 4 }}>
                {row.map((c, wi) => (
                  <View
                    key={wi}
                    style={{
                      flex: 1,
                      aspectRatio: 1,
                      borderRadius: 3,
                      backgroundColor: cellColor(intensityForCell(c, maxDistance), t),
                      maxHeight: 18,
                    }}
                  />
                ))}
              </View>
            ))}
          </View>
        </View>
      </View>
    </View>
  );
}

function cellColor(intensity: 0 | 1 | 2 | 3 | 4, t: ReturnType<typeof useTheme>): string {
  switch (intensity) {
    case 0:
      return t.surface;
    case 1:
      return 'rgba(198,245,96,0.18)';
    case 2:
      return 'rgba(198,245,96,0.38)';
    case 3:
      return 'rgba(198,245,96,0.65)';
    case 4:
      return t.lime;
  }
}
