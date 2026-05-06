# ADR-0001: Mobile framework — Expo React Native

**Дата:** 2026-05-06
**Статус:** Accepted
**Контекст:** Phase 0 / `P0-D-05`
**Решение:** Использовать Expo React Native + TypeScript для всех мобильных приложений проекта.

## Контекст

Phase 0 проекта Running Ecosystem — параллельная разработка прототипов на Expo React Native и Flutter с целью объективного выбора (см. [docs/DEVELOPMENT_PLAN.md](../DEVELOPMENT_PLAN.md) §2 и [docs/RUNNING_ECOSYSTEM_TZ.md](../RUNNING_ECOSYSTEM_TZ.md) §2).

Реализованы функционально идентичные прототипы (P0-B-01..07 / P0-C-01..07): bootstrap, карта Mapbox с user location, запись GPS-точек, live полилиния, замыкание + площадь, SQLite persistence, background tracking. Оба прототипа собирались в release APK, оба прошли smoke-runtime на физическом Android-планшете.

Полные T1–T10 полевые тесты с decision matrix не проведены (требует 3 устройств `P0-A-04`).

## Решение

**Expo React Native + TypeScript** для всех клиентов.

## Альтернативы

- **Flutter + Dart.** Прототип реализован в `apps/mobile_flutter/`, всё работает. Архивируется в `apps/mobile_flutter.archived/`.
- **Native Kotlin + Swift.** Не рассматривался: для команды из 2 разработчиков и cross-platform требований нерационально.
- **Bare React Native (без Expo).** Не рассматривался: Expo SDK 54 даёт config plugins, EAS Build, EAS Update — критичные для скорости разработки.

## Обоснование

### Что взвесили в плюс RN

1. **Скорость разработки.** В Phase 0 фичи реализовывались быстрее на RN из-за:
   - TS типизация (`tsc --noEmit` ловит ошибки до compile-time)
   - zustand — минимальный boilerplate vs Riverpod `Notifier + ConsumerStatefulWidget + copyWith` манифест
   - Hot reload через Metro — стабильнее чем Flutter hot reload в нашем опыте
2. **Shared types с бэкендом.** Backend проекта — Go (ТЗ §5). TS на клиенте позволяет шарить типы через `openapi-typescript` или `protobuf-ts`. Dart требует отдельного кодогенератора.
3. **EAS Build snimaет блокер «нет локального Xcode».** Текущая dev-машина имеет только CommandLineTools (без Xcode.app). EAS позволяет cloud-сборку iOS без локального Xcode.
4. **Опыт команды.** TypeScript известен обоим разработчикам, Dart требует переучивания.
5. **APK размер.** RN release 153MB vs Flutter debug 241MB (несправедливое сравнение, но release Flutter тоже не меньше).

### Что взвесили в минус RN

1. **`@rnmapbox/maps` — community-пакет.** Не от Mapbox. Релизы могут отставать от native Mapbox SDK (на момент Phase 0 — версия `^10.3` поддерживает Mapbox Native SDK v11.x, синк в норме).
   **Митигация:** `MapAdapter` абстракция (ТЗ §10.6, ADR-0002). При проблемах — миграция на MapLibre RN или native bridge.
2. **Большие полилинии (5000+ точек).** Performance в RN традиционно хуже Flutter.
   **Митигация:** `LineLayer + GeoJsonSource` (FR-022), упрощение Дугласа-Пёкера на копии для рендера, native module для критичных секций при необходимости.
3. **iOS background reliability.** RN зависит от `expo-location` + `expo-task-manager`, в kill state потенциально менее предсказуемо чем Flutter platform channels.
   **Митигация:** runtime тесты T5 / T6 / T8 в Phase 1 (`P1-M-02`).

## Последствия

### Положительные

- Команда фокусируется на одной кодовой базе.
- TS даёт consistent dev-experience с будущим backend.
- Готовая инфраструктура (`apps/mobile-rn/` со всеми Phase 0 наработками) переиспользуется без переписывания.

### Отрицательные / риски

- Vendor lock-in на Expo / @rnmapbox/maps. **Митигация:** `MapAdapter` абстракция, `LocationAdapter` интерфейс — с дня 1.
- Если в Phase 1 background reliability < NFR-005 (≥30 мин в фоне на 3 устройствах) — придётся писать native module или мигрировать на bare RN. **Митигация:** ранние тесты T8 (`P1-M-02`).

### Что меняется в коде

- `apps/mobile_flutter/` → `apps/mobile_flutter.archived/`. Удаления нет — может пригодиться для reference.
- `apps/mobile-rn/` остаётся основным проектом, постепенно эволюционирует через Phase 1.
- Phase 1 P1-A-01 ("Чистый bootstrap") интерпретируется прагматично: не пересоздаём проект с нуля, но рефакторим существующий код к target архитектуре (MapAdapter, полная доменная модель, Kalman pipeline).

## Сценарии пересмотра

Решение возвращается к рассмотрению если:
- Background reliability в Phase 1 (`P1-M-02`) < 80% на ≥2 из 3 устройств → миграция на bare RN с native modules или возврат к Flutter из архива.
- @rnmapbox/maps теряет maintenance / отстаёт от Mapbox SDK > 2 минорных версии → переход на MapLibre RN.
- Mapbox costs на 100k+ MAU становятся критичными — это повлияет не на framework, а на map provider (см. ADR-0002).

## Ссылки

- [DECISION.md](../../DECISION.md) — короткое summary решения
- [docs/RUNNING_ECOSYSTEM_TZ.md](../RUNNING_ECOSYSTEM_TZ.md) §2.6, §10.6
- [docs/DEVELOPMENT_PLAN.md](../DEVELOPMENT_PLAN.md) §2.4
- Git tag: `phase-0-decision` (создаётся в момент финального коммита Phase 0)
