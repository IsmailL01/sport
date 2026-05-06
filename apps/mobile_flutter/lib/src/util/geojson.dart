// Утилиты для построения GeoJSON-репрезентаций трека.
// Идентично RN-версии (см. apps/mobile-rn/src/util/geojson.ts).

import 'dart:convert';

import '../domain/types.dart';

/// Преобразовать список raw-точек в GeoJSON LineString feature (как JSON-строку,
/// потому что mapbox_maps_flutter принимает GeoJSON через `data: String`).
/// Возвращает пустую FeatureCollection если точек < 2 (нечего рисовать).
String pointsToLineStringJson(List<RawPoint> points) {
  if (points.length < 2) {
    return jsonEncode({'type': 'FeatureCollection', 'features': []});
  }
  return jsonEncode({
    'type': 'Feature',
    'properties': <String, dynamic>{},
    'geometry': {
      'type': 'LineString',
      'coordinates': points.map((p) => [p.longitude, p.latitude]).toList(),
    },
  });
}
