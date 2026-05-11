// Auth: email entry. POST /auth/request-code → navigate Code (с devCode для dev UX).
// Phase 8 / M4.

import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, TextInput, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { Button, Icon, useTheme } from '../../../design';
import { useAuthStore } from '../../../state/auth';
import type { AuthMode, AuthStackParamList } from '../../types';

export function ScreenEmail() {
  const t = useTheme();
  const nav = useNavigation<NativeStackNavigationProp<AuthStackParamList>>();
  const route = useRoute<RouteProp<AuthStackParamList, 'Email'>>();
  const mode: AuthMode = route.params?.mode ?? 'signup';
  const requestCode = useAuthStore((s) => s.requestCode);
  const authState = useAuthStore((s) => s.state);
  const authError = useAuthStore((s) => s.error);
  const [email, setEmail] = useState('');
  const submitting = authState === 'authenticating';

  const title = mode === 'signin' ? 'С возвращением' : 'Твоя почта';
  const subtitle = mode === 'signin'
    ? 'Введи email — пришлём 6-значный код. Пароля не нужно.'
    : 'Мы пришлём 6-значный код для регистрации. Без паролей.';

  const onSubmit = async () => {
    const normalized = email.trim().toLowerCase();
    if (normalized.length < 5 || !normalized.includes('@')) {
      Alert.alert('Неверный email', 'Введи корректный адрес.');
      return;
    }
    const result = await requestCode(normalized);
    if (result === null) return; // error already set in store
    nav.navigate('Code', { email: normalized, mode });
  };
  return (
    <View style={{ flex: 1, backgroundColor: t.bg, padding: 24, paddingTop: 60 }}>
      <Pressable onPress={() => nav.goBack()} hitSlop={10}>
        <Icon name="back" size={26} color={t.text} />
      </Pressable>

      <View style={{ marginTop: 28 }}>
        <Text style={{ fontSize: 32 * t.fontScale, fontWeight: '800', letterSpacing: -1, color: t.text, fontFamily: t.font }}>
          {title}
        </Text>
        <Text style={{ fontSize: 15 * t.fontScale, color: t.text2, lineHeight: 22, marginTop: 12, fontFamily: t.font }}>
          {subtitle}
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
        {mode === 'signup'
          ? 'Регистрируясь, ты соглашаешься '
          : 'Продолжая, ты соглашаешься '}
        <Text style={{ color: t.text }}>с правилами обработки персональных данных</Text>
      </Text>

      {authError ? (
        <Text style={{ marginTop: 12, color: t.error, fontSize: 13, fontFamily: t.font }}>
          {authError}
        </Text>
      ) : null}

      <View style={{ flex: 1 }} />

      <Button
        variant="primary"
        size="lg"
        full
        disabled={submitting || email.trim().length < 5 || !email.includes('@')}
        onPress={onSubmit}
        icon={submitting ? <ActivityIndicator color="#0A0A0A" /> : undefined}
      >
        {submitting ? 'Отправка…' : 'Получить код'}
      </Button>
    </View>
  );
}
