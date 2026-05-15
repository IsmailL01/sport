// useClosureFeedback: haptic + toast побочный эффект при первом закрытии зоны в сессии.
// Phase 1 / PHASE1-08. См. CONTEXT.md D-16..D-19, ТЗ §3, DEVELOPMENT_PLAN.md §3 P1-G-09.
// Side-effect hook — никакого возврата. Слушает closureFired event из useActivityStore.
//
// Pitfall 2 (RESEARCH.md): Haptics.notificationAsync rejects на iOS Simulator и
// на Android 13+ без USE_VIBRATOR permission — обязательный .catch(() => {})
// гарантирует, что yellow box не сломает UX.

import { useEffect } from 'react';
import * as Haptics from 'expo-haptics';

import { useActivityStore } from '../../../../state/activity';
import { useToast } from '../../../../ui/Toast';
import { formatArea } from '../../../../ui/format';

export function useClosureFeedback(): void {
  const closureFired = useActivityStore((s) => s.closureFired);
  const areaM2 = useActivityStore((s) => s.areaM2);
  const { show } = useToast();

  useEffect(() => {
    if (!closureFired || areaM2 === null) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {
      // iOS sim / Android без permission — silent (RESEARCH.md Pitfall 2 / 5).
    });
    show(`Зона замкнута! Площадь: ${formatArea(areaM2)}`);
  }, [closureFired, areaM2, show]);
}
