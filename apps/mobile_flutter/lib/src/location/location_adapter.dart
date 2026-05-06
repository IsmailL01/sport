import 'dart:async';

import 'package:geolocator/geolocator.dart';

import '../domain/types.dart';

/// Обёртка над geolocator. Скрывает платформенные детали от UI и state.
/// В Phase 1 заменяется полноценным `LocationAdapter` интерфейсом
/// (см. ТЗ §3.3 sensor-agnostic).
class LocationAdapter {
  StreamSubscription<Position>? _subscription;

  Future<void> start(void Function(RawPoint) listener) async {
    _subscription = Geolocator.getPositionStream(
      locationSettings: const LocationSettings(
        accuracy: LocationAccuracy.bestForNavigation,
        distanceFilter: 5,
      ),
    ).listen((position) {
      listener(_toRawPoint(position));
    });
  }

  Future<void> stop() async {
    await _subscription?.cancel();
    _subscription = null;
  }

  bool get isRunning => _subscription != null;
}

RawPoint _toRawPoint(Position p) => RawPoint(
  timestamp: p.timestamp.millisecondsSinceEpoch,
  latitude: p.latitude,
  longitude: p.longitude,
  altitude: p.altitude,
  accuracy: p.accuracy,
  speed: p.speed,
  heading: p.heading,
);

final LocationAdapter locationAdapter = LocationAdapter();
