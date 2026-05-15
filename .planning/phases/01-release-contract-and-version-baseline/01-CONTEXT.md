# Phase 1: Release Contract & Version Baseline — Context

**Gathered:** 2026-05-15
**Status:** Ready for planning
**Milestone:** v1.0 Production Readiness
**Workstream:** `shared`
**Mode:** Autonomous (`--auto`-equivalent per persistent no-questions instruction)

<domain>
## Phase Boundary

**What this phase delivers:** Lock the mobile↔backend wire contract for v1.0, decide version-negotiation policy, define feature-flag matrix for staged rollout, and freeze the explicit list of v1.0 capabilities (everything else is OUT — deferred to v1.1+). This phase is the **shared foundation** that gates the backend track (Phase 2) and the mobile tracks (Phases 9, 10).

**Out of scope (other phases handle):**
- Implementing rate-limiting/auth-fix behavior → Phase 6
- Wiring secrets management → Phase 2
- Deploying CI/CD → Phase 4
- Bumping `@rnmapbox/maps` 10.x → 11.x → Phase 13
- Crash reporter PII-strip → Phase 17
- Strava OAuth client implementation → Phase 11 (Android) + Phase 12 (iOS) impl, Phase 21 validation

</domain>

<scout_findings>
## Existing Code Insights

### What exists (relevant to this phase)
- **`services/backend/api/identity.yaml`** (185 lines, OpenAPI 3.1.0, hand-written) — covers `/auth/register`, `/auth/login`, refresh-token flow. Per file comment: "Phase 2 / P2-A-02."
- **`services/backend/api/activity-sync.yaml`** (181 lines, OpenAPI 3.1.0, hand-written) — covers `POST /sessions`, points upload, idempotency-by-`clientSessionId`. Per file comment: "Phase 2 / P2-A-04."
- **`services/backend/gateway/`** — gateway service exists; natural place for version-check middleware (single enforcement point).
- **7 backend services** (identity, feed, social-graph, activity-sync, realtime-gw, messaging, notifications, media) + gateway. All use Go 1.22+ `mux.HandleFunc("METHOD /path", ...)` pattern.
- **`apps/mobile-rn/src/auth/apiClient.ts`** — central API client wrapper. Sets `Authorization: Bearer` + `Content-Type: application/json`. **Does NOT set any version header.** This is the seam to add `X-Client-Version`.
- **Mobile state stores** (`src/state/`) — Zustand pattern: `auth.ts`, `settings.ts`, `activity.ts`, `wallet.ts`, etc. New `featureflags.ts` follows this convention.

### What's missing (greenfield in this phase)
- OpenAPI specs for: feed, social-graph, messaging, realtime-gw, notifications, media, gateway (5 of 7 services)
- Any `X-Client-Version` / `X-API-Version` header handling — grep returned zero hits
- Any feature flag infrastructure — grep for `featureFlag|FEATURE_FLAG` returned zero hits
- A `v1.0-SCOPE.md` doc — not yet written

</scout_findings>

<decisions>
## Implementation Decisions (14 gray areas auto-resolved)

### API Contract Coverage (REL-01)

- **D-01: OpenAPI 3.1.0 hand-written YAML** as the source-of-truth format. Continues existing convention (`identity.yaml`, `activity-sync.yaml`). No code-gen toolchain (avoids `swaggo/swag` complexity at team-of-2 scale).
- **D-02: Coverage scope = mobile-facing endpoints only.** Document every endpoint the mobile app calls; internal service-to-service communication (NATS publish/subscribe, direct gRPC if any) stays undocumented for v1.0. **Why:** Mobile-facing IS the v1.0 closed-beta contract; internal service docs are v1.1.
- **D-03: One YAML per service**, mirroring the existing 2-file pattern. New files to write: `feed.yaml`, `social-graph.yaml`, `messaging.yaml`, `realtime-gw.yaml`, `notifications.yaml`, `media.yaml`, `gateway.yaml`. Realtime-gw documents the WebSocket upgrade endpoint + the message envelope schema referenced via JSON Schema $ref.
- **D-04: CI validation via `openapi-diff`** + a custom Go check that scans each service's `mux.HandleFunc` registrations and fails if a route isn't in the YAML (route-spec drift detection). The check lives in Phase 4 CI work but the validation script lands here.

