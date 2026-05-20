# Mobile Telemetry — Opt-in Event Allowlist (Phase 17 consumes)

> **Status:** SKELETON (Phase 5 / Plan 05-06 Task 5). Phase 17 (CRASH-01..06) populates the allowlist table below + ships mobile-side `apps/mobile-rn/src/observability/sentry.ts` PII-strip middleware mirroring backend D-12 deny-list.

Phase 5 ships the backend Sentry seam (`pkg/observability/{otel_init,sentry_init}.go` + `DebugSessionMiddleware` + Alloy log shipping). Mobile-side opt-in telemetry events, Settings consent UI, and PII-strip middleware are **Phase 17 territory**. Этот файл — контракт что Phase 17 implements + reference для backend engineers who add new events that require mobile-side consent.

## Allowlist Table

> Phase 17 fills this table. Each row = one event_name + description + PII risk classification + whether explicit consent (RU banner) is required before emission.

| event_name | description | PII risk | consent required |
|---|---|---|---|
| _TODO_ Phase 17 | _TODO_ | _TODO_ | _TODO_ |

### Allowlist conventions (when Phase 17 populates)

1. **`event_name`** — snake_case, ≤32 chars; namespaced by domain (`session_*`, `auth_*`, `nav_*`, ...).
2. **`description`** — one-sentence purpose statement; explains why the event exists and what action it informs.
3. **`PII risk`** — `none | low | medium | high`. `high` = event payload may contain D-12 deny-list attribute values (must be stripped before emission).
4. **`consent required`** — `yes | no`. `yes` events MUST NOT emit until user has explicitly opted in via Settings → "Send crash + diagnostic reports" toggle (RU consent banner shown on first activation).

## Backend → Mobile contract

When the backend emits a feature that requires mobile-side telemetry (e.g., a new Sentry tag that mobile should also emit, or a new D-12 deny-list entry that mobile must mirror), the engineer:

1. Adds the backend change with appropriate test coverage.
2. Updates this file's allowlist table (if a new event is required) OR updates `docs/RUNBOOKS/observability.md §3` (if a new PII deny-list entry).
3. References the change in the mobile-side Phase 17 plan when it executes.

Mobile side will NOT have access to a freeform "log anything" path — every emitted event MUST be in the allowlist below, and `high`-risk events MUST be gated by the user consent toggle.

## Reference

- [docs/RUNBOOKS/observability.md §3](RUNBOOKS/observability.md#3-pii-deny-list-reference-d-12) — backend D-12 PII deny-list (single source of truth; mobile reuses).
- [docs/RUNBOOKS/observability.md §5](RUNBOOKS/observability.md#5-x-debug-session-protocol-research-18-three-gate-model) — X-Debug-Session protocol (Phase 17 mobile UX inherits the three-gate model).
- [docs/DECISIONS/0009-observability-architecture.md §7](DECISIONS/0009-observability-architecture.md) — ADR-0009 §7 codifies the "backend seam only" v1.0 scope; Phase 17 inheritance list.
- Phase 17 plan-bundle: TBD (CRASH-01..06; populated during `/gsd-discuss-phase 17`).

---

*Skeleton authored: 2026-05-20 — Phase 5 / Plan 05-06 Task 5*
*Phase 17 will replace the TODO row with real event allowlist.*
*Owner: solo dev (Ismail)*
