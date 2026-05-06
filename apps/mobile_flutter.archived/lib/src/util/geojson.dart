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

/// Преобразовать замкнутый трек в GeoJSON Polygon (как JSON-строку).
/// Автоматически закрывает кольцо (первая = последняя), как требует GeoJSON.
/// Возвращает пустую FeatureCollection если точек < 3.
String pointsToPolygonJson(List<RawPoint> points) {
  if (points.length < 3) {
    return jsonEncode({'type': 'FeatureCollection', 'features': []});
  }
  final coords = points.map((p) => [p.longitude, p.latitude]).toList();
  final first = coords.first;
  final last = coords.last;
  if (first[0] != last[0] || first[1] != last[1]) {
    coords.add(first);
  }
  return jsonEncode({
    'type': 'Feature',
    'properties': <String, dynamic>{},
    'geometry': {
      'type': 'Polygon',
      'coordinates': [coords],
    },
  });
}
