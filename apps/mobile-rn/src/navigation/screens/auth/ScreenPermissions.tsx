// Auth: location/motion permission card stub.
// M4 — full hook to expo-location requestForegroundPermissionsAsync.

import { Pressable, Text, View } from 'react-native';

import { Icon, useTheme } from '../../../design';

export function ScreenPermissions({
  onAllow, onDeny,
}: {
  onAllow?: () => void;
  onDeny?: () => void;
}) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: t.bg, justifyContent: 'center', alignItems: 'center' }}>
      <View
        style={{
          width: '85%',
          backgroundColor: 'rgba(40,40,42,0.92)',
          borderRadius: 22,
          padding: 22,
        }}
      >
        <View
          style={{
            width: 64,
            height: 64,
            borderRadius: 14,
            backgroundColor: t.lime,
            alignItems: 'center',
            justifyContent: 'center',
            alignSelf: 'center',
            marginBottom: 16,
          }}
        >
          <Icon name="run" size={36} color="#0A0A0A" />
        </View>

        <Text
          style={{
            fontSize: 17 * t.fontScale,
            fontWeight: '600',
            textAlign: 'center',
            color: t.text,
            lineHeight: 23,
            fontFamily: t.font,
          }}
        >
          «Cursona» запрашивает доступ к данным о движении и фитнесе
        </Text>
        <Text
          style={{
            fontSize: 13 * t.fontScale,
            textAlign: 'center',
            color: t.text2,
            lineHeight: 19,
            marginTop: 10,
            fontFamily: t.font,
          }}
        >
          Нужно, чтобы корректно считать дистанцию, темп и калории во время пробежек.
        </Text>

        <View style={{ marginTop: 18, gap: 8 }}>
          <Pressable
            onPress={onDeny}
            style={{
              height: 44,
              borderRadius: 12,
              backgroundColor: 'rgba(255,255,255,0.08)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: t.text, fontSize: 15 * t.fontScale, fontWeight: '500', fontFamily: t.font }}>
              Не разрешать
            </Text>
          </Pressable>
          <Pressable
            onPress={onAllow}
            style={{
              height: 44,
              borderRadius: 12,
              backgroundColor: t.lime,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: '#0A0A0A', fontSize: 15 * t.fontScale, fontWeight: '700', fontFamily: t.font }}>
              Разрешить
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
