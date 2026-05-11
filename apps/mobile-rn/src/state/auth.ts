import { create } from 'zustand';

import { apiClient } from '../auth/apiClient';

export type AuthUser = {
  id: string;
  email: string;
  displayName: string;
  locale: string;
  timezone: string;
};

export type AuthState =
  | 'idle'
  | 'hydrating'
  | 'authenticating'
  | 'authenticated'
  | 'unauthenticated';

type AuthStore = {
  state: AuthState;
  user: AuthUser | null;
  error: string | null;
  /**
   * Phase M9.5: user впервые создан (isNew=true в response /auth/login-with-code).
   * Mobile показывает onboarding-wizard (Name → Birthday → Permissions)
   * прежде чем разрешить AppTabs. Сбрасывается в finishOnboarding().
   */
  needsOnboarding: boolean;

  /** На старте app — загрузить tokens, проверить через /me. */
  hydrate: () => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Очистить error (после показа в UI). */
  clearError: () => void;
  /** Завершить onboarding → пускает на AppTabs. */
  finishOnboarding: () => void;
  /** Обновить displayName локально (после успешного PATCH /profiles/me). */
  setDisplayName: (name: string) => void;

  // Phase M4: passwordless OTP.
  /** Запросить 6-digit код. На dev-сервере возвращает code (для UI debug). */
  requestCode: (email: string) => Promise<{ devCode?: string } | null>;
  /** Залогиниться по email + code. На success → state='authenticated'. */
  loginWithCode: (email: string, code: string) => Promise<boolean>;
};

export const useAuthStore = create<AuthStore>((set) => ({
  state: 'idle',
  user: null,
  error: null,
  needsOnboarding: false,

  hydrate: async () => {
    set({ state: 'hydrating', error: null });
    try {
      const hadTokens = await apiClient.loadFromStorage();
      if (!hadTokens) {
        set({ state: 'unauthenticated', user: null });
        return;
      }
      const resp = await apiClient.identity('/me');
      if (!resp.ok) {
        // Refresh не сработал → токенов больше нет. Чистим state.
        set({ state: 'unauthenticated', user: null });
        return;
      }
      const user = (await resp.json()) as AuthUser;
      set({ state: 'authenticated', user });
    } catch (e) {
      console.warn('[auth] hydrate failed', e);
      set({ state: 'unauthenticated', user: null });
    }
  },

  register: async (email, password, displayName) => {
    set({ state: 'authenticating', error: null });
    try {
      const resp = await apiClient.identity('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, password, displayName }),
      });
      const body = (await resp.json()) as {
        accessToken?: string;
        refreshToken?: string;
        user?: AuthUser;
        error?: string;
        message?: string;
      };
      if (!resp.ok || !body.accessToken || !body.refreshToken || !body.user) {
        set({
          state: 'unauthenticated',
          error: body.message ?? 'Не удалось зарегистрироваться',
        });
        return;
      }
      await apiClient.setTokens(body.accessToken, body.refreshToken);
      set({ state: 'authenticated', user: body.user, error: null });
    } catch (e) {
      set({
        state: 'unauthenticated',
        error:
          'Не удалось связаться с сервером. Проверьте подключение и базовый URL API.',
      });
      console.warn('[auth] register failed', e);
    }
  },

  requestCode: async (email) => {
    set({ state: 'authenticating', error: null });
    try {
      const resp = await apiClient.identity('/auth/request-code', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      if (!resp.ok) {
        const body = await resp.text().catch(() => '');
        set({
          state: 'unauthenticated',
          error: 'Не удалось отправить код. Проверь email.',
        });
        console.warn('[auth] request-code failed', resp.status, body);
        return null;
      }
      const data = (await resp.json()) as { devCode?: string };
      // На request-code не меняем state на authenticated — это только запрос кода.
      // Возвращаемся в unauthenticated; UI переходит на Code screen.
      set({ state: 'unauthenticated', error: null });
      return { devCode: data.devCode };
    } catch (e) {
      set({
        state: 'unauthenticated',
        error:
          'Не удалось связаться с сервером. Проверь подключение и базовый URL API.',
      });
      console.warn('[auth] requestCode failed', e);
      return null;
    }
  },

  loginWithCode: async (email, code) => {
    set({ state: 'authenticating', error: null });
    try {
      const resp = await apiClient.identity('/auth/login-with-code', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim().toLowerCase(), code: code.trim() }),
      });
      const body = (await resp.json()) as {
        accessToken?: string;
        refreshToken?: string;
        user?: AuthUser;
        isNew?: boolean;
        error?: string;
        message?: string;
      };
      if (!resp.ok || !body.accessToken || !body.refreshToken || !body.user) {
        set({
          state: 'unauthenticated',
          error: body.message ?? 'Неверный код',
        });
        return false;
      }
      await apiClient.setTokens(body.accessToken, body.refreshToken);
      set({
        state: 'authenticated',
        user: body.user,
        error: null,
        needsOnboarding: body.isNew === true,
      });
      return true;
    } catch (e) {
      set({
        state: 'unauthenticated',
        error:
          'Не удалось связаться с сервером. Проверь подключение и базовый URL API.',
      });
      console.warn('[auth] loginWithCode failed', e);
      return false;
    }
  },

  login: async (email, password) => {
    set({ state: 'authenticating', error: null });
    try {
      const resp = await apiClient.identity('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      const body = (await resp.json()) as {
        accessToken?: string;
        refreshToken?: string;
        user?: AuthUser;
        error?: string;
        message?: string;
      };
      if (!resp.ok || !body.accessToken || !body.refreshToken || !body.user) {
        set({
          state: 'unauthenticated',
          error: body.message ?? 'Неверный email или пароль',
        });
        return;
      }
      await apiClient.setTokens(body.accessToken, body.refreshToken);
      set({ state: 'authenticated', user: body.user, error: null });
    } catch (e) {
      set({
        state: 'unauthenticated',
        error:
          'Не удалось связаться с сервером. Проверьте подключение и базовый URL API.',
      });
      console.warn('[auth] login failed', e);
    }
  },

  logout: async () => {
    await apiClient.clearTokens();
    // Wipe modular stores on logout (Phase 8 / C+D — модульный паттерн).
    try {
      const { useStoriesStore } = await import('../modules/stories');
      useStoriesStore.getState().clearAll();
    } catch (e) {
      console.warn('[auth] stories clearAll failed', e);
    }
    try {
      const { useFeedStore } = await import('../modules/feed');
      useFeedStore.getState().clearAll();
    } catch (e) {
      console.warn('[auth] feed clearAll failed', e);
    }
    try {
      const { useModerationStore } = await import('../modules/moderation');
      useModerationStore.getState().clearAll();
    } catch (e) {
      console.warn('[auth] moderation clearAll failed', e);
    }
    try {
      const { useXpStore } = await import('../modules/gamification');
      useXpStore.getState().clearAll();
    } catch (e) {
      console.warn('[auth] xp clearAll failed', e);
    }
    // M9.8: drop social_relations cache (другой viewer на устройстве после logout).
    try {
      const { clearAllRelations } = await import('../storage/relationsRepository');
      clearAllRelations();
    } catch (e) {
      console.warn('[auth] relations clearAll failed', e);
    }
    set({ state: 'unauthenticated', user: null, error: null, needsOnboarding: false });
  },

  clearError: () => set({ error: null }),
  finishOnboarding: () => set({ needsOnboarding: false }),
  setDisplayName: (name) =>
    set((s) => (s.user === null ? s : { user: { ...s.user, displayName: name } })),
}));
