// Auth: onboarding intro stub. Hero photo + headline + Войти.
// M2 — visual placeholder; M4 — full интерактивный flow.

import { ImageBackground, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { Button, Chip, Icon, useTheme } from '../../../design';
import type { AuthStackParamList } from '../../types';

export function ScreenOnboardIntro() {
  const t = useTheme();
  const nav = useNavigation<NativeStackNavigationProp<AuthStackParamList>>();
  return (
    <View style={{ flex: 1, backgroundColor: t.bg, padding: 24, paddingTop: 60 }}>
      <View style={{ flexDirection: 'row', gap: 6, marginBottom: 28 }}>
        {[1, 2, 3, 4].map((i) => (
          <View
            key={i}
            style={{
              flex: 1,
              height: 3,
              borderRadius: 2,
              backgroundColor: i === 1 ? t.lime : t.surface2,
            }}
          />
        ))}
      </View>

      <ImageBackground
        source={{ uri: 'https://images.unsplash.com/photo-1571008887538-b36bb32f4571?w=600' }}
        style={{ height: 340, borderRadius: t.r.xl, overflow: 'hidden', justifyContent: 'flex-end' }}
        imageStyle={{ borderRadius: t.r.xl }}
      >
        <View style={{ padding: 16 }}>
          <Chip icon={<Icon name="run" size={12} color={t.lime} />} bg="rgba(0,0,0,0.6)" color={t.lime}>
            16 км · 04:55
          </Chip>
        </View>
      </ImageBackground>

      <View style={{ marginTop: 36, flex: 1 }}>
        <Text
          style={{
            fontSize: 36 * t.fontScale,
            fontWeight: '800',
            letterSpacing: -1.5,
            lineHeight: 38,
            color: t.text,
            fontFamily: t.font,
          }}
        >
          Бег — это лучшее <Text style={{ color: t.lime }}>лекарство</Text>
        </Text>
        <Text
          style={{
            fontSize: 16 * t.fontScale,
            color: t.text2,
            lineHeight: 24,
            marginTop: 16,
            fontFamily: t.font,
          }}
        >
          Делись своими пробежками, читай истории друзей и находи единомышленников.
        </Text>
      </View>

      <Button variant="primary" size="lg" full onPress={() => nav.navigate('Email')}>
        Войти
      </Button>
      <Text
        style={{
          textAlign: 'center',
          fontSize: 14 * t.fontScale,
          color: t.text2,
          marginTop: 16,
          fontFamily: t.font,
        }}
      >
        Уже с нами? <Text style={{ color: t.text, fontWeight: '600' }}>Восстановить аккаунт</Text>
      </Text>
    </View>
  );
}
