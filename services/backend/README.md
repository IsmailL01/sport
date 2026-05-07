# Running Ecosystem — Backend (Phase 2+)

Микросервисы Running Ecosystem. См. [docs/RUNNING_ECOSYSTEM_TZ.md](../../docs/RUNNING_ECOSYSTEM_TZ.md) §5.

**Phase 2 (минимальный backend):**
- [`identity/`](identity/) — регистрация, login, JWT, refresh tokens
- [`activity-sync/`](activity-sync/) — CRUD сессий и точек (придёт в P2-A-04)
- API Gateway — пока NGINX (производство — Phase 3)

**Phase 3+ (production):** все 16 сервисов из ТЗ §5.1, K8s, observability.

## Локальная разработка

Стек: Go 1.22 + Postgres 16 + TimescaleDB. Зависимости поднимаются через `docker compose`.

```bash
cd services/backend
docker compose up -d postgres            # поднять БД
make migrate                             # применить миграции
make run-identity                        # запустить identity service на :8081
make test                                # все unit-тесты
```

## Структура

```
backend/
├── go.work                  # Go workspace (объединяет все модули)
├── docker-compose.yml       # postgres + timescaledb
├── Makefile
├── api/                     # OpenAPI specs
├── migrations/              # SQL миграции (golang-migrate)
├── pkg/                     # Shared библиотеки (auth, dto, errors)
└── identity/                # Identity service (P2-A-02)
    ├── go.mod
    ├── cmd/server/          # entry point
    └── internal/            # бизнес-логика, repos, handlers
```

## Принципы

- **Domain-driven** (ТЗ §3.1): доменная модель не зависит от ORM/HTTP.
- **Очень тонкие handlers**: парсинг запроса → service → DTO в response.
- **Repository pattern**: `internal/repository/postgres/...` реализует интерфейс из `internal/repository`.
- **Без global state**: всё через DI в `cmd/server/main.go`.
- **Контекст везде**: `context.Context` первый аргумент во всех публичных методах.
- **Структурированное логирование**: `slog` с JSON handler.

## Phase 2 acceptance (см. plan §4.3)

- Регистрация → login на втором устройстве → видно историю
- Запись офлайн → онлайн → синхронизация прошла
- Удалить-переустановить app → войти → история восстановилась