### Version Negotiation (REL-02)

- **D-05: HTTP header transport** — `X-Client-Version: <semver> (<build-number>)` (e.g., `X-Client-Version: 1.0.0 (42)`). Server parses the semver portion; build number is informational for support tickets. **Why:** URL path versioning (`/v1/...`) fragments routes and forces big migrations later; query params get lost in logs; header is industry-standard for client capability.
- **D-06: Mobile reads version from `expo-application`** — `Application.nativeApplicationVersion` (semver) + `Application.nativeBuildVersion` (build number). Stamped into `X-Client-Version` header by `apiClient.ts` before every request.
- **D-07: Server compatibility model = backward-compatible only with explicit min-supported-version.** Server publishes `min_supported_version: "1.0.0"` per endpoint family (or globally for v1.0). Client too-old → `HTTP 426 Upgrade Required` with body `{ "error": "client_too_old", "min_version": "1.0.0", "force_update_url": "https://<domain>/android/manifest.json" }` (Android) or App Store URL (iOS).
- **D-08: Enforcement point = gateway middleware.** Gateway service checks `X-Client-Version` on all `/api/*` paths; individual services trust the gateway header. **Why:** Single enforcement point, no per-service duplication, easier to evolve compatibility policy.
- **D-09: Mobile response handling.** On `426`, `apiClient.ts` triggers a force-update screen (re-using Phase 18's `min-supported-version` UX). Same code path; just a different trigger.
- **D-10: Versioning policy = strict semver** with major bumps for breaking changes. `v1.0.0` covers the entire closed beta; minor bumps (`1.0.1`, `1.0.2`) for non-breaking fixes; `v1.1.0` will require a separate min-version negotiation. Documented in ADR-0007.

### Feature Flags (REL-03)

- **D-11: Backend `pkg/featureflags`** as shared Go library. Used by all 7 services. Single-table Postgres source-of-truth (`featureflags` migration) with columns: `flag_name TEXT PK`, `enabled_bool BOOLEAN`, `rollout_percent INT 0-100`, `updated_at TIMESTAMPTZ`. Read-through with 30-second in-memory cache per service. Admin UI extends existing `gateway/admin/index.html`.
- **D-12: Flag types for v1.0 = boolean + percentage rollout only.** No A/B variants, no per-user targeting, no LaunchDarkly-style segments. Rollout percentage hashed by `(user_id, flag_name)` via FNV-1a → deterministic per-user assignment. **Variants + targeting are v1.1.**
- **D-13: Mobile transport = dedicated `GET /featureflags` endpoint.** Cached client-side with 5-minute TTL. Mobile fetches on app launch + every 5min when foreground + on auth state change. Anonymous (pre-login) returns global flags; authenticated returns global + per-user-rolled flags.
- **D-14: Mobile-side mirror = `apps/mobile-rn/src/state/featureflags.ts` (Zustand store)** + `apps/mobile-rn/src/state/featureflagsApi.ts` (HTTP client). **Why:** Matches existing Zustand pattern (settings, auth, wallet, sensors, etc.); no new `modules/` structure since feature flags are a cross-cutting concern, not a feature domain.
- **D-15: Mobile offline-first behavior = baked-in defaults + server overrides.** Bundled `apps/mobile-rn/src/state/featureflags.defaults.ts` ships with every binary. Server fetch updates an MMKV-persisted cache. Offline-no-cache → defaults. Online-with-cache → server values with 5min TTL. **Why:** CLAUDE.md offline-first rule; predictable airplane-mode behavior.
- **D-16: Initial v1.0 flag set (committed in Phase 1):**
  - `strava_oauth_enabled` (default OFF; manually flipped ON when HEALTH-04 ships in Phase 11/12)
  - `mapbox_sdk_v11` (default OFF; flipped ON during Phase 13 migration soak)
  - `release_channel_force_update` (default OFF; emergency kill-switch for force-update UX)
  - `tester_debug_logging` (default OFF; opt-in per OBS-08)
  - `crash_telemetry_opt_in` (default OFF; opt-in per CRASH-04)

### IN/OUT Scope Freeze (REL-04)

- **D-17: `docs/v1.0-SCOPE.md` — markdown table format**, cross-referencing REQ-IDs from REQUIREMENTS.md. Three columns: `Capability | IN (REQ-ID + Phase) | OUT (deferred-to-version + reason)`. **Why:** Minimal new surface area; doesn't duplicate REQUIREMENTS.md content; one place a future contributor reads first to understand the v1.0 line.
- **D-18: IN capabilities** (from REQUIREMENTS.md §v1.0 Requirements):
  - Territory Core (pre-v1.0 baseline + Phase 16 release-build validation)
  - Activity Journal / Sessions list / SessionDetail (pre-v1.0 baseline)
  - Chats (pre-v1.0 baseline)
  - Profile + Stats incl. M10 tracking stats (pre-v1.0 baseline)
  - Wallet / coins (pre-v1.0 baseline, mobile-only — no monetization yet)
  - Strava read-only OAuth (HEALTH-04, Phase 11 + 12 impl + Phase 21 validation)
  - Closed-beta distribution: TestFlight (iOS) + self-hosted Android channel
- **D-19: OUT capabilities** (deferred to v1.1+ per REQUIREMENTS.md §Deferred from v1.0):
  - HealthKit / Health Connect bidirectional sync (v1.1)
  - Garmin / FIT-parser / Sensor Sync (v1.1)
  - Privacy zones + per-session visibility (v1.1)
  - Segments + leaderboards + zone-wars (v1.2)
  - Coaching & plans (v1.3)
  - Premium & marketplace (v1.4)
  - GDPR consent + export + RTBF (v1.5 — public-launch gate)
  - i18n EN scaffolding (v1.1 — do NOT pre-wire in v1.0 code)
  - Public TestFlight / Play Store submission (separate post-v1.0 milestone)

### ADR-0007 Breadth (REL-05)

- **D-20: One comprehensive ADR-0007** covering all three architectural decisions: (1) API contract format + OpenAPI 3.1.0 hand-written discipline, (2) Version negotiation via `X-Client-Version` header + 426 upgrade flow, (3) Feature flag design + offline-first defaults. **Why:** These are tightly coupled architectural decisions; splitting into 0007/0008/0009 creates ADR sprawl. Three sections in one ADR is the right granularity.
- **D-21: ADR-0007 also references the SCP-throughout deploy decision** as cross-cutting (per user note 2 confirmation). Detailed implementation in Phase 3 (Ansible) + Phase 18 (SCP-over-SSH with deploy key scoped to `/var/www/android-updates`). ADR-0007 establishes the principle; phase-specific phases document the mechanics.

### Phase 18 ROADMAP Correction (carried from user note 2)

- **D-22: Phase 18 (AND-DIST) hosting model is VPS-direct, not Hetzner Storage Box.** Current ROADMAP wording "APKs on Hetzner Storage Box behind signed URLs" was my draft assumption — user clarified APKs live on the VPS at `/var/www/android-updates`, served by Caddy directly, uploaded via SCP-over-SSH with a scoped deploy key. **Surgical ROADMAP edit deferred to discuss-phase 18**; flagged here so the planner doesn't take Phase 18 ROADMAP wording as the final answer.

### Claude's Discretion (smaller decisions; planner can refine)

- **OpenAPI spec linting:** `redocly lint` or `spectral lint` — planner picks; both work.
- **CI route-vs-spec drift check:** small Go binary in `services/backend/scripts/openapi-routes-check.go` that imports each service's router registration func and diffs against the YAML.
- **Admin UI for feature flags:** extends `gateway/admin/index.html` (static HTML + vanilla JS, matches Phase 8/L precedent). No new SPA framework.
- **Naming for feature flag table migration:** `0020_featureflags.up.sql` (continues numeric migration sequence; current latest is `0019_wallet_balance_check`).

### Folded Todos

None — `.planning/todos/` not initialized.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### v1.0 Milestone & Phase Specs
- `.planning/PROJECT.md` §Current Milestone v1.0 Production Readiness
- `.planning/REQUIREMENTS.md` §Phase 1 — Release Contract & Version Baseline (REL-01..05)
- `.planning/ROADMAP.md` §Phase 1
- `.planning/MILESTONES.md` v1.0 phase progress table

### Existing OpenAPI Seed (will be extended)
- `services/backend/api/identity.yaml` (OpenAPI 3.1.0, 185 lines) — pattern reference for new service specs
- `services/backend/api/activity-sync.yaml` (OpenAPI 3.1.0, 181 lines) — same

### Mobile API Client (will gain version header)
- `apps/mobile-rn/src/auth/apiClient.ts` — single integration point for `X-Client-Version` header injection
- `apps/mobile-rn/src/state/auth.ts` — existing Zustand store pattern to mirror for `featureflags.ts`
- `apps/mobile-rn/src/state/settings.ts` — same Zustand+MMKV persistence pattern

### Backend Architecture Anchors
- `services/backend/gateway/` — gateway service; new home for version-check middleware (single enforcement point per D-08)
- `services/backend/pkg/` — shared Go libs lives here; `pkg/featureflags/` lands here (alongside existing `pkg/ratelimit`, `pkg/permissions`, `pkg/audit`)
- `services/backend/migrations/` — new migration `0020_featureflags.up.sql` + `0020_featureflags.down.sql` (current latest is `0019`)
- `services/backend/gateway/admin/index.html` — admin UI extension point (Phase 8/L precedent: vanilla HTML+JS)

### CLAUDE.md Rules (apply globally; relevant subset)
- Offline-first → influences D-15 feature flag default behavior
- Multi-tenant from day 1 → feature flags rolled by `(user_id, flag_name)` not by IP / device
- Russian-language project docs convention (apply to `docs/v1.0-SCOPE.md` headings — body content can be EN where it's technical config)

### Pre-v1.0 Baseline Decisions (context for Phase 1)
- `docs/DECISIONS/0001-framework-react-native.md` (Expo RN locked — informs how mobile reads version)
- `.planning/phases/_archive/pre-v1.0-territory-refactors/01-CONTEXT.md` — Old Phase 1 decisions D-32..D-34 on Mapbox token rotation (folded into new Phase 2)
- `STATUS.md` Phase 8/L "ABAC + muted + audit + web admin" — establishes `gateway/admin/` static-HTML+vanilla-JS precedent that feature flag admin UI mirrors

### Future ADRs Scheduled (this phase writes 0007)
- `docs/DECISIONS/0007-v1.0-release-contract.md` — written in Phase 1 (this REQ-ID REL-05)
- `docs/DECISIONS/0006-mapbox-token-incident.md` — written in Phase 2
- `docs/DECISIONS/0008-mapbox-sdk-11-migration.md` — written in Phase 13

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`mux.HandleFunc("GET /healthz", ...)` pattern** (Go 1.22+) — every backend service already uses this; route registration is greppable, which makes the CI route-vs-spec drift check feasible.
- **`pkg/ratelimit`, `pkg/permissions`, `pkg/audit`** — shared Go library pattern; new `pkg/featureflags` follows.
- **`apps/mobile-rn/src/auth/apiClient.ts:110-117`** — single point where every request's headers are set; adding `X-Client-Version` is a 2-line change in the same `headers.set(...)` block.
- **`gateway/admin/index.html`** vanilla HTML+JS admin UI — feature flag toggle UI extends this (no new SPA framework).
- **MMKV persistence in `auth.ts` / `settings.ts`** — pattern for `featureflags.ts` server-cache persistence.

### Established Patterns
- **Hand-written OpenAPI 3.1.0 YAML in `services/backend/api/`** — 2 of 7 services covered; pattern is set; just needs extension to remaining 5.
- **`pkg/<concern>` shared Go libs** — new `pkg/featureflags` mirrors `pkg/ratelimit` shape (Go interface + Redis or Postgres backend + tests + admin UI).
- **Zustand+MMKV state stores in `src/state/`** — `featureflags.ts` follows.
- **Russian-language doc headers + English technical body** — `docs/v1.0-SCOPE.md` follows.

### Integration Points
- **Gateway service version middleware** is the single enforcement point for `X-Client-Version` (D-08).
- **`apiClient.ts`** is the single integration point for client-side version stamping + 426 handling (D-09).
- **`gateway/admin/index.html`** is the single integration point for feature flag admin UI (D-11).
- **`pkg/featureflags`** is the single integration point for backend services to check flags (`featureflags.IsEnabled(ctx, userID, "strava_oauth_enabled")` style API).

</code_context>

<specifics>
## Specific Ideas

- **Feature flag table schema** (sketched; planner refines):
  ```sql
  CREATE TABLE featureflags (
    flag_name TEXT PRIMARY KEY,
    enabled_bool BOOLEAN NOT NULL DEFAULT false,
    rollout_percent INTEGER NOT NULL DEFAULT 0 CHECK (rollout_percent BETWEEN 0 AND 100),
    description TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by_user_id BIGINT REFERENCES users(id)
  );
  ```
- **`X-Client-Version` header value parser** in gateway: accept formats `"1.0.0"`, `"1.0.0 (42)"`, `"1.0.0+build42"`. Reject malformed → log warning, allow request (graceful degradation); strict mode is a v1.1 hardening.
- **OpenAPI spec naming convention:** `services/backend/api/<service-name>.yaml`. New files: `feed.yaml`, `social-graph.yaml`, `messaging.yaml`, `realtime-gw.yaml`, `notifications.yaml`, `media.yaml`, `gateway.yaml`.
- **`docs/v1.0-SCOPE.md` heading style** (mirrors STATUS.md / DECISION.md):
  ```
  # Running Ecosystem — v1.0 Scope
  
  **Версия:** v1.0 Production Readiness
  **Парные документы:** `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`, ADR-0007
  
  ## IN scope (closed beta capabilities)
  | Capability | REQ-ID + Phase | Notes |
  ...
  ## OUT of scope (deferred to v1.1+)
  | Capability | Deferred to | Reason |
  ...
  ```

</specifics>

<deferred>
## Deferred Ideas

- **OpenAPI code-gen** (e.g., `oapi-codegen` for Go server stubs, `openapi-typescript` for mobile types) — v1.1+ if hand-written discipline frays.
- **LaunchDarkly / Statsig / OpenFeature** flag-management SaaS — v2.0+; v1.0 stays self-hosted in Postgres for simplicity and offline-debugging.
- **A/B variant feature flags + per-user targeting rules** — v1.1; v1.0 is boolean + percentage only.
- **gRPC contracts for internal service-to-service** — currently NATS pub/sub + HTTP between services; gRPC-based internal contracts is v1.1 if cross-service typing becomes a real pain.
- **OpenAPI for WebSocket frames** (realtime-gw) — JSON Schema $ref'd from `realtime-gw.yaml` covers the upgrade endpoint + message envelope, but full frame-by-frame schema is v1.1.
- **`X-Client-Version` strict mode** (reject malformed headers) — v1.1; v1.0 is graceful-degradation log-warning.
- **In-app "force update" force-flow** (block all UI until update) — partially covered here via 426 + `release_channel_force_update` flag; full UX polish lands in Phase 18.

</deferred>

---

*Phase: 01-Release-Contract-and-Version-Baseline*
*Context gathered: 2026-05-15*
*Auto-mode log: 14 gray areas resolved with reasonable defaults grounded in existing OpenAPI seed + Zustand patterns + Phase 8/L admin-UI precedent + CLAUDE.md offline-first rule. Single-pass — no re-read of own output.*
