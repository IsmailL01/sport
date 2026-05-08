// Push tokens + foreground notification handling.
// Phase 8 / A5.

import { create } from 'zustand';

import { apiClient } from '../../auth/apiClient';
import { getNotificationsAdapter } from '../../notifications';
import type { PushToken } from '../../notifications/NotificationsAdapter';

type NotificationsStore = {
  pushToken: PushToken | null;
  permissionGranted: boolean | null; // null = not asked yet
  registering: boolean;

  /** Запросить permission, получить token, register на сервере. */
  requestAndRegister: () => Promise<void>;
};

export const useNotificationsStore = create<NotificationsStore>((set, get) => ({
  pushToken: null,
  permissionGranted: null,
  registering: false,

  requestAndRegister: async () => {
    if (get().registering) return;
    set({ registering: true });
    try {
      const adapter = getNotificationsAdapter();
      const granted = await adapter.requestPermission();
      set({ permissionGranted: granted });
      if (!granted) return;
      const tok = await adapter.getToken();
      if (tok === null) return;
      set({ pushToken: tok });

      // Register на бэкенде.
      if (apiClient.isAuthenticated()) {
        try {
          await apiClient.api('/devices', {
            method: 'POST',
            body: JSON.stringify({
              expoToken: tok.token,
              platform: tok.platform,
            }),
          });
        } catch (e) {
          console.warn('[notif] register device failed', e);
        }
      }
    } finally {
      set({ registering: false });
    }
  },
}));
