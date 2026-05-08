// expo-notifications обёртка.
// Phase 8 / A5.
//
// На реальной prod-сборке нужны:
//   - app.json: expo.android.googleServicesFile = "./google-services.json"
//     + expo.notifications в plugins
//   - EAS Build с FCM credentials
// На dev (Expo Go) — local notifications работают, push-токены — limited.

import * as Notifications from 'expo-notifications';
import { Platform as RNPlatform } from 'react-native';
import type {
  NotificationsAdapter, PushToken, Platform, ForegroundNotification,
} from '../NotificationsAdapter';

// Foreground behavior: показываем alert + звук + badge.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export class ExpoNotificationsAdapter implements NotificationsAdapter {
  async requestPermission(): Promise<boolean> {
    const settings = await Notifications.getPermissionsAsync();
    if (settings.granted) return true;
    if (!settings.canAskAgain) return false;
    const r = await Notifications.requestPermissionsAsync();
    return r.granted;
  }

  async getToken(): Promise<PushToken | null> {
    try {
      const platform: Platform = RNPlatform.OS === 'android' ? 'android'
        : RNPlatform.OS === 'ios' ? 'ios' : 'web';
      // projectId автоматически берётся из app.json.expo.extra.eas.projectId
      // или EXPO_PUBLIC_EXPO_PROJECT_ID env.
      const projectId = process.env.EXPO_PUBLIC_EXPO_PROJECT_ID;
      const tokenResult = projectId
        ? await Notifications.getExpoPushTokenAsync({ projectId })
        : await Notifications.getExpoPushTokenAsync();
      return { token: tokenResult.data, platform };
    } catch (e) {
      console.warn('[ExpoNotifications] getToken failed', e);
      return null;
    }
  }

  async setBadgeCount(n: number): Promise<void> {
    try { await Notifications.setBadgeCountAsync(n); } catch { /* ignore */ }
  }

  onForegroundNotification(h: (n: ForegroundNotification) => void): () => void {
    const sub = Notifications.addNotificationReceivedListener((notification) => {
      h({
        title: notification.request.content.title ?? '',
        body: notification.request.content.body ?? '',
        data: (notification.request.content.data ?? {}) as Record<string, unknown>,
      });
    });
    return () => sub.remove();
  }

  onResponse(h: (data: Record<string, unknown>) => void): () => void {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      h((response.notification.request.content.data ?? {}) as Record<string, unknown>);
    });
    return () => sub.remove();
  }
}
