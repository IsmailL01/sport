# ADR-0003: OAuth Google / Apple

**Дата:** 2026-05-06
**Статус:** Accepted (scaffold only; full integration TBD)
**Контекст:** Round 3 P2 / спека §1

## Контекст

Спека требует «OAuth Google/Apple» рядом с email-passwordless. В Round 1 audit пометили P2: не блокер, требует client_id/secret и backend exchange.

## Решение

### Архитектура

Единый интерфейс `AuthProvider` в [src/auth/authProviders.ts](../../apps/mobile-rn/src/auth/authProviders.ts) — три реализации:

| Provider | Native dep | Backend | Когда |
|---|---|---|---|
| `email-otp` | нет | `/auth/otp/*` (есть) | сейчас |
| `google` | `expo-auth-session` + `expo-web-browser` | `/auth/oauth/google/exchange` | Round 4+ |
| `apple` | `expo-apple-authentication` | `/auth/oauth/apple/exchange` | Round 4+ (iOS only) |

### Контракт `AuthProvider`

```ts
interface AuthProvider {
  id: 'email-otp' | 'google' | 'apple';
  label: string;             // UI текст («Войти через Google»)
  isAvailable(): boolean;    // platform / native module check
  signIn(): Promise<AuthCredentials | null>;  // null = user cancelled
}

type AuthCredentials =
  | { kind: 'otp'; email: string; code: string }
  | { kind: 'oauth'; provider: 'google' | 'apple'; idToken: string; ... };
```

`useAuthStore.completeWithProvider(provider, credentials)` — single entry-point. Существующий OTP-flow становится частным случаем.

### Backend контракт (для будущей реализации)

```
POST /auth/oauth/exchange
{
  "provider": "google" | "apple",
  "idToken": "<provider id_token>",
  "deviceID": "<uuid>"
}

200:
{
  "accessToken": "...",
  "refreshToken": "...",
  "user": { ... },
  "isNew": true|false
}
```

Сервер верифицирует `idToken` через провайдерский JWKS endpoint, mapит к `users.email`, делает upsert.

### Что делаем в Round 3

1. `AuthProvider` interface ([src/auth/authProviders.ts](../../apps/mobile-rn/src/auth/authProviders.ts)).
2. `googleAuthProvider`, `appleAuthProvider` — **stub-safe**: лениво try `require('expo-auth-session')` / `require('expo-apple-authentication')`, при отсутствии `isAvailable()` возвращает false. `signIn()` бросает explicit error «not implemented». UI должен это уважать.
3. Кнопки «Войти через Google» / «Войти через Apple» в AuthStack — отображаются только если `isAvailable() === true`. Сейчас всегда false → невидимы.

### Что НЕ делаем

- Не добавляем зависимости `expo-auth-session` / `expo-apple-authentication` в `package.json` сейчас. Когда придёт время — конфиг-плагины и `eas build`.
- Не пишем backend endpoint. Stub возвращает не-реализовано.
- Не покрываем тестами — нечего тестировать пока всё stub.

## Альтернативы

- **Firebase Auth**: vendor lock-in, добавляет Google Cloud зависимость. Отвергнуто.
- **Auth0 / Clerk**: managed service, $$. Отвергнуто (открытый бэкенд приоритетнее).
- **Sign in with Apple ТОЛЬКО**: Apple App Store требует Sign in with Apple ОТ ВСЕХ приложений с социальным/email login. Это значит к моменту релиза в App Store нам нужна Apple. Google — опционально.

## Последствия

- Apple Sign-in становится **обязательной** перед App Store release.
- Google — desirable for Android-парность, но не блокер.
- В Round 4 (бэкенд + native) подключим оба — план готов.
- ADR не «sealing» решение: если выберем другой provider (Yandex ID? VK ID? — российский рынок), можно расширить interface.
