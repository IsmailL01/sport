// useLayerVisibility: флаги видимости слоёв карты (track / corridor / zone / dim) на TrackerLiveScreen.
// Phase 1 / PHASE1-06. См. ТЗ §10 (карта), CONCERNS.md "map dim on pause".
// Pure presentation — читает useActivityStore селекторы, возвращает derived booleans.
//
// Поведение (зеркалит inline-логику TrackerLiveScreen pre-refactor):
//   - showTrack: показываем TrackLayer, когда есть >=2 точки (иначе линия рисовать нечего).
//   - showCorridor: показываем CorridorLayer пока зона НЕ замкнута (после closure — скрываем).
//   - showZone: показываем ZoneLayer после closureFired.
//   - dimOverlay: затемняем карту overlay'ем во время паузы.

import { useMemo } from 'react';

import { useActivityStore } from '../../../../state/activity';

export type LayerFlags = {
  showTrack: boolean;
  showCorridor: boolean;
  showZone: boolean;
  dimOverlay: boolean;
};

export function useLayerVisibility(): LayerFlags {
  const pointsLength = useActivityStore((s) => s.points.length);
  const isPaused = useActivityStore((s) => s.isPaused);
  const closureFired = useActivityStore((s) => s.closureFired);
  const state = useActivityStore((s) => s.state);

  return useMemo<LayerFlags>(
    () => ({
      showTrack: pointsLength >= 2,
      showCorridor: state === 'recording' && !closureFired,
      showZone: closureFired,
      dimOverlay: isPaused,
    }),
    [pointsLength, isPaused, closureFired, state],
  );
}
