import 'package:flutter/material.dart';

void main() {
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
      home: const _BootstrapScreen(),
    );
  }
}

class _BootstrapScreen extends StatelessWidget {
  const _BootstrapScreen();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 32),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: const [
                Text(
                  'Running Ecosystem',
                  style: TextStyle(
                    fontSize: 28,
                    fontWeight: FontWeight.w700,
                    color: Colors.white,
                  ),
                ),
                SizedBox(height: 8),
                Text(
                  'Phase 0 — Flutter prototype (P0-C-01)',
                  style: TextStyle(fontSize: 14, color: Color(0xFF94A3B8)),
                ),
                SizedBox(height: 24),
                Text(
                  'Следующий шаг: P0-C-02 — карта Mapbox с user location.\n'
                  'См. /docs/DEVELOPMENT_PLAN.md',
                  style: TextStyle(
                    fontSize: 12,
                    color: Color(0xFF64748B),
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
