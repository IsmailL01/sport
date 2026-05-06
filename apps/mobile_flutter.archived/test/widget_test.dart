// Phase 0 / P0-C-02: smoke-тест для error-screen, когда MAPBOX_ACCESS_TOKEN не задан.
//
// Полноценный тест карты (`MapWidget`) требует mock'а нативной библиотеки Mapbox
// или работающего эмулятора — в Phase 0 откладывается до runtime-тестов на устройстве.

import 'package:flutter_test/flutter_test.dart';

import 'package:mobile_flutter/main.dart';

void main() {
  testWidgets('Shows config error when MAPBOX_ACCESS_TOKEN is empty', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(const RunningEcosystemApp());
    await tester.pumpAndSettle();

    // Тест запускается без --dart-define, значит токен пуст
    // и приложение должно показать config-error экран.
    expect(find.text('Конфигурация неполна'), findsOneWidget);
    expect(find.textContaining('MAPBOX_ACCESS_TOKEN'), findsOneWidget);
  });
}
