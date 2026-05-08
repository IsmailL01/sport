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

  /** На старте app — загрузить tokens, проверить через /me. */
  hydrate: () => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Очистить error (после показа в UI). */
  clearError: () => void;
};

export const useAuthStore = create<AuthStore>((set) => ({
  state: 'idle',
  user: null,
  error: null,

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
    set({ state: 'unauthenticated', user: null, error: null });
  },

  clearError: () => set({ error: null }),
}));
