// Singleton NotificationsAdapter.
// Phase 8 / A5.

import type { NotificationsAdapter } from './NotificationsAdapter';
import { ExpoNotificationsAdapter } from './adapters/ExpoNotificationsAdapter';

let active: NotificationsAdapter = new ExpoNotificationsAdapter();

export function getNotificationsAdapter(): NotificationsAdapter {
  return active;
}

export function setNotificationsAdapter(adapter: NotificationsAdapter): void {
  active = adapter;
}

export type { NotificationsAdapter, PushToken, Platform } from './NotificationsAdapter';
export { ExpoNotificationsAdapter } from './adapters/ExpoNotificationsAdapter';
