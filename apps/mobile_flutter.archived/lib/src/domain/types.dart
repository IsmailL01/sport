// Доменная модель прототипа Phase 0.
// Идентична RN-версии (см. apps/mobile-rn/src/domain/types.ts).
// В Phase 1 эти типы переедут в общий пакет, см. ТЗ §4.2.

class RawPoint {
  /// Unix epoch milliseconds.
  final int timestamp;
  final double latitude;
  final double longitude;

  /// Метры над эллипсоидом WGS84, null если устройство не предоставило.
  final double? altitude;

  /// Горизонтальная точность в метрах, null если неизвестна.
  final double? accuracy;

  /// м/с, null если неизвестна.
  final double? speed;

  /// Курс в градусах от севера по часовой, null если неизвестен.
  final double? heading;

  const RawPoint({
    required this.timestamp,
    required this.latitude,
    required this.longitude,
    this.altitude,
    this.accuracy,
    this.speed,
    this.heading,
  });

  @override
  String toString() =>
      'RawPoint(t=$timestamp, $latitude,$longitude, ±${accuracy?.toStringAsFixed(1)}m)';
}

enum ActivityState { idle, recording, stopped }

class Session {
  final String id;
  final int startedAt;
  final int? endedAt;
  final int pointCount;

  const Session({
    required this.id,
    required this.startedAt,
    required this.endedAt,
    required this.pointCount,
  });
}
