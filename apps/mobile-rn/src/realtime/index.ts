// Singleton RealtimeAdapter (swap-able).
// Phase 8 / A5.

import { apiClient } from '../auth/apiClient';
import type { RealtimeAdapter } from './RealtimeAdapter';
import { WebSocketRealtimeAdapter } from './adapters/WebSocketRealtimeAdapter';

let active: RealtimeAdapter = new WebSocketRealtimeAdapter((token, deviceID) => {
  // Reuse apiClient.wsURL
  const url = apiClient.wsURL(deviceID);
  if (url !== null) return url;
  // Fallback (если accessToken ещё не загрузился).
  return `${process.env.EXPO_PUBLIC_API_URL ?? 'wss://148-253-214-156.sslip.io'}/ws?token=${encodeURIComponent(token)}&device_id=${encodeURIComponent(deviceID)}`;
});

export function getRealtimeAdapter(): RealtimeAdapter {
  return active;
}

export function setRealtimeAdapter(adapter: RealtimeAdapter): void {
  active = adapter;
}

export type { RealtimeAdapter, RealtimeEvent, RealtimeStatus } from './RealtimeAdapter';
export { WebSocketRealtimeAdapter } from './adapters/WebSocketRealtimeAdapter';
export { MockRealtimeAdapter } from './adapters/MockRealtimeAdapter';
