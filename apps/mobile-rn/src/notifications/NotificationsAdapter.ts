// NotificationsAdapter — interface для push-токенов и foreground handling.
// Phase 8 / A5.

export type Platform = 'ios' | 'android' | 'web';

export type PushToken = {
  token: string;       // ExponentPushToken[xxx]
  platform: Platform;
};

export type ForegroundNotification = {
  title: string;
  body: string;
  data: Record<string, unknown>;
};

export interface NotificationsAdapter {
  /** Запросить permission. true = granted. */
  requestPermission(): Promise<boolean>;

  /** Получить Expo push token (требует permission + projectId настроен). */
  getToken(): Promise<PushToken | null>;

  /** Установить badge count на иконке (iOS — поддерживается, Android — частично). */
  setBadgeCount(n: number): Promise<void>;

  /** Foreground notifications (когда app открыто). */
  onForegroundNotification(h: (n: ForegroundNotification) => void): () => void;

  /** User tapped notification → открыть нужный экран. */
  onResponse(h: (data: Record<string, unknown>) => void): () => void;
}
