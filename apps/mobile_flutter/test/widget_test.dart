// Smoke-test для bootstrap screen приложения Running Ecosystem (Phase 0).
// После реализации MapScreen (P1-B-01) этот тест будет заменён.

import 'package:flutter_test/flutter_test.dart';

import 'package:mobile_flutter/main.dart';

void main() {
  testWidgets('Bootstrap screen renders title and phase marker', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(const RunningEcosystemApp());

    expect(find.text('Running Ecosystem'), findsOneWidget);
    expect(find.textContaining('Phase 0'), findsOneWidget);
  });
}
