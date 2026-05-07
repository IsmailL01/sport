// Экран регистрации / login. Показывается когда auth.state === 'unauthenticated'.

import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useAuthStore } from '../state/auth';
import { apiClient } from '../auth/apiClient';

type Mode = 'login' | 'register';

export function AuthScreen() {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');

  const state = useAuthStore((s) => s.state);
  const error = useAuthStore((s) => s.error);
  const login = useAuthStore((s) => s.login);
  const register = useAuthStore((s) => s.register);

  const submitting = state === 'authenticating';
  const baseUrls = apiClient.getBaseUrls();

  const handleSubmit = async () => {
    if (mode === 'login') {
      await login(email.trim(), password);
    } else {
      await register(email.trim(), password, displayName.trim());
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Running Ecosystem</Text>
        <Text style={styles.subtitle}>
          {mode === 'login' ? 'Войти в аккаунт' : 'Создать аккаунт'}
        </Text>

        <View style={styles.tabs}>
          <Pressable
            style={[styles.tab, mode === 'login' && styles.tabActive]}
            onPress={() => setMode('login')}
            disabled={submitting}
          >
            <Text style={[styles.tabText, mode === 'login' && styles.tabTextActive]}>
              Login
            </Text>
          </Pressable>
          <Pressable
            style={[styles.tab, mode === 'register' && styles.tabActive]}
            onPress={() => setMode('register')}
            disabled={submitting}
          >
            <Text style={[styles.tabText, mode === 'register' && styles.tabTextActive]}>
              Register
            </Text>
          </Pressable>
        </View>

        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          inputMode="email"
          placeholder="you@example.com"
          placeholderTextColor="#475569"
          editable={!submitting}
        />

        <Text style={styles.label}>Password</Text>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
          placeholder="минимум 8 символов"
          placeholderTextColor="#475569"
          editable={!submitting}
        />

        {mode === 'register' && (
          <>
            <Text style={styles.label}>Имя (опционально)</Text>
            <TextInput
              style={styles.input}
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Anna"
              placeholderTextColor="#475569"
              editable={!submitting}
            />
          </>
        )}

        {error && <Text style={styles.error}>{error}</Text>}

        <Pressable
          style={[styles.submit, submitting && styles.submitDisabled]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.submitText}>
              {mode === 'login' ? 'Войти' : 'Зарегистрироваться'}
            </Text>
          )}
        </Pressable>

        <Text style={styles.hint}>
          API: {baseUrls.identity.replace(/^https?:\/\//, '')}
          {'\n'}Указать другой URL — через `EXPO_PUBLIC_IDENTITY_URL` при сборке.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F1419' },
  scroll: { padding: 24, paddingTop: 80, gap: 4 },
  title: { color: '#FFFFFF', fontSize: 28, fontWeight: '700', textAlign: 'center' },
  subtitle: {
    color: '#94A3B8',
    fontSize: 15,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 24,
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#1E293B',
    borderRadius: 10,
    padding: 4,
    marginBottom: 20,
  },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
  tabActive: { backgroundColor: '#10B981' },
  tabText: { color: '#94A3B8', fontSize: 14, fontWeight: '600' },
  tabTextActive: { color: '#FFFFFF' },
  label: { color: '#94A3B8', fontSize: 12, marginTop: 14, marginBottom: 6, textTransform: 'uppercase' },
  input: {
    backgroundColor: '#1E293B',
    color: '#FFFFFF',
    fontSize: 16,
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  submit: {
    backgroundColor: '#10B981',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 24,
  },
  submitDisabled: { opacity: 0.6 },
  submitText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', letterSpacing: 0.5 },
  error: {
    color: '#EF4444',
    fontSize: 13,
    marginTop: 14,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderRadius: 8,
    padding: 12,
  },
  hint: {
    color: '#475569',
    fontSize: 11,
    marginTop: 32,
    fontFamily: 'Courier',
    textAlign: 'center',
  },
});
