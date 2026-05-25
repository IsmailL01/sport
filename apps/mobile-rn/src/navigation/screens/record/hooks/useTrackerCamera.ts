// useTrackerCamera: Mapbox camera follow + heading + bounds-fit hook for TrackerLiveScreen.
// Phase 1 / PHASE1-06. См. ТЗ §10 (карта), DEVELOPMENT_PLAN.md §3 P1-B.
// Pure presentation — читает useActivityStore селекторы, возвращает структуру 1:1 под MapboxView props.
//
// Поведение:
//   - Пока recording идёт и зона ещё НЕ замкнута → camera следует за пользователем (followUserLocation=true).
//   - После closureFired=true → освобождаем камеру (followUserLocation=false), чтобы вызвать fitToBounds.
//   - При isPaused=true (auto OR manual) → освобождаем камеру (2026-05-25): не следим за
//     GPS drift пока пользователь стоит; камера замирает там, где остановили.
//   - fitToBounds — стабильная по ссылке функция (useCallback). Возвращает computed bbox + padding.
//
// Layering: hook живёт в navigation/screens/record/hooks/ и НЕ импортирует @rnmapbox/maps —
// camera-инструкции возвращаются как plain объект, экран сам передаёт их в MapboxView.

import { useCallback } from 'react';

import { useActivityStore } from '../../../../state/activity';

export type CameraProps = {
  followUserLocation: boolean;
  followZoomLevel: number;
};

export type Bounds = [[number, number], [number, number]];

export type FitToBoundsResult = {
  ne: [number, number];
  sw: [number, number];
  paddingPx: number;
};

export function useTrackerCamera(): {
  cameraProps: CameraProps;
  fitToBounds: (bounds: Bounds, padding?: number) => FitToBoundsResult;
} {
  const state = useActivityStore((s) => s.state);
  const pointsLength = useActivityStore((s) => s.points.length);
  const closureFired = useActivityStore((s) => s.closureFired);
  const isPaused = useActivityStore((s) => s.isPaused);

  // Камера следует за пользователем во время записи; после закрытия зоны — отпускаем
  // (Plan 03+ может вызвать fitToBounds для показа полного контура). 2026-05-25:
  // при isPaused тоже отпускаем — нет смысла следить за GPS-drift пока бегун
  // стоит, плюс на iOS continuous camera tracking жрёт батарею.
  const isFollowing =
    state === 'recording' && pointsLength > 0 && !closureFired && !isPaused;

  const cameraProps: CameraProps = {
    followUserLocation: isFollowing,
    followZoomLevel: 16,
  };

  // Стабильная ссылка: bbox-вычисление не зависит от пер-точечных ререндеров.
  // Вычисляем bbox по переданным углам — экран сам прокидывает результат в MapboxView (или
  // в future Camera ref). Пока MapboxView не пропускает Camera ref наружу, fitToBounds
  // используется как pure-вычислитель.
  const fitToBounds = useCallback(
    (bounds: Bounds, padding: number = 80): FitToBoundsResult => {
      const [[swLng, swLat], [neLng, neLat]] = bounds;
      return {
        ne: [neLng, neLat],
        sw: [swLng, swLat],
        paddingPx: padding,
      };
    },
    [],
  );

  return { cameraProps, fitToBounds };
}
