import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import 'package:mapbox_maps_flutter/mapbox_maps_flutter.dart';

import 'src/domain/types.dart';
import 'src/location/location_adapter.dart';
import 'src/state/activity.dart';
import 'src/state/metrics.dart';
import 'src/util/geojson.dart';

const String _kMapboxAccessToken = String.fromEnvironment('MAPBOX_ACCESS_TOKEN');
const String _kMapboxStyle = MapboxStyles.OUTDOORS;

String _initError = '';

void main() {
  FlutterError.onError = (details) {
    debugPrint('[App] FlutterError: ${details.exception}\n${details.stack}');
    FlutterError.dumpErrorToConsole(details);
  };

  WidgetsFlutterBinding.ensureInitialized();

  if (_kMapboxAccessToken.isNotEmpty) {
    try {
      MapboxOptions.setAccessToken(_kMapboxAccessToken);
    } catch (e, st) {
      _initError = 'MapboxOptions.setAccessToken упал: $e\n$st';
      debugPrint('[App] $_initError');
    }
  }

  runApp(const ProviderScope(child: RunningEcosystemApp()));
}

class RunningEcosystemApp extends StatelessWidget {
  const RunningEcosystemApp({super.key});

  @override
  Widget build(BuildContext context) {
    final tokenPreview = _kMapboxAccessToken.isEmpty
        ? '<empty>'
        : '${_kMapboxAccessToken.substring(0, 12)}…'
              '${_kMapboxAccessToken.substring(_kMapboxAccessToken.length - 6)} '
              '(length=${_kMapboxAccessToken.length})';

    Widget home;
    if (_initError.isNotEmpty) {
      home = _ErrorScreen(
        title: 'Mapbox init упал',
        message: '$_initError\n\nToken: $tokenPreview',
      );
    } else if (_kMapboxAccessToken.isEmpty) {
      home = _ErrorScreen(
        title: 'Конфигурация неполна',
        message:
            'MAPBOX_ACCESS_TOKEN не встроен в bundle (token=$tokenPreview).\n\n'
            'Запустите с --dart-define=MAPBOX_ACCESS_TOKEN=pk....',
      );
    } else {
      home = _MapScreen(tokenPreview: tokenPreview);
    }

    return MaterialApp(
      title: 'Running Ecosystem',
      themeMode: ThemeMode.dark,
      theme: ThemeData.dark(useMaterial3: true).copyWith(
        scaffoldBackgroundColor: const Color(0xFF0F1419),
      ),
      darkTheme: ThemeData.dark(useMaterial3: true).copyWith(
        scaffoldBackgroundColor: const Color(0xFF0F1419),
      ),
      home: home,
    );
  }
}

class _MapScreen extends ConsumerStatefulWidget {
  final String tokenPreview;
  const _MapScreen({required this.tokenPreview});

  @override
  ConsumerState<_MapScreen> createState() => _MapScreenState();
}

enum _PermissionState { pending, granted, denied }

class _MapScreenState extends ConsumerState<_MapScreen> {
  _PermissionState _permissionState = _PermissionState.pending;
  String? _permissionError;
  String? _mapError;
  MapboxMap? _map;
  bool _trackLayerAdded = false;
  bool _zoneLayerAdded = false;
  String? _lastPolygonJson;

