// Auth: 6-digit code entry stub. M4 — full OTP + /auth/login-with-code.

import { Pressable, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { Icon, useTheme } from '../../../design';
import type { AuthStackParamList } from '../../types';

export function ScreenCode() {
  const t = useTheme();
  const nav = useNavigation<NativeStackNavigationProp<AuthStackParamList>>();
  const route = useRoute<RouteProp<AuthStackParamList, 'Code'>>();
  const email = route.params?.email ?? '';

  // Mock-prefilled (4/7/2/3/_/_) per design; будет live input в M4.
  const digits = ['4', '7', '2', '3', '', ''];

  return (
    <View style={{ flex: 1, backgroundColor: t.bg, padding: 24, paddingTop: 60 }}>
      <Pressable onPress={() => nav.goBack()} hitSlop={10}>
        <Icon name="back" size={26} color={t.text} />
      </Pressable>

      <View style={{ marginTop: 28 }}>
        <Text style={{ fontSize: 32 * t.fontScale, fontWeight: '800', letterSpacing: -1, color: t.text, fontFamily: t.font }}>
          Введи код
        </Text>
        <Text style={{ fontSize: 15 * t.fontScale, color: t.text2, lineHeight: 22, marginTop: 12, fontFamily: t.font }}>
          Мы отправили 6-значный код на <Text style={{ color: t.text }}>{email}</Text>
        </Text>
      </View>

      <View style={{ flexDirection: 'row', gap: 10, marginTop: 32 }}>
        {digits.map((d, i) => {
          const focused = i === digits.findIndex((x) => !x);
          return (
            <View
              key={i}
              style={{
                flex: 1,
                height: 64,
                borderRadius: t.r.md,
                backgroundColor: t.surface,
                borderWidth: 2,
                borderColor: focused ? t.lime : 'transparent',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text
                style={{
                  fontSize: 28 * t.fontScale,
                  fontWeight: '700',
                  color: d ? t.text : t.text3,
                  fontFamily: t.fontDisplay,
                }}
              >
                {d || ''}
              </Text>
            </View>
          );
        })}
      </View>

      <View style={{ marginTop: 24, flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
        <Icon name="stopwatch" size={14} color={t.text2} />
        <Text style={{ color: t.text2, fontSize: 14 * t.fontScale, fontFamily: t.font }}>повторно через 00:42</Text>
      </View>

      <View style={{ flex: 1 }} />

      <Text style={{ textAlign: 'center', color: t.text3, fontSize: 13 * t.fontScale, marginBottom: 16, fontFamily: t.font }}>
        код придёт на почту в течение минуты
      </Text>
    </View>
  );
}
