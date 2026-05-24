// Phase 8 Plan 08-01 Task 5 — AppState 'active' listener that triggers
// checkForUpdate(). Mounted in App.tsx alongside subscribeToRecordingTick()
// from Plan 07-03 Task 2 (commit 9131904).
//
// Behavior:
//   - Fire once on mount (covers first-launch case before any AppState change)
//   - Subscribe to AppState; on 'active' transitions, fire checkForUpdate()
//   - 6h throttle lives inside checkForUpdate; this hook just kicks the request

import { useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { checkForUpdate } from './manifestCheck';

export function useUpdateCheckOnForeground(): void {
  useEffect(() => {
    const onChange = (next: AppStateStatus): void => {
      if (next === 'active') {
        void checkForUpdate();
      }
    };
    const sub = AppState.addEventListener('change', onChange);
    // Initial fire (mount may happen while app is already 'active').
    void checkForUpdate();
    return () => {
      sub.remove();
    };
  }, []);
}