  @override
  void initState() {
    super.initState();
    _ensurePermission();
    // Восстановить последнюю сессию из SQLite (после force-kill).
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(activityProvider.notifier).recoverLast();
    });
  }

  @override
  void dispose() {
    locationAdapter.stop();
    super.dispose();
  }

  Future<void> _ensurePermission() async {
    try {
      LocationPermission permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      if (!mounted) return;
      setState(() {
        _permissionState =
            (permission == LocationPermission.whileInUse ||
                permission == LocationPermission.always)
            ? _PermissionState.granted
            : _PermissionState.denied;
      });
    } catch (e, st) {
      debugPrint('[App] permission error: $e\n$st');
      if (!mounted) return;
      setState(() {
        _permissionState = _PermissionState.denied;
        _permissionError = e.toString();
      });
    }
  }

  Future<void> _onMapCreated(MapboxMap map) async {
    _map = map;
    try {
      await map.location.updateSettings(
        LocationComponentSettings(
          enabled: true,
          pulsingEnabled: true,
          showAccuracyRing: true,
        ),
      );
      await map.setCamera(CameraOptions(zoom: 16.0));
      await _ensureTrackLayer();
      await _ensureZoneLayer();
    } catch (e, st) {
      debugPrint('[App] map init error: $e\n$st');
      if (!mounted) return;
      setState(() => _mapError = e.toString());
    }
  }

  Future<void> _ensureTrackLayer() async {
    final map = _map;
    if (map == null || _trackLayerAdded) return;
    try {
      await map.style.addSource(
        GeoJsonSource(id: 'track-source', data: pointsToLineStringJson([])),
      );
      await map.style.addLayer(
        LineLayer(
          id: 'track-line',
          sourceId: 'track-source',
          lineColor: 0xFF10B981,
          lineWidth: 6.0,
          lineCap: LineCap.ROUND,
          lineJoin: LineJoin.ROUND,
          lineOpacity: 0.9,
        ),
      );
      _trackLayerAdded = true;
    } catch (e, st) {
      debugPrint('[App] add track layer failed: $e\n$st');
    }
  }

  Future<void> _ensureZoneLayer() async {
    final map = _map;
    if (map == null || _zoneLayerAdded) return;
    try {
      await map.style.addSource(
        GeoJsonSource(id: 'zone-source', data: pointsToPolygonJson([])),
      );
      // FillLayer внизу — выше track-line чтобы линия трека была видна поверх заливки.
      await map.style.addLayerAt(
        FillLayer(
          id: 'zone-fill',
          sourceId: 'zone-source',
          fillColor: 0xFF10B981,
          fillOpacity: 0.3,
        ),
        LayerPosition(below: 'track-line'),
      );
      await map.style.addLayer(
        LineLayer(
          id: 'zone-outline',
          sourceId: 'zone-source',
          lineColor: 0xFF10B981,
          lineWidth: 3.0,
          lineOpacity: 0.9,
        ),
      );
      _zoneLayerAdded = true;
    } catch (e, st) {
      debugPrint('[App] add zone layer failed: $e\n$st');
    }
  }

  Future<void> _updateTrackOnMap(List<RawPoint> points) async {
    final map = _map;
    if (map == null || !_trackLayerAdded) return;
    final json = pointsToLineStringJson(points);
    try {
      await map.style.setStyleSourceProperty('track-source', 'data', json);
    } catch (e) {
      debugPrint('[App] update track source failed: $e');
    }
  }

  Future<void> _updateZoneOnMap(String? polygonJson) async {
    final map = _map;
    if (map == null) return;
    // Идемпотентность: пропускаем повторное обновление с тем же JSON.
    if (polygonJson == _lastPolygonJson) return;
    _lastPolygonJson = polygonJson;
    if (!_zoneLayerAdded) {
      await _ensureZoneLayer();
    }
    final dataToSet =
        polygonJson ?? pointsToPolygonJson(<RawPoint>[]); // empty collection
    try {
      await map.style.setStyleSourceProperty('zone-source', 'data', dataToSet);
    } catch (e) {
      debugPrint('[App] update zone source failed: $e');
    }
  }

  Future<void> _handleStart() async {
    final notifier = ref.read(activityProvider.notifier);
    notifier.start();
    try {
      await locationAdapter.start((point) {
        ref.read(activityProvider.notifier).addPoint(point);
        debugPrint(
          '[location] ${point.latitude.toStringAsFixed(6)},'
          '${point.longitude.toStringAsFixed(6)} '
          '±${point.accuracy?.toStringAsFixed(1) ?? "?"}m',
        );
      });
    } catch (e, st) {
      debugPrint('[App] locationAdapter.start failed: $e\n$st');
      notifier.stop();
    }
  }

  Future<void> _handleStop() async {
    await locationAdapter.stop();
    await ref.read(activityProvider.notifier).stop();
  }

  Future<void> _handleReset() async {
    await locationAdapter.stop();
    await ref.read(activityProvider.notifier).reset();
  }

  @override
  Widget build(BuildContext context) {
    // Реагируем на новые точки — обновляем track на карте.
    ref.listen<ActivityRecording>(activityProvider, (prev, next) {
      if (prev?.points.length == next.points.length) return;
      _updateTrackOnMap(next.points);
    });

    // Реагируем на metrics — обновляем polygon zone на карте.
    ref.listen<TrackMetrics>(trackMetricsProvider, (prev, next) {
      if (prev?.polygonGeoJson == next.polygonGeoJson) return;
      _updateZoneOnMap(next.polygonGeoJson);
    });

    if (_mapError != null) {
      return _ErrorScreen(
        title: 'Mapbox runtime error',
        message: '$_mapError\n\nToken: ${widget.tokenPreview}',
      );
    }

    switch (_permissionState) {
      case _PermissionState.pending:
        return Scaffold(
          body: Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: const [
                CircularProgressIndicator(),
                SizedBox(height: 16),
                Text(
                  'Запрашиваем разрешение на геолокацию…',
                  style: TextStyle(color: Color(0xFF94A3B8), fontSize: 14),
                ),
              ],
            ),
          ),
        );
      case _PermissionState.denied:
        return _ErrorScreen(
          title: 'Нет доступа к геолокации',
          message:
              _permissionError ??
              'Откройте настройки приложения и разрешите доступ к местоположению.',
        );
      case _PermissionState.granted:
        return _RecordingScaffold(
          onStart: _handleStart,
          onStop: _handleStop,
          onReset: _handleReset,
          mapBuilder: (context) => MapWidget(
            styleUri: _kMapboxStyle,
            onMapCreated: _onMapCreated,
          ),
        );
    }
  }
}

