// Auth: birthday entry. Phase 8 / M9.5.
//
// 3 простых TextInput для дня/месяца/года + валидация → ISO YYYY-MM-DD.
// Wheel-picker не используем (требует expo-modules / native-picker — heavy).
// onContinue(iso | null): null если пользователь нажал «Пропустить».

import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { Button, Icon, useTheme } from '../../../design';

export function ScreenBirthday({
  onBack,
  onContinue,
}: {
  onBack?: () => void;
  onContinue?: (iso: string | null) => void;
}) {
  const t = useTheme();
  const [day, setDay] = useState('');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');

  const parsed = parseDate(day, month, year);
  const valid = parsed !== null;

  return (
    <View style={{ flex: 1, backgroundColor: t.bg, padding: 24, paddingTop: 60 }}>
      <Pressable onPress={onBack} hitSlop={10}>
        <Icon name="back" size={26} color={t.text} />
      </Pressable>

      <Text
        style={{
          fontSize: 32 * t.fontScale,
          fontWeight: '800',
          letterSpacing: -1,
          marginTop: 28,
          marginBottom: 12,
          color: t.text,
          fontFamily: t.font,
        }}
      >
        Дата рождения
      </Text>
      <Text style={{ fontSize: 15 * t.fontScale, color: t.text2, lineHeight: 22, fontFamily: t.font }}>
        Поможет рассчитать пульсовые зоны и план тренировок
      </Text>

      <View style={{ flexDirection: 'row', gap: 10, marginTop: 32 }}>
        <Cell label="День" placeholder="14" value={day} setValue={setDay} maxLen={2} t={t} />
        <Cell label="Месяц" placeholder="05" value={month} setValue={setMonth} maxLen={2} t={t} />
        <Cell label="Год" placeholder="2006" value={year} setValue={setYear} maxLen={4} t={t} flex={2} />
      </View>

      {!valid && (day !== '' || month !== '' || year !== '') ? (
        <Text style={{ marginTop: 12, fontSize: 13 * t.fontScale, color: t.warn, fontFamily: t.font }}>
          Введи реальную дату (например, 14.05.2006)
        </Text>
      ) : null}

      <View style={{ flex: 1 }} />

      <Pressable onPress={() => onContinue?.(null)} style={{ alignSelf: 'center', paddingVertical: 12, marginBottom: 8 }} hitSlop={6}>
        <Text style={{ color: t.text3, fontSize: 14 * t.fontScale, fontFamily: t.font }}>Пропустить</Text>
      </Pressable>

      <Button
        variant="primary"
        size="lg"
        full
        disabled={!valid}
        onPress={() => onContinue?.(parsed)}
      >
        Продолжить
      </Button>
    </View>
  );
}

function Cell({
  label,
  placeholder,
  value,
  setValue,
  maxLen,
  flex = 1,
  t,
}: {
  label: string;
  placeholder: string;
  value: string;
  setValue: (v: string) => void;
  maxLen: number;
  flex?: number;
  t: ReturnType<typeof useTheme>;
}) {
  return (
    <View style={{ flex, backgroundColor: t.surface, borderRadius: t.r.md, padding: 14 }}>
      <Text style={{ fontSize: 11 * t.fontScale, color: t.text3, letterSpacing: 0.5, fontFamily: t.font }}>
        {label.toUpperCase()}
      </Text>
      <TextInput
        value={value}
        onChangeText={(v) => setValue(v.replace(/\D/g, '').slice(0, maxLen))}
        placeholder={placeholder}
        placeholderTextColor={t.text3}
        keyboardType="number-pad"
        maxLength={maxLen}
        style={{
          marginTop: 4,
          fontSize: 24 * t.fontScale,
          fontWeight: '700',
          color: t.text,
          fontFamily: t.fontDisplay,
          padding: 0,
        }}
      />
    </View>
  );
}

function parseDate(d: string, m: string, y: string): string | null {
  if (d.length < 1 || m.length < 1 || y.length !== 4) return null;
  const di = parseInt(d, 10);
  const mi = parseInt(m, 10);
  const yi = parseInt(y, 10);
  if (!Number.isFinite(di) || !Number.isFinite(mi) || !Number.isFinite(yi)) return null;
  if (mi < 1 || mi > 12) return null;
  if (di < 1 || di > 31) return null;
  const currentYear = new Date().getFullYear();
  if (yi < 1900 || yi > currentYear) return null;
  // Validate via Date (catches Feb 30 etc).
  const dt = new Date(yi, mi - 1, di);
  if (
    dt.getFullYear() !== yi ||
    dt.getMonth() !== mi - 1 ||
    dt.getDate() !== di
  ) {
    return null;
  }
  // Lower bound: должен быть хоть какой-то возраст (>=8 лет — sanity).
  const age = currentYear - yi;
  if (age < 8 || age > 120) return null;
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}
