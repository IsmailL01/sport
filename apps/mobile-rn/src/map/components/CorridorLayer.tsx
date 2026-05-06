// Заливка-коридор вокруг полилинии для незамкнутых треков (ТЗ §6.6 Подход B / P1-H).
// Используется когда трек ещё не замкнулся — даёт визуальное представление "зоны влияния".

import { useMemo } from 'react';
import { FillLayer, ShapeSource } from '@rnmapbox/maps';

import type { RawPoint } from '../../domain/types';
import { bufferTrack } from '../../util/corridor';

export type CorridorLayerProps = {
  points: readonly RawPoint[];
  /** Полуширина коридора в метрах (трек шириной 2 × widthM). */
  widthM?: number;
  /** Цвет (по умолчанию более прозрачный чем у zone). */
  color?: string;
  fillOpacity?: number;
  id?: string;
};

const EMPTY_COLLECTION = { type: 'FeatureCollection' as const, features: [] };

export function CorridorLayer({
  points,
  widthM = 2.5,
  color = '#10B981',
  fillOpacity = 0.18,
  id = 'corridor',
}: CorridorLayerProps) {
  const shape = useMemo(() => {
    const buffered = bufferTrack([...points], widthM);
    return buffered ?? EMPTY_COLLECTION;
  }, [points, widthM]);

  return (
    <ShapeSource id={`${id}-source`} shape={shape}>
      <FillLayer
        id={`${id}-fill`}
        style={{ fillColor: color, fillOpacity }}
      />
    </ShapeSource>
  );
}
