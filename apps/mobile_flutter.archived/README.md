# mobile_flutter

Flutter прототип Phase 0 для проекта Running Ecosystem.

См. корневой [README](../../README.md) для общего контекста и [docs/DEVELOPMENT_PLAN.md](../../docs/DEVELOPMENT_PLAN.md) §2.8 для деталей задач `P0-C-01..P0-C-07`.

## Стек

- **Flutter** ^3.11.3, Dart 3.x, Material 3
- **mapbox_maps_flutter** ^2.23.0 — официальный SDK от Mapbox (плюс относительно RN, где используется community-плагин)
- **geolocator** ^14.0.2 — GPS foreground
- **flutter_background_service** ^5.1.0 — Android foreground service + iOS background mode
- **sqflite** ^2.4 + **path_provider** ^2.1 — локальное хранилище
- **flutter_riverpod** ^3.3.1 — state management

> Геометрия (площадь, упрощение Дугласа-Пёкера, буфер) — **не зависимость**, реализуется на Dart напрямую (shoelace в 30 строк, см. ТЗ §6.6 / §6).

## Bundle ID / Application ID

iOS Bundle ID и Android applicationId: `com.runningecosystem.mobile_flutter`

> ⚠️ Заметка: для прототипа Phase 0 используется суффикс `_flutter` чтобы не конфликтовать с RN-приложением (`com.runningecosystem.mobile`) если оба установлены параллельно для тестов. Когда выбран финальный фреймворк (`P0-D-05`) — переименовать в `com.runningecosystem.mobile`.

## Setup перед первым запуском

> Перед запуском нужно настроить Mapbox-токены. См. [docs/SECRETS.md](../../docs/SECRETS.md).

### 1. `~/.netrc` для iOS CocoaPods

```bash
cat >> ~/.netrc <<'EOF'
machine api.mapbox.com
  login mapbox
  password sk.<DOWNLOADS:READ token>
EOF
chmod 600 ~/.netrc
```

### 2. `~/.gradle/gradle.properties` для Android Maven

```bash
mkdir -p ~/.gradle
cat >> ~/.gradle/gradle.properties <<'EOF'
MAPBOX_DOWNLOADS_TOKEN=sk.<DOWNLOADS:READ token>
EOF
chmod 600 ~/.gradle/gradle.properties
```

### 3. `.env` для runtime токена (опционально)

```bash
cp .env.example .env
# Подставить MAPBOX_ACCESS_TOKEN=pk.<dev-public token>
```

В Dart-коде токен передаётся через `--dart-define`:
```bash
flutter run --dart-define=MAPBOX_ACCESS_TOKEN=$(grep MAPBOX_ACCESS_TOKEN .env | cut -d '=' -f2)
```

## Запуск

### Android

```bash
flutter pub get
flutter run --dart-define=MAPBOX_ACCESS_TOKEN=pk....
```

Требует:
- `ANDROID_HOME` установлена
- Эмулятор или подключённое устройство (`flutter devices`)
- JDK 17+
- `~/.gradle/gradle.properties` с `MAPBOX_DOWNLOADS_TOKEN`

### iOS

```bash
flutter pub get
cd ios && pod install && cd ..
flutter run --dart-define=MAPBOX_ACCESS_TOKEN=pk....
```

Требует:
- **Xcode установлен**
- macOS
- CocoaPods
- `~/.netrc` с download token

## Скрипты

```bash
flutter pub get               # Установка зависимостей
flutter analyze               # Линтер + типы
flutter test                  # Запустить unit/widget тесты
flutter build apk --debug     # Android debug APK
flutter build ios --debug     # iOS debug build (требует Xcode)
flutter clean                 # Сброс build artifacts
```

## Структура

```
mobile_flutter/
├── lib/
│   └── main.dart            # entry, сейчас bootstrap screen (P0-C-01); расширяется в P0-C-02..07
├── test/
│   └── widget_test.dart     # smoke test
├── ios/                     # native iOS project — коммитим в git (не CNG в Flutter)
├── android/                 # native Android project — коммитим
├── pubspec.yaml             # зависимости
├── analysis_options.yaml    # dart analyzer config
├── .env.example
└── .env                     # в .gitignore
```

> 📝 **Отличие от RN/Expo:** в Flutter папки `ios/` и `android/` коммитятся в git. Это даёт больше контроля над native кодом, но требует ручного синка изменений между платформами.

## Известные ограничения / TODO

- iOS run требует **установленного Xcode** — текущее окружение имеет только CommandLineTools.
- Android SHA-256 fingerprint Mapbox restriction — добавить в Mapbox dashboard после первого `flutter run` на Android (debug certificate в `~/.android/debug.keystore`).
- Геометрия (turf) реализуется напрямую в `lib/src/util/geo.dart` (когда дойдём до P0-C-05).

## Roadmap внутри прототипа

| Задача    | Что добавит                                       |
|-----------|---------------------------------------------------|
| `P0-C-02` | Карта Mapbox с user location (location puck)      |
| `P0-C-03` | Запись точек GPS через geolocator                 |
| `P0-C-04` | Live полилиния через GeoJsonSource + LineLayer    |
| `P0-C-05` | Замыкание + площадь (shoelace + локальная проекция) |
| `P0-C-06` | Background location (flutter_background_service)  |
| `P0-C-07` | SQLite persistence + crash recovery               |
