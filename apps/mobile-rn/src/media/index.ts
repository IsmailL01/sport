// Singleton MediaAdapter (swap-able pattern, как у sensor/realtime/notifications).
// Phase 8 / B3.

import type { MediaAdapter } from './MediaAdapter';
import { ExpoMediaAdapter } from './adapters/ExpoMediaAdapter';

let active: MediaAdapter = new ExpoMediaAdapter();

export function getMediaAdapter(): MediaAdapter {
  return active;
}

export function setMediaAdapter(adapter: MediaAdapter): void {
  active = adapter;
}

export type { MediaAdapter, PickedMedia, MediaScope } from './MediaAdapter';
export { ExpoMediaAdapter } from './adapters/ExpoMediaAdapter';
