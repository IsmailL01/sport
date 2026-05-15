# Running Ecosystem — API контракт v1.0

**Версия:** v1.0 Production Readiness
**Дата заморозки:** 2026-05-15
**Парные документы:** [docs/v1.0-SCOPE.md](./v1.0-SCOPE.md), [ADR-0007](./DECISIONS/0007-v1.0-release-contract.md), [.planning/REQUIREMENTS.md](../.planning/REQUIREMENTS.md) §Phase 1 (REL-01..05)

Этот документ — индекс per-service OpenAPI 3.1.0 YAMLs, описывающих весь
mobile-facing surface backend для v1.0 closed-beta. Источник правды — сами YAMLs;
этот файл лишь summary + runbook для редактирования.

## Сервисы и спеки

| Service       | YAML                                                            | Local port | Mobile callers                                                                  |
| ------------- | --------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------- |
| identity      | [services/backend/api/identity.yaml](../services/backend/api/identity.yaml)             | :8081      | apps/mobile-rn/src/auth/*                                                       |
| activity-sync | [services/backend/api/activity-sync.yaml](../services/backend/api/activity-sync.yaml)   | :8082      | apps/mobile-rn/src/modules/sessions/*, src/state/activity.ts                    |
| messaging     | [services/backend/api/messaging.yaml](../services/backend/api/messaging.yaml)           | :8083      | apps/mobile-rn/src/modules/messaging/*                                          |
| social-graph  | [services/backend/api/social-graph.yaml](../services/backend/api/social-graph.yaml)     | :8084      | apps/mobile-rn/src/modules/social/*, src/state/profile.ts                       |
| feed          | [services/backend/api/feed.yaml](../services/backend/api/feed.yaml)                     | :8085      | apps/mobile-rn/src/modules/feed/*, src/modules/stories/*                        |
| media         | [services/backend/api/media.yaml](../services/backend/api/media.yaml)                   | :8086      | apps/mobile-rn/src/modules/media/*                                              |
| notifications | [services/backend/api/notifications.yaml](../services/backend/api/notifications.yaml)   | :8087      | apps/mobile-rn/src/modules/notifications/*                                      |
| realtime-gw   | [services/backend/api/realtime-gw.yaml](../services/backend/api/realtime-gw.yaml)       | :8090      | apps/mobile-rn/src/modules/realtime/* (WebSocket)                               |
| **gateway**   | [services/backend/api/gateway.yaml](../services/backend/api/gateway.yaml)               | :80/443    | Caddy edge — документация path-routing поверхности (не Go-сервис).              |

Shared OAS components:

- [services/backend/api/\_shared/schemas.yaml](../services/backend/api/_shared/schemas.yaml) — `Error`, `User`, `Cursor`, `Pagination`
- [services/backend/api/\_shared/parameters.yaml](../services/backend/api/_shared/parameters.yaml) — `cursor`, `limit`, `sessionId`, `userId`, `flagName`
- [services/backend/api/\_shared/responses.yaml](../services/backend/api/_shared/responses.yaml) — `Unauthorized`, `Forbidden`, `NotFound`, `UpgradeRequired` (426 с `min_version` + force-update URLs), `RateLimited`

## Принципы

1. **OpenAPI 3.1.0 hand-written YAML.** Никаких codegen toolchain'ов в v1.0; решение по `oapi-codegen` — v1.1 (см. [ADR-0007 §1](./DECISIONS/0007-v1.0-release-contract.md)).
2. **One YAML per service.** Каждый mobile-facing endpoint описывается в YAML своего сервиса. Cross-service агрегация — только через `gateway.yaml` как narrative + `externalDocs` ссылки на per-service YAMLs.
3. **Shared via `$ref`.** Любой 401/426/429 ответ, любая `Error` schema, любой стандартный path-параметр — через `$ref: './_shared/...'`. Не дублируем.
4. **Mobile-facing only.** Internal NATS / gRPC / cron jobs — не документируем в v1.0. Это v1.1 (см. CONTEXT D-02).
5. **Idempotency notes inline.** Любой `POST` с upsert-семантикой получает inline-описание (`POST /conversations` upsert по (initiator, peer), `POST /sessions` upsert по `clientSessionId`, и т.п.).
6. **`X-Client-Version` not documented per-endpoint.** Заголовок применяется глобально к каждому request'у; per-service `pkg/clientversion.Middleware` (Plan 02) — единственная точка enforcement (см. [ADR-0007 §2](./DECISIONS/0007-v1.0-release-contract.md)). 426 response shape — в `_shared/responses.yaml`.

## Runbook: как обновлять контракт

При добавлении / изменении endpoint'а:

1. **Сначала** редактируем соответствующий `services/backend/api/<service>.yaml`.
2. Запускаем lint:
   ```bash
   cd services/backend/api && npx --yes @redocly/cli@^1 lint --config redocly.yaml
   ```
   Должно быть `0 errors` (warnings ok).
3. Реализуем `mux.HandleFunc("METHOD /path", ...)` в `services/backend/<service>/internal/handler/`.
4. Запускаем drift-check:
   ```bash
   cd services/backend && make check-routes
   ```
   Tool парсит каждый handler.go через `go/ast` и сравнивает с YAML; exit 0 = aligned.
5. Коммитим (per-task; см. CLAUDE.md §"Когда закрываешь задачу").

Если drift невозможно устранить в одном коммите (например handler добавлен раньше YAML временно) — закрываем drift до merge в основную ветку.

## Known follow-ups (v1.0.x cleanup)

| Item                                                                | Status     | Notes                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Backport `_shared/` $ref в `identity.yaml` и `activity-sync.yaml`   | v1.0.x     | Сейчас эти 2 спеки содержат inline `Error` schema и legacy `nullable: true` (OpenAPI 3.0 синтаксис). Будем мигрировать на 3.1.0 `type: [..., 'null']` и `_shared/` через отдельный cleanup-коммит. Per Plan 01-01 Step 4: вне scope этого плана. |
| Включить `operation-4xx-response: error` в `redocly.yaml`           | v1.1       | Сейчас off — мы только что extend-нули с 2 до 8 спеков и не успели полностью описать 4xx во всех операциях. Цель v1.1: 100% coverage.                                                                                                            |
| WebSocket envelope full per-type schemas (realtime-gw)              | v1.1       | `realtime-gw.yaml` сейчас документирует только `Envelope` верхнего уровня (type + data). Полные JSON Schema по типам (`message.new`, `reaction.added`, `notification.fanout`) — defer.                                                          |
| Internal NATS / gRPC contracts                                      | v1.1+      | Не документируем для v1.0 closed-beta. Решение пересмотрим если cross-service typing станет реальной проблемой (см. [ADR-0007 §Сценарии пересмотра](./DECISIONS/0007-v1.0-release-contract.md)).                                                |
| Codegen (`oapi-codegen` / `openapi-typescript`)                     | v1.1+      | Hand-written дисциплина проходит для team-of-2; revisit if drift bites.                                                                                                                                                                          |

## Cross-references

- **ADR-0007** ([docs/DECISIONS/0007-v1.0-release-contract.md](./DECISIONS/0007-v1.0-release-contract.md)) — формат контракта, version negotiation, feature flags, SCP cross-cut.
- **v1.0-SCOPE.md** ([docs/v1.0-SCOPE.md](./v1.0-SCOPE.md)) — IN/OUT capability table.
- **REQUIREMENTS.md** ([.planning/REQUIREMENTS.md](../.planning/REQUIREMENTS.md)) — REL-01..05 + 96 REQ-IDs total.
- **STATUS.md** ([STATUS.md](../STATUS.md)) — текущий статус Phase 1.
- **CLAUDE.md** ([CLAUDE.md](../CLAUDE.md)) — Russian-language doc convention; offline-first; multi-tenant.

---

_Phase: 01 Release Contract & Version Baseline (Plan 01-01)._
_Frozen: 2026-05-15._
