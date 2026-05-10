// Tab: Запись (tracker pre-start) — stub. Real M6.

import { Text, View } from 'react-native';

import { Button, Chip, Icon, useTheme } from '../../../design';

export function RecordScreenStub() {
  const t = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      {/* Fake map area */}
      <View style={{ flex: 1, backgroundColor: t.surface3 }}>
        <View style={{ paddingTop: 60, paddingHorizontal: 16, flexDirection: 'row', justifyContent: 'space-between' }}>
          <View
            style={{
              width: 40, height: 40, borderRadius: 20,
              backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Icon name="back" size={20} color={t.text} />
          </View>
          <Chip icon={<View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: t.lime }} />} bg="rgba(0,0,0,0.6)" color={t.text}>
            GPS отличный
          </Chip>
        </View>
      </View>

      {/* Bottom sheet */}
      <View
        style={{
          backgroundColor: t.bg,
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          padding: 20,
          paddingBottom: 32,
        }}
      >
        <View style={{ width: 36, height: 4, backgroundColor: t.surface2, borderRadius: 2, alignSelf: 'center', marginBottom: 16 }} />

        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 18 }}>
          {[['Бег', true], ['Трейл', false], ['Интервалы', false], ['Велик', false]].map(([n, a], i) => (
            <View
              key={i}
              style={{
                paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
                backgroundColor: a ? t.lime : t.surface,
              }}
            >
              <Text style={{ color: a ? '#000' : t.text, fontSize: 13 * t.fontScale, fontWeight: '600', fontFamily: t.font }}>
                {String(n)}
              </Text>
            </View>
          ))}
        </View>

        <Text style={{ fontSize: 12 * t.fontScale, color: t.text3, fontFamily: t.font }}>Длительность</Text>
        <Text
          style={{
            fontSize: 56 * t.fontScale,
            fontWeight: '800',
            fontFamily: t.fontDisplay,
            fontStyle: 'italic',
            letterSpacing: -2,
            color: t.text,
          }}
        >
          00:00:00
        </Text>

        <Button variant="primary" size="lg" full style={{ marginTop: 18, height: 64, borderRadius: 32 }}
          icon={<Icon name="play" size={22} color="#000" />}>
          НАЧАТЬ ЗАБЕГ
        </Button>
      </View>
    </View>
  );
}
