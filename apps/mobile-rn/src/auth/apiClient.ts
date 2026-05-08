// HTTP-клиент с автоматическим refresh access-токена при 401.
// Не использует axios — fetch достаточен.

import { clearTokens, loadTokens, saveTokens } from './tokenStorage';

const IDENTITY_BASE =
  process.env.EXPO_PUBLIC_IDENTITY_URL ?? 'http://10.0.2.2:8081';
const SYNC_BASE =
  process.env.EXPO_PUBLIC_SYNC_URL ?? 'http://10.0.2.2:8082';
// social/messaging/notifications/realtime все живут на том же хосте через
// Caddy path-routing — переиспользуем IDENTITY_BASE как общий API host.
// На прототипе все на 148-253-214-156.sslip.io; в проде можно разносить.
const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? IDENTITY_BASE;

// 10.0.2.2 — это localhost host-машины из Android emulator. На реальном
// устройстве нужно использовать LAN IP (EXPO_PUBLIC_IDENTITY_URL=http://192.168.x.x:8081).

export type ApiError = {
  status: number;
  code: string;
  message: string;
};

export class ApiClient {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private refreshing: Promise<boolean> | null = null;

  /** Загрузить токены из secure-store при старте app. */
  async loadFromStorage(): Promise<boolean> {
    const tokens = await loadTokens();
    if (!tokens) return false;
    this.accessToken = tokens.accessToken;
    this.refreshToken = tokens.refreshToken;
    return true;
  }

  async setTokens(accessToken: string, refreshToken: string): Promise<void> {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
    await saveTokens({ accessToken, refreshToken });
  }

  async clearTokens(): Promise<void> {
    this.accessToken = null;
    this.refreshToken = null;
    await clearTokens();
  }

  isAuthenticated(): boolean {
    return this.accessToken !== null;
  }

  /** Public accessor для realtime WebSocket подключения. */
  getAccessToken(): string | null {
    return this.accessToken;
  }

  /** Запрос на identity-сервис. */
  identity(path: string, init: RequestInit = {}): Promise<Response> {
    return this.fetch(IDENTITY_BASE, path, init);
  }

  /** Запрос на activity-sync сервис. */
  sync(path: string, init: RequestInit = {}): Promise<Response> {
    return this.fetch(SYNC_BASE, path, init);
  }

  /** Запрос на любой backend (Caddy роутит по path).
   *  Используется для social-graph, messaging, notifications. */
  api(path: string, init: RequestInit = {}): Promise<Response> {
    return this.fetch(API_BASE, path, init);
  }

  /** Build WebSocket URL для realtime-gw с access-token и device_id в query.
   *  Возвращает wss://host/ws?token=...&device_id=...  */
  wsURL(deviceID: string): string | null {
    if (!this.accessToken) return null;
    const httpURL = API_BASE;
    const wsBase = httpURL.replace(/^http/, 'ws');
    const u = new URL(wsBase + '/ws');
    u.searchParams.set('token', this.accessToken);
    u.searchParams.set('device_id', deviceID);
    return u.toString();
  }

  private async fetch(base: string, path: string, init: RequestInit): Promise<Response> {
    let resp = await this.doFetch(base, path, init);
    if (resp.status === 401 && this.refreshToken) {
      const refreshed = await this.tryRefresh();
      if (refreshed) {
        resp = await this.doFetch(base, path, init);
      }
    }
    return resp;
  }

  private async doFetch(base: string, path: string, init: RequestInit): Promise<Response> {
    const headers = new Headers(init.headers);
    if (this.accessToken) {
      headers.set('Authorization', `Bearer ${this.accessToken}`);
    }
    if (init.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    return fetch(`${base}${path}`, { ...init, headers });
  }

  private async tryRefresh(): Promise<boolean> {
    if (this.refreshing) return this.refreshing;
    this.refreshing = (async () => {
      const refreshToken = this.refreshToken;
      if (!refreshToken) return false;
      try {
        const resp = await fetch(`${IDENTITY_BASE}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });
        if (!resp.ok) {
          // Refresh-токен недействителен — пользователь должен залогиниться заново.
          await this.clearTokens();
          return false;
        }
        const body = (await resp.json()) as {
          accessToken: string;
          refreshToken: string;
        };
        await this.setTokens(body.accessToken, body.refreshToken);
        return true;
      } catch (e) {
        console.warn('[apiClient] refresh failed', e);
        return false;
      } finally {
        this.refreshing = null;
      }
    })();
    return this.refreshing;
  }

  // Конфигурация для UI / диагностики.
  getBaseUrls() {
    return { identity: IDENTITY_BASE, sync: SYNC_BASE };
  }
}

export const apiClient = new ApiClient();
