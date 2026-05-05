# Running Ecosystem

Мобильное приложение и экосистема для полупрофессиональных бегунов: трекинг, тренировки, аналитика, интеграции с часами, тренер↔атлет, социальное.

**Команда:** 2 разработчика
**Текущая фаза:** см. [STATUS.md](STATUS.md) (сейчас Phase 0 — выбор фреймворка)

## Документация

- [docs/RUNNING_ECOSYSTEM_TZ.md](docs/RUNNING_ECOSYSTEM_TZ.md) — полное техническое задание (требования, архитектура, доменная модель, картостек)
- [docs/DEVELOPMENT_PLAN.md](docs/DEVELOPMENT_PLAN.md) — план разработки с задачами по фазам (с уникальными ID вида `P0-B-03`)
- [docs/SECRETS.md](docs/SECRETS.md) — описание секретов проекта (метаданные; реальные значения не хранятся в git)
- [docs/DECISIONS/](docs/DECISIONS/) — Architecture Decision Records (ADR) для значимых решений
- [STATUS.md](STATUS.md) — живой статус: фаза, открытые задачи, история
- [CLAUDE.md](CLAUDE.md) — постоянный контекст для AI-ассистента (Claude Code)
- [tests/FIELD_PROTOCOL.md](tests/FIELD_PROTOCOL.md) — протокол полевого тестирования (T1–T10)

## Структура монорепо

```
.
├── apps/
│   ├── mobile-rn/        # Expo React Native прототип (Phase 0) → может стать основным после выбора
│   └── mobile-flutter/   # Flutter прототип (Phase 0) → может стать основным после выбора
├── services/
│   └── backend/          # Бэкенд (заполняется Phase 2+)
├── docs/
├── tests/
├── CLAUDE.md
├── STATUS.md
├── README.md             # этот файл
├── CODEOWNERS
├── .editorconfig
└── .gitignore
```

## Быстрый старт

> ⚠️ Phase 0: оба прототипа в активной разработке. Какой из них выживет — решит [docs/DEVELOPMENT_PLAN.md](docs/DEVELOPMENT_PLAN.md) §2.6 (Decision Matrix) и зафиксирует `DECISION.md` в корне.

### Expo React Native (`apps/mobile-rn`)

```bash
cd apps/mobile-rn
npm install
npx expo run:ios       # или run:android
```

Подробности bootstrap — задача `P0-B-01` в [docs/DEVELOPMENT_PLAN.md](docs/DEVELOPMENT_PLAN.md).

### Flutter (`apps/mobile_flutter`)

```bash
cd apps/mobile_flutter
flutter pub get
flutter run
```

Подробности bootstrap — задача `P0-C-01` в [docs/DEVELOPMENT_PLAN.md](docs/DEVELOPMENT_PLAN.md).

### Backend

Phase 0–1: не запускается (бэкенда ещё нет). Появится в Phase 2 (`P2-A-*` в плане).

## Секреты и токены

Mapbox-токены, OAuth-credentials и прочие секреты — **не в git**. См. [docs/SECRETS.md](docs/SECRETS.md) для метаданных и инструкции, как получить значения у владельца проекта.

Локальные значения — в `.env` каждого разработчика (не коммитится).

## Стек

- **Мобильное:** Expo RN или Flutter (определится в конце Phase 0)
- **Карта:** Mapbox (см. ТЗ §10)
- **Бэкенд:** Go (основной), C++/Rust (горячие пути), Python (модели)
- **БД:** PostgreSQL + TimescaleDB + ClickHouse + Redis
- **Брокер:** NATS JetStream
- **Деплой:** Kubernetes + Helm + ArgoCD

## Принципы кода

См. [CLAUDE.md](CLAUDE.md) и ТЗ §3. Кратко:

- **Domain-driven** — доменная модель чистая, без зависимостей от UI и БД
- **Sensor-agnostic** — GPS один из источников, через `LocationAdapter`
- **MapAdapter** — никакого Mapbox SDK напрямую вне `src/map/adapters/`
- **Offline-first** — клиент работает без сети
- **Multi-tenant** — `user_id` в схеме с дня 1
- **Только `LineLayer + GeoJsonSource`** для треков (никаких `PolylineAnnotation`)
- **Площадь** — только через локальную проекцию + shoelace, никогда напрямую по lat/lon

## Лицензия

_TBD — определяется ближе к публичному релизу._
