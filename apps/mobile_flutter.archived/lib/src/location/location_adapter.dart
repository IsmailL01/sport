import 'dart:async';
import 'dart:io' show Platform;

import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';

import '../domain/types.dart';

/// Обёртка над geolocator. Скрывает платформенные детали от UI и state.
/// На Android использует foreground service notification (через AndroidSettings),
/// на iOS — фоновые обновления через UIBackgroundModes (через AppleSettings).
/// См. ТЗ §4.4 — стратегия background.
class LocationAdapter {
  StreamSubscription<Position>? _subscription;

  Future<void> start(void Function(RawPoint) listener) async {
    final settings = _platformSettings();
    _subscription = Geolocator.getPositionStream(
      locationSettings: settings,
    ).listen(
      (position) => listener(_toRawPoint(position)),
      onError: (error) => debugPrint('[location] stream error: $error'),
    );
  }

  Future<void> stop() async {
    await _subscription?.cancel();
    _subscription = null;
  }

  bool get isRunning => _subscription != null;

  /// Запрашивает background permission. Возвращает true если разрешено.
  /// Для true background на Android требуется LocationPermission.always.
  Future<bool> requestBackgroundPermission() async {
    LocationPermission permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied ||
        permission == LocationPermission.whileInUse) {
      permission = await Geolocator.requestPermission();
    }
    return permission == LocationPermission.always ||
        permission == LocationPermission.whileInUse;
  }
}

LocationSettings _platformSettings() {
  if (Platform.isAndroid) {
    return AndroidSettings(
      accuracy: LocationAccuracy.bestForNavigation,
      distanceFilter: 5,
      foregroundNotificationConfig: const ForegroundNotificationConfig(
        notificationText: 'Running Ecosystem отслеживает вашу позицию.',
        notificationTitle: 'Запись пробежки',
        enableWakeLock: true,
        color: Color(0xFF10B981),
      ),
    );
  }
  if (Platform.isIOS) {
    return AppleSettings(
      accuracy: LocationAccuracy.bestForNavigation,
      distanceFilter: 5,
      showBackgroundLocationIndicator: true,
      allowBackgroundLocationUpdates: true,
      pauseLocationUpdatesAutomatically: false,
      activityType: ActivityType.fitness,
    );
  }
  return const LocationSettings(
    accuracy: LocationAccuracy.bestForNavigation,
    distanceFilter: 5,
  );
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
