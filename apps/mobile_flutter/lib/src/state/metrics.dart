import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../util/geo.dart';
import '../util/geojson.dart';
import 'activity.dart';

class TrackMetrics {
  final double distance;
  final bool isClosed;
  final double? area;
  final String? polygonGeoJson;

  const TrackMetrics({
    required this.distance,
    required this.isClosed,
    required this.area,
    required this.polygonGeoJson,
  });
}

final trackMetricsProvider = Provider<TrackMetrics>((ref) {
  final activity = ref.watch(activityProvider);
  final dist = totalDistance(activity.points);
  final closed = isClosed(activity.points, dist);
  return TrackMetrics(
    distance: dist,
    isClosed: closed,
    area: closed ? computeArea(activity.points) : null,
    polygonGeoJson: closed
        ? pointsToPolygonJson(activity.points)
        : null,
  );
});
