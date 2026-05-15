# Phase 1: Release Contract & Version Baseline — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-15
**Phase:** 01-release-contract-and-version-baseline
**Milestone:** v1.0 Production Readiness
**Mode:** Autonomous (`--auto`-equivalent — persistent user instruction: "make the reasonable call and continue; they'll redirect if needed")
**Areas discussed:** 14 gray areas across 5 REQ-ID groups (REL-01..05)

---

## REL-01: API Contract Coverage

### Gray Area 1 — Spec format

| Option | Description | Selected |
|--------|-------------|----------|
| OpenAPI 3.1.0 hand-written YAML | Continues existing `identity.yaml` / `activity-sync.yaml` convention | ✓ |
| OpenAPI from code-gen (`swaggo/swag`) | Auto-generated from Go comments | |
| Protobuf with gRPC-gateway | Type-safe; bigger toolchain | |
| Hand-written Markdown reference | Cheapest; no machine-validation | |

**Rationale:** Pattern already set (2 of 7 services covered); team-of-2 doesn't justify code-gen toolchain.

### Gray Area 2 — Coverage scope

| Option | Description | Selected |
|--------|-------------|----------|
| Mobile-facing endpoints only | Document what mobile calls; internal service-to-service skipped | ✓ |
| Full v1.0 coverage (all 7 services internal+external) | Maximum docs; bigger scope | |
| Mobile + gateway only | Subset; misses some service-direct paths | |

**Rationale:** Closed-beta contract IS the mobile contract; internal s2s docs are v1.1.

### Gray Area 3 — File organization

| Option | Description | Selected |
|--------|-------------|----------|
| One YAML per service | Mirrors existing `identity.yaml` / `activity-sync.yaml` | ✓ |
| One monolithic `api/v1.0.yaml` | Single source; harder to evolve per service | |
| OpenAPI overlays + base | More complex authoring | |

### Gray Area 4 — Drift detection

| Option | Description | Selected |
|--------|-------------|----------|
| CI route-vs-spec check (Go) + `openapi-diff` | Custom check + standard tool | ✓ |
| `openapi-diff` only | No route-registration drift detection | |
| Manual review only | Won't scale past 5 services | |
| `oapi-codegen` round-trip | Couples to code-gen choice (rejected) | |

---

## REL-02: Version Negotiation

### Gray Area 5 — Transport

| Option | Description | Selected |
|--------|-------------|----------|
| HTTP header `X-Client-Version: <semver>` | Industry standard; doesn't fragment URLs | ✓ |
| URL path `/v1/sessions` | Forces big migrations later; awkward for partial breakage | |
| Query param `?v=1.0.0` | Gets lost in caching/logs | |
| Custom header per service | Inconsistent | |

### Gray Area 6 — Mobile client version source

| Option | Description | Selected |
|--------|-------------|----------|
| `expo-application.nativeApplicationVersion` + `nativeBuildVersion` | Auth source-of-truth on device | ✓ |
| Hardcoded in `package.json` → bundled | Bundle metadata; fragile | |
| EAS Update bundle metadata | Doesn't survive non-OTA updates | |

### Gray Area 7 — Compatibility model

| Option | Description | Selected |
|--------|-------------|----------|
| Backward-compatible only + min-supported-version + HTTP 426 | Server publishes min; too-old client gets 426 | ✓ |
| Strict (exact match) | Forces lockstep mobile↔backend; impractical | |
| Forward+backward | Complex; needs feature negotiation | |
| Semver-tolerant | Vague; hides intent | |

**Rationale:** Backward-compatible only is industry-standard for app-store distribution; 426 + force-update screen is clean UX.

### Gray Area 8 — Enforcement point

| Option | Description | Selected |
|--------|-------------|----------|
| Gateway middleware (single point) | All `/api/*` checked once at gateway; services trust | ✓ |
| Per-service middleware | Duplicated logic; harder to evolve | |
| Service-by-service handler-level | Inconsistent enforcement | |

### Gray Area 9 — Mobile response handling

| Option | Description | Selected |
|--------|-------------|----------|
| 426 triggers force-update screen via shared code path with Phase 18 | Reuse min-version UX from Android distribution | ✓ |
| 426 triggers in-app modal only | Less aggressive but bypassable | |
| 426 silently downgrades to compatible endpoints | Hides the problem | |

### Gray Area 10 — Versioning policy

| Option | Description | Selected |
|--------|-------------|----------|
| Strict semver with major bumps for breaking changes | v1.0.x for closed beta; v1.1.0 forces re-negotiation | ✓ |
| CalVer (date-based) | No semantic info | |
| Custom scheme | Reinvents semver | |

---

## REL-03: Feature Flags

### Gray Area 11 — Backend library structure

| Option | Description | Selected |
|--------|-------------|----------|
| `pkg/featureflags` Go shared lib (mirrors `pkg/ratelimit` shape) | Used by all 7 services; Postgres source + 30s in-memory cache | ✓ |
| Per-service flag eval | No shared lib; inconsistent | |
| Sidecar service | Network hop per check; overkill for v1.0 | |
| SaaS (LaunchDarkly) | Privacy concern; cost | |

### Gray Area 12 — Flag types

| Option | Description | Selected |
|--------|-------------|----------|
| Boolean + percentage rollout (FNV-1a hash by `(user_id, flag)`) | Minimum useful surface | ✓ |
| + A/B variants | v1.1+ — not blocking v1.0 closed beta | |
| + per-user targeting | v1.1+ | |
| + segment rules | v2.0+ | |

