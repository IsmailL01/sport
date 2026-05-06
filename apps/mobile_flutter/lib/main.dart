import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:mapbox_maps_flutter/mapbox_maps_flutter.dart';

const String _kMapboxAccessToken = String.fromEnvironment('MAPBOX_ACCESS_TOKEN');
const String _kMapboxStyle = MapboxStyles.OUTDOORS;

String _initError = '';

void main() {
  runZonedGuarded(_main, (error, stack) {
    debugPrint('[App] Uncaught: $error\n$stack');
  });
}

void _main() {
  WidgetsFlutterBinding.ensureInitialized();

  if (_kMapboxAccessToken.isNotEmpty) {
    try {
      MapboxOptions.setAccessToken(_kMapboxAccessToken);
    } catch (e, st) {
      _initError = 'MapboxOptions.setAccessToken упал: $e\n$st';
      debugPrint('[App] $_initError');
    }
  }

  runApp(const RunningEcosystemApp());
}

void runZonedGuarded(VoidCallback body, void Function(Object, StackTrace) onError) {
  // Простая обёртка через FlutterError handler — без import dart:async для краткости.
  FlutterError.onError = (details) {
    onError(details.exception, details.stack ?? StackTrace.empty);
    FlutterError.dumpErrorToConsole(details);
  };
  body();
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
            'Запустите с --dart-define=MAPBOX_ACCESS_TOKEN=pk....\n'
            'См. /docs/SECRETS.md.',
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

class _MapScreen extends StatefulWidget {
  final String tokenPreview;
  const _MapScreen({required this.tokenPreview});

  @override
  State<_MapScreen> createState() => _MapScreenState();
}

class _MapScreenState extends State<_MapScreen> {
  _PermissionState _permissionState = _PermissionState.pending;
  String? _permissionError;
  String? _mapError;

  @override
  void initState() {
    super.initState();
    _ensurePermission();
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

  @override
  Widget build(BuildContext context) {
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
              children: [
                const CircularProgressIndicator(),
                const SizedBox(height: 16),
                const Text(
                  'Запрашиваем разрешение на геолокацию…',
                  style: TextStyle(color: Color(0xFF94A3B8), fontSize: 14),
                ),
                const SizedBox(height: 8),
                Text(
                  'Token: ${widget.tokenPreview}',
                  style: const TextStyle(
                    color: Color(0xFF64748B),
                    fontSize: 11,
                    fontFamily: 'Courier',
                  ),
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
        return Scaffold(
          body: MapWidget(
            styleUri: _kMapboxStyle,
            onMapCreated: _onMapCreated,
          ),
        );
    }
  }

  Future<void> _onMapCreated(MapboxMap map) async {
    try {
      await map.location.updateSettings(
        LocationComponentSettings(
          enabled: true,
          pulsingEnabled: true,
          showAccuracyRing: true,
        ),
      );
      await map.setCamera(CameraOptions(zoom: 16.0));
    } catch (e, st) {
      debugPrint('[App] map init error: $e\n$st');
      if (!mounted) return;
      setState(() {
        _mapError = e.toString();
      });
    }
  }
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

enum _PermissionState { pending, granted, denied }
