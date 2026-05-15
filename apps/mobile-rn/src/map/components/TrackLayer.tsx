// Линия трека на карте. ТЗ §10.5 / FR-022: только LineLayer + GeoJsonSource,
// никаких PolylineAnnotation. Обновление shape без пересоздания source (FR-024).
//
// Phase 1 / PHASE1-05: длинные треки (>2000 точек) проходят через
// simplifyForDisplay (Douglas-Peucker) ради NFR-006 (≥50 fps panning).
// ВАЖНО: simplified output идёт ТОЛЬКО в визуальный LineLayer. Closure detection
// и area calc продолжают читать raw `points` напрямую из store — см. CONTEXT.md D-14.

import { useMemo } from 'react';
import { LineLayer, ShapeSource } from '@rnmapbox/maps';

import type { RawPoint } from '../../domain/types';
import { pointsToLineString } from '../../util/geojson';
import { SIMPLIFY_THRESHOLD_PTS, simplifyForDisplay } from '../util/simplify';

export type TrackLayerProps = {
  points: readonly RawPoint[];
  /** Hex color без альфа-канала. По умолчанию акцентный зелёный. */
  color?: string;
  /** Толщина линии. По умолчанию 6. */
  width?: number;
  /** ID источника / слоя — нужен только если на карте несколько треков. */
  id?: string;
  /**
   * Текущий zoom-уровень камеры. Используется только для масштабирования
   * tolerance в simplifyForDisplay (см. ТЗ §10.5 / PHASE1-05). По умолчанию 14 —
   * нейтральное среднее значение, безопасное и для live-режима (zoom≈16), и для
   * post-run превью (zoom≈13).
   */
  zoom?: number;
};

export function TrackLayer({
  points,
  color = '#10B981',
  width = 6,
  id = 'track',
  zoom = 14,
}: TrackLayerProps) {
  // Memo deps: [points.length, zoom]. Дополнительно сегментируем по 50 точкам
  // (Math.floor(length / 50)) чтобы не пересчитывать simplify на каждой принятой
  // точке — даёт smooth update без визуальной задержки. Под порогом
  // SIMPLIFY_THRESHOLD_PTS просто возвращаем raw — там стоимость pointsToLineString
  // линейна, держим прежнее поведение и обновляем на каждый append.
  const shape = useMemo(() => {
    if (points.length < SIMPLIFY_THRESHOLD_PTS) {
      // Малые треки — pre-existing path, минимальный diff на каждое обновление.
      return pointsToLineString([...points]);
    }
    const simplified = simplifyForDisplay({ points, zoom });
    if (simplified === null) {
      // Защитный fallback: simplifyForDisplay не должен вернуть null при
      // >= 2 точках, но если вернёт — деградируем в empty FeatureCollection.
      return { type: 'FeatureCollection' as const, features: [] };
    }
    return simplified;
    // Сегментирование на каждые 50 новых точек: simplify пересчитывается реже,
    // визуально трек остаётся плавным (max задержка ~ 50 сэмплов ≈ 50 с).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Math.floor(points.length / 50), zoom]);

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
