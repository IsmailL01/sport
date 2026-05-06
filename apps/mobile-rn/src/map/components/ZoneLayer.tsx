// Заливка замкнутого полигона трека (захваченная зона).
// Скрывает FillLayer + outline LineLayer за единым API.

import { useMemo } from 'react';
import { FillLayer, LineLayer, ShapeSource } from '@rnmapbox/maps';

import type { RawPoint } from '../../domain/types';
import { pointsToPolygon } from '../../util/geojson';

export type ZoneLayerProps = {
  points: readonly RawPoint[];
  color?: string;
  /** Прозрачность заливки. По умолчанию 0.3. */
  fillOpacity?: number;
  id?: string;
};

export function ZoneLayer({
  points,
  color = '#10B981',
  fillOpacity = 0.3,
  id = 'zone',
}: ZoneLayerProps) {
  const shape = useMemo(() => pointsToPolygon([...points]), [points]);
  return (
    <ShapeSource id={`${id}-source`} shape={shape}>
      <FillLayer
        id={`${id}-fill`}
        style={{ fillColor: color, fillOpacity }}
      />
      <LineLayer
        id={`${id}-outline`}
        style={{
          lineColor: color,
          lineWidth: 3,
          lineOpacity: 0.9,
        }}
      />
    </ShapeSource>
  );
}
