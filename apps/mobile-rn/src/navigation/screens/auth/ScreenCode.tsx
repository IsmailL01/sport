// Auth: 6-digit OTP code entry. POST /auth/login-with-code on full code.
// Phase 8 / M4.
//
// UX:
//   - 6 cells, auto-focus next on digit, backspace → prev
//   - Auto-submit on 6th digit
//   - Submit спинит → success меняет auth state → RootNavigator
//     автоматически переключается на AppTabs (через AuthState !== auth)
//   - На error показывает inline баннер + очищает поля

import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { Icon, useTheme } from '../../../design';
import { useAuthStore } from '../../../state/auth';
import type { AuthStackParamList } from '../../types';

const CELL_COUNT = 6;

export function ScreenCode() {
  const t = useTheme();
  const nav = useNavigation<NativeStackNavigationProp<AuthStackParamList>>();
  const route = useRoute<RouteProp<AuthStackParamList, 'Code'>>();
  const email = route.params?.email ?? '';

  const loginWithCode = useAuthStore((s) => s.loginWithCode);
  const requestCode = useAuthStore((s) => s.requestCode);
  const authState = useAuthStore((s) => s.state);
  const authError = useAuthStore((s) => s.error);
  const submitting = authState === 'authenticating';

  const inputsRef = useRef<Array<TextInput | null>>([]);
  const [digits, setDigits] = useState<string[]>(Array(CELL_COUNT).fill(''));

  // Focus first cell on mount.
  useEffect(() => {
    const id = setTimeout(() => inputsRef.current[0]?.focus(), 200);
    return () => clearTimeout(id);
  }, []);

  const onSubmit = async (code: string) => {
    const ok = await loginWithCode(email, code);
    if (!ok) {
      // Очистить поля, вернуться в первую.
      setDigits(Array(CELL_COUNT).fill(''));
      inputsRef.current[0]?.focus();
    }
    // На success — RootNavigator auto-switches к AppTabs, ничего делать не надо.
  };

  // Auto-submit when all 6 digits entered.
  useEffect(() => {
    if (digits.every((d) => d.length === 1) && !submitting) {
      void onSubmit(digits.join(''));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [digits]);

  const onChange = (idx: number, val: string) => {
    // val может быть 1 или 6 цифр (при paste). Очищаем не-цифры.
    const clean = val.replace(/\D/g, '');
    if (clean.length === 0) {
      // Backspace: clear current cell.
      const next = [...digits];
      next[idx] = '';
      setDigits(next);
      return;
    }
    if (clean.length >= CELL_COUNT) {
      // Paste — fill all cells.
      const next = clean.slice(0, CELL_COUNT).split('');
      while (next.length < CELL_COUNT) next.push('');
      setDigits(next);
      inputsRef.current[CELL_COUNT - 1]?.focus();
      return;
    }
    // Single digit: fill current + advance.
    const next = [...digits];
    next[idx] = clean.charAt(0);
    setDigits(next);
    if (idx + 1 < CELL_COUNT) {
      inputsRef.current[idx + 1]?.focus();
    }
  };

  const onKeyPress = (idx: number, key: string) => {
    if (key === 'Backspace' && digits[idx] === '' && idx > 0) {
      inputsRef.current[idx - 1]?.focus();
      const next = [...digits];
      next[idx - 1] = '';
      setDigits(next);
    }
  };

  const onResend = async () => {
    await requestCode(email);
    setDigits(Array(CELL_COUNT).fill(''));
    inputsRef.current[0]?.focus();
  };

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
          const focused = i === digits.findIndex((x) => x === '');
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
              <TextInput
                ref={(r) => {
                  inputsRef.current[i] = r;
                }}
                value={d}
                onChangeText={(v) => onChange(i, v)}
                onKeyPress={({ nativeEvent }) => onKeyPress(i, nativeEvent.key)}
                keyboardType="number-pad"
                maxLength={i === 0 ? CELL_COUNT : 1}
                textContentType="oneTimeCode"
                autoComplete="one-time-code"
                editable={!submitting}
                style={{
                  flex: 1,
                  width: '100%',
                  textAlign: 'center',
                  fontSize: 28 * t.fontScale,
                  fontWeight: '700',
                  color: t.text,
                  fontFamily: t.fontDisplay,
                }}
              />
            </View>
          );
        })}
      </View>

      <View style={{ marginTop: 24, flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
        {submitting ? (
          <ActivityIndicator color={t.text2} />
        ) : (
          <>
            <Icon name="stopwatch" size={14} color={t.text2} />
            <Pressable onPress={onResend} hitSlop={6}>
              <Text style={{ color: t.lime, fontSize: 14 * t.fontScale, fontFamily: t.font }}>
                Отправить заново
              </Text>
            </Pressable>
          </>
        )}
      </View>

      {authError ? (
        <Text style={{ marginTop: 16, textAlign: 'center', color: t.error, fontSize: 13, fontFamily: t.font }}>
          {authError}
        </Text>
      ) : null}

      <View style={{ flex: 1 }} />

      <Text style={{ textAlign: 'center', color: t.text3, fontSize: 13 * t.fontScale, marginBottom: 16, fontFamily: t.font }}>
        код придёт на почту в течение минуты
      </Text>
    </View>
  );
}