class _RecordingScaffold extends ConsumerWidget {
  final VoidCallback onStart;
  final VoidCallback onStop;
  final VoidCallback onReset;
  final Widget Function(BuildContext) mapBuilder;

  const _RecordingScaffold({
    required this.onStart,
    required this.onStop,
    required this.onReset,
    required this.mapBuilder,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final activity = ref.watch(activityProvider);
    final metrics = ref.watch(trackMetricsProvider);
    final pointCount = activity.points.length;
    final lastPoint = pointCount > 0 ? activity.points.last : null;
    final elapsed = activity.startedAt == null
        ? Duration.zero
        : DateTime.now().difference(activity.startedAt!);

    return Scaffold(
      body: Stack(
        children: [
          Positioned.fill(child: mapBuilder(context)),
          Positioned(
            top: 56,
            left: 16,
            right: 16,
            child: _StatsCard(
              activityState: activity.state,
              elapsed: elapsed,
              pointCount: pointCount,
              lastAccuracy: lastPoint?.accuracy,
              distance: metrics.distance,
              area: metrics.area,
              isClosed: metrics.isClosed,
            ),
          ),
          Positioned(
            bottom: 48,
            left: 0,
            right: 0,
            child: Center(
              child: _RecordingButton(
                state: activity.state,
                onStart: onStart,
                onStop: onStop,
                onReset: onReset,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _StatsCard extends StatelessWidget {
  final ActivityState activityState;
  final Duration elapsed;
  final int pointCount;
  final double? lastAccuracy;
  final double distance;
  final double? area;
  final bool isClosed;

  const _StatsCard({
    required this.activityState,
    required this.elapsed,
    required this.pointCount,
    required this.lastAccuracy,
    required this.distance,
    required this.area,
    required this.isClosed,
  });

  @override
  Widget build(BuildContext context) {
    final title = switch (activityState) {
      ActivityState.idle => 'Готов к записи',
      ActivityState.recording => '🔴 Запись · ${_formatDuration(elapsed)}',
      ActivityState.stopped => '⏸ Остановлено',
    };
    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFF0F1419).withValues(alpha: 0.85),
        borderRadius: BorderRadius.circular(12),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            title,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 16,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            '${_formatDistance(distance)}  ·  $pointCount точек'
            '${lastAccuracy != null ? "  ·  ±${lastAccuracy!.toStringAsFixed(1)}m" : ""}',
            style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 13),
          ),
          if (isClosed && area != null) ...[
            const SizedBox(height: 8),
            Text(
              '🏆 Зона: ${_formatArea(area!)}',
              style: const TextStyle(
                color: Color(0xFF10B981),
                fontSize: 14,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

String _formatDistance(double m) {
  if (m < 1000) return '${m.toStringAsFixed(0)} м';
  return '${(m / 1000).toStringAsFixed(2)} км';
}

String _formatArea(double m2) {
  if (m2 < 10000) return '${m2.toStringAsFixed(0)} м²';
  if (m2 < 1000000) return '${(m2 / 10000).toStringAsFixed(2)} га';
  return '${(m2 / 1000000).toStringAsFixed(3)} км²';
}

class _RecordingButton extends StatelessWidget {
  final ActivityState state;
  final VoidCallback onStart;
  final VoidCallback onStop;
  final VoidCallback onReset;

  const _RecordingButton({
    required this.state,
    required this.onStart,
    required this.onStop,
    required this.onReset,
  });

  @override
  Widget build(BuildContext context) {
    final (label, color, callback) = switch (state) {
      ActivityState.idle => ('START', const Color(0xFF10B981), onStart),
      ActivityState.recording => ('STOP', const Color(0xFFEF4444), onStop),
      ActivityState.stopped => ('RESET', const Color(0xFF3B82F6), onReset),
    };
    return Material(
      color: color,
      borderRadius: BorderRadius.circular(32),
      elevation: 6,
      child: InkWell(
        onTap: callback,
        borderRadius: BorderRadius.circular(32),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 18),
          constraints: const BoxConstraints(minWidth: 160),
          alignment: Alignment.center,
          child: Text(
            label,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 16,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.5,
            ),
          ),
        ),
      ),
    );
  }
}

String _formatDuration(Duration d) {
  final h = d.inHours;
  final m = d.inMinutes.remainder(60);
  final s = d.inSeconds.remainder(60);
  if (h > 0) {
    return '$h:${m.toString().padLeft(2, '0')}:${s.toString().padLeft(2, '0')}';
  }
  return '$m:${s.toString().padLeft(2, '0')}';
}

class _ErrorScreen extends StatelessWidget {
  final String title;
  final String message;

  const _ErrorScreen({required this.title, required this.message});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 64),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.w700,
                    color: Color(0xFFEF4444),
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 16),
                Text(
                  message,
                  style: const TextStyle(
                    fontSize: 13,
                    color: Color(0xFF94A3B8),
                    height: 1.5,
                    fontFamily: 'Courier',
                  ),
                  textAlign: TextAlign.center,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
