// Auth: birthday picker stub (visual only).
// M4 — real wheel picker (e.g. @react-native-picker/picker или DateTimePicker).

import { Pressable, Text, View } from 'react-native';

import { Button, Icon, useTheme } from '../../../design';

export function ScreenBirthday({
  onBack, onContinue,
}: {
  onBack?: () => void;
  onContinue?: () => void;
}) {
  const t = useTheme();

  // Stub values — design-accurate placeholder rows.
  const cols: ReadonlyArray<ReadonlyArray<readonly [string, string]>> = [
    [['13', t.text3], ['14', t.text], ['15', t.text3]],
    [['апр.', t.text3], ['май', t.text], ['июн.', t.text3]],
    [['2005', t.text3], ['2006', t.text], ['2007', t.text3]],
  ];

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

      <View style={{ flex: 1 }} />

      <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
        {cols.map((rows, i) => (
          <View key={i} style={{ alignItems: 'center', gap: 18 }}>
            {rows.map(([txt, c], j) => (
              <View key={j} style={{ position: 'relative', paddingHorizontal: 6 }}>
                <Text
                  style={{
                    fontSize: 32 * t.fontScale,
                    fontWeight: '600',
                    color: c,
                    fontFamily: t.font,
                  }}
                >
                  {txt}
                </Text>
                {j === 1 && (
                  <View
                    style={{
                      position: 'absolute',
                      bottom: -8,
                      left: 0,
                      right: 0,
                      height: 2,
                      backgroundColor: t.lime,
                      borderRadius: 1,
                    }}
                  />
                )}
              </View>
            ))}
          </View>
        ))}
      </View>

      <View style={{ flex: 1 }} />

      <Button variant="primary" size="lg" full onPress={onContinue}>
        Продолжить
      </Button>
    </View>
  );
}
