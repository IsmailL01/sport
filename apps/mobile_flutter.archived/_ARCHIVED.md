# Архив: Flutter прототип

Этот проект — рабочий прототип Phase 0 на Flutter, см. ветку история git до 2026-05-06.

После [DECISION.md](../../DECISION.md) команда выбрала React Native ([apps/mobile-rn/](../mobile-rn/)) как основной фреймворк. Этот код переименован в `mobile_flutter.archived` и **не развивается** в Phase 1+.

## Что было реализовано (для reference)

- Bootstrap Flutter + Mapbox + geolocator + sqflite + riverpod
- iOS Info.plist + AndroidManifest с permissions для фонового tracking
- src-структура: `lib/src/{domain, location, state, storage, util, ui}/`
- Карта Mapbox Outdoors v12 + LocationPuck + camera
- Запись GPS-точек через `Geolocator.getPositionStream` с AndroidSettings/AppleSettings (background)
- Live полилиния через `GeoJsonSource + LineLayer`, обновление через `setStyleSourceProperty`
- Замыкание + площадь (haversine + локальная проекция + shoelace, ТЗ §6.6)
- SQLite persistence (`sqflite + path_provider`), batch flush 10 точек, recoverLast
- Background tracking через `flutter_background_service` + foreground notification

## Когда это может пригодиться

1. **Reference при подключении BLE / HealthConnect** — если RN-пакет окажется хуже, можно посмотреть как Flutter community решает.
2. **Native модули** — Kotlin/Swift код в `android/app/src/main/kotlin/...` и `ios/Runner/AppDelegate.swift` можно переиспользовать в RN bridges.
3. **Sanity check** — доменная модель идентична `apps/mobile-rn/src/domain/`. Если в Phase 1 поменяли `RawPoint` или формулу площади — можно сравнить с архивом и убедиться что не сломали инвариант.
4. **Fallback на крайний случай** — если в Phase 1 RN background reliability окажется < NFR-005, можно вернуться к этому коду как точке отскока (см. сценарии пересмотра в [DECISION.md](../../DECISION.md)).

## Что НЕ делать с этим архивом

- Не править. Изменения в основной кодовой базе RN не должны синхронизироваться сюда.
- Не запускать в production / не собирать APK для пользователей. Если нужен Flutter-билд для теста — собрать локально, но **не публиковать**.
- Не подключать к CI. Ниже зафиксировано чтобы CI игнорировал эту папку.

## Дата архивации

2026-05-06 (см. [DECISION.md](../../DECISION.md))
