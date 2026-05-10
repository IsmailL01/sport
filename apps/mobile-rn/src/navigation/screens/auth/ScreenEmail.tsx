// Auth: email entry stub. M4 — real input + /auth/request-code call.

import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { Button, Icon, useTheme } from '../../../design';
import type { AuthStackParamList } from '../../types';

export function ScreenEmail() {
  const t = useTheme();
  const nav = useNavigation<NativeStackNavigationProp<AuthStackParamList>>();
  const [email, setEmail] = useState('');
  return (
    <View style={{ flex: 1, backgroundColor: t.bg, padding: 24, paddingTop: 60 }}>
      <Pressable onPress={() => nav.goBack()} hitSlop={10}>
        <Icon name="back" size={26} color={t.text} />
      </Pressable>

      <View style={{ marginTop: 28 }}>
        <Text style={{ fontSize: 32 * t.fontScale, fontWeight: '800', letterSpacing: -1, color: t.text, fontFamily: t.font }}>
          Твоя почта
        </Text>
        <Text style={{ fontSize: 15 * t.fontScale, color: t.text2, lineHeight: 22, marginTop: 12, fontFamily: t.font }}>
          Мы пришлём 6-значный код для входа. Без паролей.
        </Text>
      </View>

      <View
        style={{
          marginTop: 28,
          backgroundColor: t.surface,
          borderRadius: t.r.md,
          padding: 16,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <Icon name="envelope" size={20} color={t.text2} />
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="email@example.com"
          placeholderTextColor={t.text3}
          autoCapitalize="none"
          keyboardType="email-address"
          style={{
            flex: 1,
            fontSize: 18 * t.fontScale,
            fontWeight: '600',
            color: t.text,
            fontFamily: t.font,
            padding: 0,
          }}
        />
      </View>

      <Text style={{ marginTop: 12, fontSize: 13 * t.fontScale, color: t.text3, lineHeight: 20, fontFamily: t.font }}>
        Нажимая «Получить код», ты соглашаешься <Text style={{ color: t.text }}>с правилами обработки персональных данных</Text>
      </Text>

      <View style={{ flex: 1 }} />

      <Button
        variant="primary"
        size="lg"
        full
        disabled={email.trim().length < 3}
        onPress={() => nav.navigate('Code', { email })}
      >
        Получить код
      </Button>
    </View>
  );
}
