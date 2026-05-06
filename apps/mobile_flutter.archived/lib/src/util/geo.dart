// Геометрические утилиты прототипа Phase 0.
// Идентичны RN-версии (см. apps/mobile-rn/src/util/geo.ts).

import 'dart:math' as math;

import '../domain/types.dart';

const double _earthRadiusM = 6371000.0;
const double _deg2rad = math.pi / 180.0;

/// Haversine distance между двумя точками, в метрах. ТЗ §6.2.
double haversineDistance(RawPoint a, RawPoint b) {
  final phi1 = a.latitude * _deg2rad;
  final phi2 = b.latitude * _deg2rad;
  final dphi = (b.latitude - a.latitude) * _deg2rad;
  final dlambda = (b.longitude - a.longitude) * _deg2rad;
  final x =
      math.pow(math.sin(dphi / 2), 2) +
      math.cos(phi1) *
          math.cos(phi2) *
          math.pow(math.sin(dlambda / 2), 2);
  final c = 2 * math.atan2(math.sqrt(x), math.sqrt(1 - x));
  return _earthRadiusM * c;
}

/// Накопительная дистанция по списку точек, в метрах.
double totalDistance(List<RawPoint> points) {
  if (points.length < 2) return 0;
  var sum = 0.0;
  for (var i = 1; i < points.length; i++) {
    sum += haversineDistance(points[i - 1], points[i]);
  }
  return sum;
}

/// Замкнут ли трек: ТЗ §6.5 — длина >200м И dist(first,last) <20м.
bool isClosed(List<RawPoint> points, [double? totalDistanceM]) {
  if (points.length < 3) return false;
  final dist = totalDistanceM ?? totalDistance(points);
  if (dist < 200) return false;
  return haversineDistance(points.first, points.last) < 20;
}

class _XY {
  final double x;
  final double y;
  const _XY(this.x, this.y);
}

/// Локальная плоская проекция точек относительно их центроида (ТЗ §6.6).
List<_XY> _localProjection(List<RawPoint> points) {
  if (points.isEmpty) return const [];
  final lat0 = points.fold<double>(0, (a, p) => a + p.latitude) / points.length;
  final lon0 = points.fold<double>(0, (a, p) => a + p.longitude) / points.length;
  final cosLat0 = math.cos(lat0 * _deg2rad);
  return points
      .map(
        (p) => _XY(
          (p.longitude - lon0) * _deg2rad * cosLat0 * _earthRadiusM,
          (p.latitude - lat0) * _deg2rad * _earthRadiusM,
        ),
      )
      .toList();
}

/// Shoelace area для последовательности точек в локальной плоскости.
double _shoelaceArea(List<_XY> xy) {
  if (xy.length < 3) return 0;
  var s = 0.0;
  for (var i = 0; i < xy.length; i++) {
    final j = (i + 1) % xy.length;
    s += xy[i].x * xy[j].y - xy[j].x * xy[i].y;
  }
  return s / 2;
}

/// Площадь замкнутого трека в м². Возвращает null если points.length < 3.
double? computeArea(List<RawPoint> points) {
  if (points.length < 3) return null;
  final xy = _localProjection(points);
  return _shoelaceArea(xy).abs();
}
