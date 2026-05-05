# STATUS

Живой документ. Обновляется после каждой закрытой задачи.

## Текущая фаза

**Phase 0 — Foundation & Framework Selection**

Старт: 2026-05-06
Целевое окончание: _TBD_

## Задачи Phase 0

### Setup
- [x] `P0-A-01` Создание Mapbox-аккаунта и токенов
- [ ] `P0-A-02` Кастомный стиль карты
- [ ] `P0-A-03` GitHub репозитории
- [ ] `P0-A-04` Тестовые устройства

### Прототип RN
- [ ] `P0-B-01` Bootstrap RN-проекта
- [ ] `P0-B-02` Карта Mapbox с user location
- [ ] `P0-B-03` Запись точек GPS
- [ ] `P0-B-04` Live полилиния на карте
- [ ] `P0-B-05` Замыкание + площадь
- [ ] `P0-B-06` Background location
- [ ] `P0-B-07` SQLite persistence

### Прототип Flutter
- [ ] `P0-C-01` Bootstrap Flutter-проекта
- [ ] `P0-C-02` Карта Mapbox с user location
- [ ] `P0-C-03` Запись точек GPS
- [ ] `P0-C-04` Live полилиния
- [ ] `P0-C-05` Замыкание + площадь
- [ ] `P0-C-06` Background location
- [ ] `P0-C-07` SQLite persistence

### Полевые тесты
- [ ] `P0-D-01` Тестовый протокол на бумаге
- [ ] `P0-D-02` Прогон тестов на iPhone
- [ ] `P0-D-03` Прогон тестов на Pixel
- [ ] `P0-D-04` Прогон тестов на китайском Android
- [ ] `P0-D-05` Decision Matrix → DECISION.md

## История

### 2026-05-06

- ✅ `P0-A-01` Создание Mapbox-аккаунта и токенов
  - Mapbox account: личный, владелец `dragon2015516@gmail.com`, username `iassd`
  - Созданы 3 токена: `dev-public`, `prod-public`, `server-secret`
  - iOS Bundle ID: `com.runningecosystem.mobile` (Android SHA-256 — TODO до `P0-B-01`/`P0-C-01`)
  - Mapbox style для Phase 0: стандартный `mapbox://styles/mapbox/outdoors-v12` (`P0-A-02` отложен)
  - Smoke-test через Mapbox Styles API: все 3 токена → HTTP 200
  - Подробности и метаданные: [docs/SECRETS.md](docs/SECRETS.md)
  - ⚠️ **Известные TODO** (зафиксированы в SECRETS.md):
    - `server-secret` создан как public (`pk.…`) вместо secret (`sk.…`) — пересоздать перед началом Phase 2
    - Все 3 токена однажды передавались в чат с AI — ротировать перед публичным релизом / биллингом
    - Android SHA-256 restriction добавить после bootstrap RN/Flutter проектов

## Заметки

_Свободные заметки от разработчиков и от Claude — что неожиданно, что отложено, что требует внимания._
