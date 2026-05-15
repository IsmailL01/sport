// usePauseUI: индикатор паузы + binding кнопки Пауза/Продолжить на TrackerLiveScreen.
// Phase 1 / PHASE1-06. См. ТЗ §4 (auto-pause), DEVELOPMENT_PLAN.md §3 P1-B.
// Pure presentation — читает useActivityStore selectors + setPaused action.
//
// Поведение (зеркалит inline-логику TrackerLiveScreen pre-refactor):
//   - isPaused: зеркало store.isPaused (auto-pause из PauseDetector ИЛИ ручная пауза).
//   - isAutoPaused: алиас для isPaused — пока в коде нет различения, но API готов для Plan 03+,
//     когда добавится отдельный флаг manualPaused.
//   - pauseLabel: 'ПАУЗА' / 'ПРОДОЛЖИТЬ' — точное соответствие existing TrackerLiveScreen.tsx labels.
//   - toggle: инвертирует isPaused через store.setPaused — заменяет inline `handlePause`.

import { useCallback } from 'react';

import { useActivityStore } from '../../../../state/activity';

export type PauseUI = {
  isPaused: boolean;
  isAutoPaused: boolean;
  pauseLabel: string;
  toggle: () => void;
};

export function usePauseUI(): PauseUI {
  const isPaused = useActivityStore((s) => s.isPaused);
  const setPaused = useActivityStore((s) => s.setPaused);

  const toggle = useCallback(() => {
    setPaused(!isPaused);
  }, [isPaused, setPaused]);

  return {
    isPaused,
    isAutoPaused: isPaused,
    pauseLabel: isPaused ? 'ПРОДОЛЖИТЬ' : 'ПАУЗА',
    toggle,
  };
}