### Gray Area 13 — Mobile transport

| Option | Description | Selected |
|--------|-------------|----------|
| Dedicated `GET /featureflags` with 5min TTL cache | Separates concerns; cacheable; supports anonymous | ✓ |
| Embedded in `/auth/me` response | Couples to auth; misses anonymous pre-login state | |
| Server-sent events / WebSocket | Overkill for 5min-staleness tolerance | |
| Polled per-request as headers | Bandwidth waste | |

### Gray Area 14 — Mobile module placement

| Option | Description | Selected |
|--------|-------------|----------|
| Top-level `src/state/featureflags.ts` Zustand + tiny `featureflagsApi.ts` | Matches existing Zustand pattern (auth/settings/wallet) | ✓ |
| `src/modules/featureflags/{domain,state,sync,ui}/` | Overkill — feature flags aren't a feature domain | |
| Embedded in `settingsStore` | Conflates user preferences with server-side rollout state | |

### Gray Area 15 — Offline-first default behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Bundled defaults + server overrides cached (MMKV) | Offline-no-cache uses defaults; online uses cache | ✓ |
| Always-default-off when offline | Predictable but breaks features in airplane mode | |
| Server-only (no offline support) | Violates CLAUDE.md offline-first rule | |

### Gray Area 16 — Initial v1.0 flag set

Auto-selected (no alternatives — these are the load-bearing rollout switches for the v1.0 milestone):

| Flag | Default | Flipped ON when |
|------|---------|-----------------|
| `strava_oauth_enabled` | OFF | HEALTH-04 ships in Phase 11/12 |
| `mapbox_sdk_v11` | OFF | Phase 13 migration validated |
| `release_channel_force_update` | OFF | Emergency kill-switch for force-update UX |
| `tester_debug_logging` | OFF | OBS-08 opt-in toggle |
| `crash_telemetry_opt_in` | OFF | CRASH-04 opt-in toggle |

---

## REL-04: IN/OUT Scope Freeze

### Gray Area 17 — Doc format

| Option | Description | Selected |
|--------|-------------|----------|
| Markdown table in `docs/v1.0-SCOPE.md` cross-referencing REQ-IDs | Minimal new surface; no duplication of REQUIREMENTS.md | ✓ |
| Formal SPEC.md (GSD `/gsd-spec-phase`) | Heavier; more process | |
| Section in REQUIREMENTS.md | Already there in §Deferred from v1.0; new doc gives clearer entry point | |

---

## REL-05: ADR-0007

### Gray Area 18 — ADR breadth

| Option | Description | Selected |
|--------|-------------|----------|
| One comprehensive ADR-0007 covering API contract + version negotiation + feature flags | Tightly coupled decisions; one ADR with three sections | ✓ |
| Three separate ADRs (0007 + 0008 + 0009) | ADR sprawl; harder cross-reference | |
| Inline decisions in CONTEXT.md only | Not durable enough; CONTEXT.md is per-phase scratch | |

### Gray Area 19 — SCP-throughout cross-cutting note

| Option | Description | Selected |
|--------|-------------|----------|
| ADR-0007 mentions SCP-throughout as cross-cutting principle; detailed impl in Phase 3 + 18 | Single place to document the principle | ✓ |
| Separate ADR for SCP transport | Premature — transport is implementation detail of Ansible + AND-DIST | |
| No formal record; carry in CONTEXT.md only | Risk of drift when Phase 3/18 plan | |

---

## Claude's Discretion (smaller decisions; planner can refine)

- OpenAPI spec linting tool (`redocly` vs `spectral`) — planner picks
- Naming for backend migration file (`0020_featureflags.up.sql`)
- Whether `realtime-gw.yaml` covers WebSocket frame schema in full or via JSON Schema $ref
- Admin UI styling (extends `gateway/admin/index.html` vanilla precedent — no SPA)

## Deferred Ideas (preserved for v1.1+)

- OpenAPI code-gen for Go server stubs + TypeScript client types
- LaunchDarkly / Statsig / OpenFeature SaaS migration
- A/B variants + per-user targeting + segments
- gRPC contracts for internal service-to-service
- Full WebSocket frame-by-frame OpenAPI schema
- Strict `X-Client-Version` parser mode (reject malformed)
- Full "force update" UX (partially covered here; polish in Phase 18)

## Phase 18 ROADMAP Wording Correction (carried from user note 2)

Phase 18 (AND-DIST) ROADMAP currently says "APKs on Hetzner Storage Box behind signed URLs" — that was Claude's draft assumption. User clarified: APKs live on the VPS at `/var/www/android-updates`, served by Caddy directly, uploaded via SCP-over-SSH with a deploy key scoped to that path. Surgical ROADMAP edit deferred to `/gsd-discuss-phase 18` to avoid mid-phase churn; flagged in CONTEXT.md §D-22 so the Phase 18 planner doesn't take ROADMAP wording as the final answer.

---

*Mode note: This session ran in autonomous mode per persistent user instruction. Alternatives tables above list what would have been presented via AskUserQuestion in interactive mode; the ✓ column shows the auto-selected option. The user can redirect any decision by editing CONTEXT.md directly — downstream agents read CONTEXT.md, not this log.*
