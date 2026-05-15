// RegionPickerOverlay: 4 draggable corner handles + полупрозрачный полигон.
// Phase 1 / PHASE1-10 (D-23..D-26). См. ТЗ §10.3, RESEARCH.md §Pattern 4.
//
// КРИТИЧНО: этот файл — единственная точка, где `@rnmapbox/maps` примитивы
// `PointAnnotation`, `ShapeSource`, `FillLayer` импортируются. Внешний экран
// (`RegionPickerScreen.tsx`) принимает этот компонент уже завёрнутым.
// См. CLAUDE.md (ТЗ §3 принцип 10): SDK quarantine.
//
// Не использовать `LineLayer` для рамки прямоугольника — Mapbox не замыкает
// последний сегмент автоматически. `FillLayer` поверх полигона + edge-LineLayer
// решает обе задачи (RESEARCH.md Anti-Patterns).

import { StyleSheet, View } from 'react-native';
import { FillLayer, LineLayer, PointAnnotation, ShapeSource } from '@rnmapbox/maps';
import type { Feature, Polygon } from 'geojson';

import type { Corner, CornerCoord } from './regionPickerTypes';

export type RegionPickerOverlayProps = {
  /** NE и SW углы прямоугольника. */
  ne: CornerCoord;
  sw: CornerCoord;
  /**
   * Срабатывает когда пользователь окончил drag одного из углов.
   * `which` = какой угол сдвинут; `coord` = новая позиция [lng, lat].
   */
  onCornerDrag: (which: Corner, coord: CornerCoord) => void;
  /** Цвет заливки. По умолчанию зелёный из дизайн-системы (#10B981). */
  fillColor?: string;
  /** Прозрачность заливки (0..1). */
  fillOpacity?: number;
};

/**
 * Строит замкнутый Polygon Feature по 4 углам прямоугольника:
 *   NW → NE → SE → SW → NW (ring замкнут).
 *
 * Координаты в [lng, lat] как требует GeoJSON.
 */
export function rectanglePolygon(
  ne: CornerCoord,
  sw: CornerCoord,
): Feature<Polygon> {
  const [neLng, neLat] = ne;
  const [swLng, swLat] = sw;
  // Ring строится против часовой стрелки для GeoJSON-конвенции.
  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [swLng, neLat], // NW
          [neLng, neLat], // NE
          [neLng, swLat], // SE
          [swLng, swLat], // SW
          [swLng, neLat], // close → NW
        ],
      ],
    },
  };
}

export function RegionPickerOverlay({
  ne,
  sw,
  onCornerDrag,
  fillColor = '#10B981',
  fillOpacity = 0.2,
}: RegionPickerOverlayProps) {
  const polygon = rectanglePolygon(ne, sw);

  // 4 corner handles. NW и SE производные от NE/SW.
  const nw: CornerCoord = [sw[0], ne[1]];
  const se: CornerCoord = [ne[0], sw[1]];

  return (
    <>
      <ShapeSource id="region-picker-source" shape={polygon}>
        <FillLayer
          id="region-picker-fill"
          style={{ fillColor, fillOpacity }}
        />
        <LineLayer
          id="region-picker-edge"
          style={{
            lineColor: fillColor,
            lineWidth: 2,
            lineOpacity: 0.9,
          }}
        />
      </ShapeSource>

      <PointAnnotation
        id="corner-ne"
        coordinate={[ne[0], ne[1]]}
        draggable
        onDragEnd={(e) => {
          const coord = e.geometry.coordinates as CornerCoord;
          onCornerDrag('ne', coord);
        }}
      >
        <CornerHandle color={fillColor} />
      </PointAnnotation>
      <PointAnnotation
        id="corner-sw"
        coordinate={[sw[0], sw[1]]}
        draggable
        onDragEnd={(e) => {
          const coord = e.geometry.coordinates as CornerCoord;
          onCornerDrag('sw', coord);
        }}
      >
        <CornerHandle color={fillColor} />
      </PointAnnotation>
      <PointAnnotation
        id="corner-nw"
        coordinate={[nw[0], nw[1]]}
        draggable
        onDragEnd={(e) => {
          const coord = e.geometry.coordinates as CornerCoord;
          onCornerDrag('nw', coord);
        }}
      >
        <CornerHandle color={fillColor} />
      </PointAnnotation>
      <PointAnnotation
        id="corner-se"
        coordinate={[se[0], se[1]]}
        draggable
        onDragEnd={(e) => {
          const coord = e.geometry.coordinates as CornerCoord;
          onCornerDrag('se', coord);
        }}
      >
        <CornerHandle color={fillColor} />
      </PointAnnotation>
    </>
  );
}

/**
 * Визуал угла прямоугольника — 24×24px белый круг с цветной обводкой.
 * Достаточно крупный чтобы попадать пальцем в зону drag (минимум 24px по HIG).
 */
function CornerHandle({ color }: { color: string }) {
  return (
    <View style={[handleStyles.outer, { borderColor: color }]}>
      <View style={[handleStyles.inner, { backgroundColor: color }]} />
    </View>
  );
}

const handleStyles = StyleSheet.create({
  outer: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 3,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inner: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
