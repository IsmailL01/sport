import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:mapbox_maps_flutter/mapbox_maps_flutter.dart';

const String _kMapboxAccessToken = String.fromEnvironment('MAPBOX_ACCESS_TOKEN');
const String _kMapboxStyle = MapboxStyles.OUTDOORS;

void main() {
  WidgetsFlutterBinding.ensureInitialized();

  if (_kMapboxAccessToken.isNotEmpty) {
    MapboxOptions.setAccessToken(_kMapboxAccessToken);
  }

  runApp(const RunningEcosystemApp());
}

class RunningEcosystemApp extends StatelessWidget {
  const RunningEcosystemApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Running Ecosystem',
      themeMode: ThemeMode.dark,
      darkTheme: ThemeData.dark(useMaterial3: true).copyWith(
        scaffoldBackgroundColor: const Color(0xFF0F1419),
      ),
      home: _kMapboxAccessToken.isEmpty
          ? const _ErrorScreen(
              title: 'Конфигурация неполна',
              message:
                  'MAPBOX_ACCESS_TOKEN не задан. Запустите с --dart-define=MAPBOX_ACCESS_TOKEN=pk....\n'
                  'См. /docs/SECRETS.md и apps/mobile_flutter/README.md.',
            )
          : const _MapScreen(),
    );
  }
}

class _MapScreen extends StatefulWidget {
  const _MapScreen();

  @override
  State<_MapScreen> createState() => _MapScreenState();
}

class _MapScreenState extends State<_MapScreen> {
  _PermissionState _permissionState = _PermissionState.pending;

  @override
  void initState() {
    super.initState();
    _ensurePermission();
  }

  Future<void> _ensurePermission() async {
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
  }

  @override
  Widget build(BuildContext context) {
    switch (_permissionState) {
      case _PermissionState.pending:
        return const Scaffold(
          body: Center(child: CircularProgressIndicator()),
        );
      case _PermissionState.denied:
        return const _ErrorScreen(
          title: 'Нет доступа к геолокации',
          message:
              'Откройте настройки приложения и разрешите доступ к местоположению — '
              'без него карта не сможет показывать вашу позицию и записывать пробежку.',
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
    await map.location.updateSettings(
      LocationComponentSettings(
        enabled: true,
        pulsingEnabled: true,
        showAccuracyRing: true,
      ),
    );
    await map.setCamera(CameraOptions(zoom: 16.0));
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
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 32),
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
                const SizedBox(height: 12),
                Text(
                  message,
                  style: const TextStyle(
                    fontSize: 14,
                    color: Color(0xFF94A3B8),
                    height: 1.4,
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
