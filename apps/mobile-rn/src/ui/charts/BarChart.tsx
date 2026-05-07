// Простой bar-chart на чистых View. Без библиотек.
// Подходит для 7 / 30 баров (день/неделя). Для длинных — придётся
// оптимизировать или взять react-native-svg-charts (Phase 6+).

import { StyleSheet, Text, View } from 'react-native';

export type BarChartProps = {
  /** Высоты баров (произвольная величина, нормализуется к maxHeight). */
  values: readonly number[];
  /** Подписи под каждым баром (опционально). */
  labels?: readonly string[];
  /** Высота max-бара в пикселях. */
  maxHeight?: number;
  /** Цвет бара. */
  color?: string;
  /** Цвет text-меток. */
  labelColor?: string;
  /** Отметка (например, цель) — горизонтальная линия в относительных %. */
  thresholdValue?: number;
  thresholdLabel?: string;
};

export function BarChart({
  values,
  labels,
  maxHeight = 100,
  color = '#10B981',
  labelColor = '#94A3B8',
  thresholdValue,
  thresholdLabel,
}: BarChartProps) {
  const max = Math.max(1, ...values, thresholdValue ?? 0);
  const thresholdY =
    thresholdValue !== undefined && thresholdValue > 0
      ? Math.round(maxHeight - (thresholdValue / max) * maxHeight)
      : null;

  return (
    <View>
      <View style={[styles.barsRow, { height: maxHeight }]}>
        {thresholdY !== null && (
          <View
            style={[
              styles.threshold,
              { top: thresholdY, borderColor: '#F59E0B' },
            ]}
            pointerEvents="none"
          >
            {thresholdLabel && (
              <Text style={styles.thresholdLabel}>{thresholdLabel}</Text>
            )}
          </View>
        )}
        {values.map((v, i) => {
          const h = Math.max(2, Math.round((v / max) * maxHeight));
          const isZero = v === 0;
          return (
            <View key={i} style={styles.barCol}>
              <View
                style={[
                  styles.bar,
                  {
                    height: h,
                    backgroundColor: isZero ? '#1E293B' : color,
                  },
                ]}
              />
            </View>
          );
        })}
      </View>
      {labels && labels.length === values.length && (
        <View style={styles.labelsRow}>
          {labels.map((l, i) => (
            <Text key={i} style={[styles.label, { color: labelColor }]}>
              {l}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  barsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
    position: 'relative',
  },
  barCol: { flex: 1, alignItems: 'stretch', justifyContent: 'flex-end' },
  bar: { borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  threshold: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 0,
    borderTopWidth: 1,
    borderStyle: 'dashed',
    zIndex: 1,
  },
  thresholdLabel: {
    color: '#F59E0B',
    fontSize: 9,
    position: 'absolute',
    right: 0,
    top: -12,
  },
  labelsRow: { flexDirection: 'row', gap: 4, marginTop: 4 },
  label: { flex: 1, fontSize: 9, textAlign: 'center' },
});
