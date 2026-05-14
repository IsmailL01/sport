// OAuth провайдеры — Round 3 P2 scaffold.
//
// Контракт: каждый провайдер описывает один способ аутентификации.
// Сейчас `email-otp` уже работает напрямую через useAuthStore.requestCode /
// loginWithCode. Google и Apple — stub-safe заглушки до Round 4+.
//
// См. docs/DECISIONS/0003-oauth-providers.md.

import { Platform } from 'react-native';

export type AuthProviderId = 'email-otp' | 'google' | 'apple';

export type AuthCredentials =
  | { kind: 'otp'; email: string; code: string }
  | {
      kind: 'oauth';
      provider: 'google' | 'apple';
      idToken: string;
      authorizationCode?: string;
      displayName?: string | null;
      email?: string | null;
    };

export interface AuthProvider {
  id: AuthProviderId;
  label: string;
  /** true если provider можно вызвать на этой платформе/в этой сборке. */
  isAvailable(): boolean;
  /**
   * Поднимает provider-specific UI (web browser / native sheet) и возвращает
   * креды. null = пользователь отменил. throw = ошибка.
   */
  signIn(): Promise<AuthCredentials | null>;
}

// ─────────────────────────────────────────────────────────────
// Google — stub
// ─────────────────────────────────────────────────────────────

type ExpoAuthSession = {
  // smoke check: пакет действительно загрузился
  AuthRequest: unknown;
};

function loadExpoAuthSession(): ExpoAuthSession | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('expo-auth-session') as ExpoAuthSession;
    if (mod !== null && typeof mod === 'object' && 'AuthRequest' in mod) {
      return mod;
    }
  } catch {
    // not installed — stub mode
  }
  return null;
}

export class GoogleAuthProvider implements AuthProvider {
  id: AuthProviderId = 'google';
  label = 'Войти через Google';

  isAvailable(): boolean {
    if (process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID === undefined) return false;
    return loadExpoAuthSession() !== null;
  }

  async signIn(): Promise<AuthCredentials | null> {
    if (!this.isAvailable()) {
      throw new Error('Google sign-in недоступен. См. ADR-0003.');
    }
    // TODO Round 4:
    //   const request = new AuthRequest({ clientId, scopes: ['openid', 'profile', 'email'], ... });
    //   const result = await request.promptAsync(discovery);
    //   if (result.type !== 'success') return null;
    //   return { kind: 'oauth', provider: 'google', idToken: result.params.id_token };
    throw new Error('Google sign-in реализация — Round 4+.');
  }
}

// ─────────────────────────────────────────────────────────────
// Apple — stub (iOS only)
// ─────────────────────────────────────────────────────────────

type ExpoAppleAuth = {
  isAvailableAsync: () => Promise<boolean>;
  signInAsync: (opts: unknown) => Promise<{
    identityToken: string | null;
    authorizationCode: string | null;
    fullName?: { givenName: string | null; familyName: string | null } | null;
    email: string | null;
  }>;
};

function loadExpoAppleAuth(): ExpoAppleAuth | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('expo-apple-authentication') as ExpoAppleAuth;
    if (typeof mod.isAvailableAsync === 'function' && typeof mod.signInAsync === 'function') {
      return mod;
    }
  } catch {
    // not installed — stub mode
  }
  return null;
}

export class AppleAuthProvider implements AuthProvider {
  id: AuthProviderId = 'apple';
  label = 'Войти через Apple';

  isAvailable(): boolean {
    if (Platform.OS !== 'ios') return false;
    return loadExpoAppleAuth() !== null;
  }

  async signIn(): Promise<AuthCredentials | null> {
    const mod = loadExpoAppleAuth();
    if (mod === null) {
      throw new Error('Apple sign-in недоступен. См. ADR-0003.');
    }
    try {
      const result = await mod.signInAsync({});
      if (result.identityToken === null) return null;
      const displayName = result.fullName
        ? [result.fullName.givenName, result.fullName.familyName]
            .filter((x): x is string => typeof x === 'string' && x.length > 0)
            .join(' ')
            .trim() || null
        : null;
      return {
        kind: 'oauth',
        provider: 'apple',
        idToken: result.identityToken,
        authorizationCode: result.authorizationCode ?? undefined,
        displayName,
        email: result.email,
      };
    } catch (e) {
      // Если пользователь cancel'нул — возвращаем null. Иначе throw.
      const msg = (e as { message?: string }).message ?? String(e);
      if (/canceled|cancelled/i.test(msg)) return null;
      throw e;
    }
  }
}

// ─────────────────────────────────────────────────────────────
// Registry
// ─────────────────────────────────────────────────────────────

let _providers: AuthProvider[] | null = null;

export function getAuthProviders(): AuthProvider[] {
  if (_providers === null) {
    _providers = [new GoogleAuthProvider(), new AppleAuthProvider()];
  }
  return _providers;
}

export function availableProviders(): AuthProvider[] {
  return getAuthProviders().filter((p) => p.isAvailable());
}
