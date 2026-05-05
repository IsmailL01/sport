# mobile-rn

Expo React Native прототип Phase 0 для проекта Running Ecosystem.

См. корневой [README](../../README.md) для общего контекста и [docs/DEVELOPMENT_PLAN.md](../../docs/DEVELOPMENT_PLAN.md) §2.7 для деталей задач `P0-B-01..P0-B-07`.

## Стек

- **Expo SDK** ~54.0.33 (React Native 0.81.5, React 19.1, TypeScript 5.9)
- **EAS Build** для iOS / Android dev клиентов (Expo Go не подходит — фон не работает)
- **@rnmapbox/maps** ^10.3.0 — карта (community-поддерживаемый, не официальный Mapbox)
- **expo-location** + **expo-task-manager** — GPS foreground + background
- **expo-sqlite** — локальное хранилище
- **react-native-mmkv** — быстрая запись метрик телеметрии
- **zustand** — state management
- **@turf/{turf,helpers,buffer,simplify}** — геометрия (площадь, упрощение, буфер полилинии)

## Bundle ID

`com.runningecosystem.mobile` — единый для iOS и Android.

## Setup перед первым запуском

> Перед запуском нужно настроить **два** Mapbox-токена и переменные окружения. См. [docs/SECRETS.md](../../docs/SECRETS.md) для метаданных.

### 1. `~/.netrc` для iOS CocoaPods

```bash
cat >> ~/.netrc <<'EOF'
machine api.mapbox.com
  login mapbox
  password sk.<DOWNLOADS:READ token>
EOF
chmod 600 ~/.netrc
```

### 2. Env variable для Expo prebuild / EAS Build

```bash
# В ~/.zshrc — для постоянной настройки:
export RNMAPBOX_MAPS_DOWNLOAD_TOKEN=sk.<DOWNLOADS:READ token>

# Или per-session:
export RNMAPBOX_MAPS_DOWNLOAD_TOKEN=sk....
```

### 3. `.env` для runtime токена

```bash
cp .env.example .env
# Открыть .env и подставить EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN=pk.<dev-public token>
```

## Запуск

### Android

```bash
# Один раз: prebuild сгенерирует папку android/
npx expo prebuild --platform android

# Запуск на эмуляторе или подключённом устройстве
npx expo run:android
```

Требует:
- `ANDROID_HOME` установлена (например, `~/Library/Android/sdk`)
- Запущенный эмулятор или подключённое устройство (`adb devices`)
- JDK 17+
- Android SDK + build-tools + platform-tools
- `~/.gradle/gradle.properties` с `MAPBOX_DOWNLOADS_TOKEN=sk....`

### iOS

```bash
# Один раз: prebuild сгенерирует папку ios/
npx expo prebuild --platform ios

# pod install (уже автоматически в prebuild, если есть Mapbox download token в ~/.netrc)
npx expo run:ios
```

Требует:
- **Xcode установлен** (не только CommandLineTools)
- macOS
- CocoaPods (`pod --version`)
- `~/.netrc` с download token (см. выше)
- iOS Simulator или подключённый iPhone (`xcrun simctl list devices`)

## Скрипты

```bash
npm start           # Запустить Metro bundler в dev-client mode
npm run ios         # expo run:ios
npm run android     # expo run:android
npm run prebuild    # Регенерация ios/ и android/ из app.json
npm run typecheck   # tsc --noEmit (проверка TypeScript без сборки)
npm run lint        # placeholder, настроится в P1-A-01
npm test            # placeholder, настроится в P1-A-01
```

## Структура

```
mobile-rn/
├── App.tsx              # entry, сейчас bootstrap screen (P0-B-01); расширяется в P0-B-02..07
├── app.json             # Expo конфиг: Bundle ID, permissions, plugins
├── eas.json             # EAS Build profiles (development/preview/production)
├── .env.example         # шаблон env (без значений)
├── .env                 # реальный env (в .gitignore)
├── package.json
├── tsconfig.json
├── assets/              # иконки, splash
├── ios/                 # генерируется prebuild, в .gitignore (CNG pattern)
└── android/             # генерируется prebuild, в .gitignore (CNG pattern)
```

> 📝 **CNG (Continuous Native Generation):** папки `ios/` и `android/` НЕ коммитятся в git — они регенерируются из `app.json` через `expo prebuild`. Все native изменения должны идти через `app.json` или Expo config plugins.

## Известные ограничения / TODO

- iOS run требует **установленного Xcode** — текущее окружение разработки имеет только CommandLineTools, локальная сборка iOS невозможна. Альтернативы: установить Xcode (~7GB через App Store) или использовать `eas build --profile development --platform ios` (cloud сборка).
- Android SHA-256 fingerprint Mapbox restriction — добавить в Mapbox dashboard после первого `expo run:android` (debug certificate появится в `~/.android/debug.keystore`).
- ESLint/Prettier настроятся в Phase 1 (`P1-A-01`).

## Roadmap внутри прототипа

| Задача    | Что добавит                                       |
|-----------|---------------------------------------------------|
| `P0-B-02` | Карта Mapbox с user location (location puck)      |
| `P0-B-03` | Запись точек GPS в zustand store                  |
| `P0-B-04` | Live полилиния через ShapeSource + LineLayer      |
| `P0-B-05` | Замыкание + площадь через @turf/area              |
| `P0-B-06` | Background location (TaskManager + foreground service) |
| `P0-B-07` | SQLite persistence + crash recovery               |
