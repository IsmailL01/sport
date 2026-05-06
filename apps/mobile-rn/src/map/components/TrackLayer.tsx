// Линия трека на карте. ТЗ §10.5 / FR-022: только LineLayer + GeoJsonSource,
// никаких PolylineAnnotation. Обновление shape без пересоздания source (FR-024).

import { useMemo } from 'react';
import { LineLayer, ShapeSource } from '@rnmapbox/maps';

import type { RawPoint } from '../../domain/types';
import { pointsToLineString } from '../../util/geojson';

export type TrackLayerProps = {
  points: readonly RawPoint[];
  /** Hex color без альфа-канала. По умолчанию акцентный зелёный. */
  color?: string;
  /** Толщина линии. По умолчанию 6. */
  width?: number;
  /** ID источника / слоя — нужен только если на карте несколько треков. */
  id?: string;
};

export function TrackLayer({
  points,
  color = '#10B981',
  width = 6,
  id = 'track',
}: TrackLayerProps) {
  const shape = useMemo(() => pointsToLineString([...points]), [points]);
  return (
    <ShapeSource id={`${id}-source`} shape={shape}>
      <LineLayer
        id={`${id}-line`}
        style={{
          lineColor: color,
          lineWidth: width,
          lineCap: 'round',
          lineJoin: 'round',
          lineOpacity: 0.9,
        }}
      />
    </ShapeSource>
  );
}
