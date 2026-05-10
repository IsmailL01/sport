// Metric — big display number + small label underneath.
// Phase 8 / M1.
//
// Sizes (px):
//   sm: 22, md: 28, lg: 44, xl: 64
//
// Uses fontDisplay + italic + tabular-nums (where supported) for that
// Cursona run-tracker vibe.

import { Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '../ThemeProvider';

export type MetricSize = 'sm' | 'md' | 'lg' | 'xl' | 'xxl';

export type MetricProps = {
  /** Pre-formatted value string (e.g. "16,00", "01:18:56", "04:55"). */
  value: string;
  /** Small label (e.g. "Расстояние, км"). */
  label?: string;
  size?: MetricSize;
  /** Override colour. */
  accent?: string;
  /** Make value italic (Cursona-style for big numbers). */
  italic?: boolean;
  style?: StyleProp<ViewStyle>;
};

const SIZE_PX: Record<MetricSize, number> = {
  sm: 22,
  md: 28,
  lg: 44,
  xl: 64,
  xxl: 96,
};

export function Metric({
  value,
  label,
  size = 'md',
  accent,
  italic = false,
  style,
}: MetricProps) {
  const t = useTheme();
  const fontSize = SIZE_PX[size];
  return (
    <View style={[{ flexDirection: 'column' }, style]}>
      <Text
        style={{
          fontSize,
          fontWeight: '800',
          letterSpacing: fontSize >= 64 ? -4 : fontSize >= 44 ? -2 : -1.5,
          fontFamily: t.fontDisplay,
          fontStyle: italic ? 'italic' : 'normal',
          color: accent || t.text,
          lineHeight: fontSize * 1.0,
        }}
      >
        {value}
      </Text>
      {label ? (
        <Text
          style={{
            fontSize: 12 * t.fontScale,
            color: t.text2,
            fontWeight: '500',
            letterSpacing: -0.1,
            fontFamily: t.font,
            marginTop: 2,
          }}
        >
          {label}
        </Text>
      ) : null}
    </View>
  );
}
