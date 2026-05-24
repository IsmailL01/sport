# Phase 8: Closed-beta distribution — Discussion Log

**Discussion mode:** Autonomous (per standing memory `feedback_autonomous_discuss_mode` — no `AskUserQuestion` invocations). Decisions resolved by reading prior phase CONTEXTs, ADRs, deployed infrastructure, and existing code patterns. This log records WHY each decision was reached without asking, for audit/retrospective use.

**Date:** 2026-05-24
**Decider:** Claude (Opus 4.7), autonomous, with the user (Ismail) as eventual reviewer.
**Output:** `08-CONTEXT.md` (25 decisions D-01..D-25 + 4 Claude-discretion overrides documented).

---

## Why autonomous (not interactive)?

Memory entry `feedback_autonomous_discuss_mode` records: "Run /gsd-discuss-phase, /gsd-plan-phase, etc. autonomously (no AskUserQuestion) per standing no-questions instruction; mirrors Phase 2 + Phase 3 CONTEXT posture." Phase 6 (22 decisions) and Phase 7 (28 decisions) both captured this way. Phase 8 follows the same posture.

This is NOT a deviation from the `discuss-phase.md` workflow — the workflow explicitly supports `--auto` mode for non-interactive captures. The user's standing instruction acts as a permanent `--auto` flag.

---

## Prior context loaded (in order of weight)

1. **`.planning/STATE.md`** (frontmatter + Current Position + Recent Trend) — established that Plan 07-01 is closed, Plan 07-03 is device-blocked, .aab is in hand, and the day's session is at a natural transition point.
2. **`.planning/REQUIREMENTS.md`** (DIST-01 + dropped iOS DIST-02 per Amendment 3) — established the requirement scope.
3. **`.planning/ROADMAP.md`** Phase 8 entry — provided the 4-criterion success gate (manifest, signed URLs, in-app check, force-update path).
4. **`.planning/phases/07-release-builds-mobile-stability/07-CONTEXT.md`** D-01..D-28 — established the EAS Cloud build pipeline + SOPS-via-CI credential pattern + arm64-v8a-only build that Phase 8 inherits.
5. **`.planning/phases/07-release-builds-mobile-stability/07-01-SUMMARY.md`** — established the empirical .aab artifact (commit `f09e729`, build `052a2e92`, artifact `CZseoc8Nac3ouY86QqPU3.aab`) that Phase 8's CI hook consumes.
6. **`.planning/phases/06-release-signing/06-CONTEXT.md`** D-14 + D-15 — established the SOPS recovery pattern + age-recipient convention that Phase 8's new manifest-signing keypair extends.
7. **`docs/DECISIONS/0011-scope-reset-to-closed-beta-lean.md` + 4 amendments** — established the lean-scope guardrails (Amendment 3: Android-only, deferring DIST-02; Amendment 4: lean-key-custody for the new Ed25519 keypair).
8. **`docs/DECISIONS/0007-v1.0-release-contract.md`** — established the REL-02 force-update mechanism that Phase 8 REUSES 1:1 (does not re-implement).
9. **`docs/DECISIONS/0012-keystore-password-leak-2026-05-22.md` + amendment** — established the credential-diagnostics discipline rules (no `xxd` on values, single canonical fingerprint form, `SOPS_AGE_KEY_FILE` required) that apply to the new Ed25519 keypair too.

---

## Gray areas identified

Phase-domain analysis (from §"Phase Boundary" in CONTEXT.md) produced these gray areas:

### 1. Storage backend for APK + manifest

- **ROADMAP says:** Hetzner Storage Box (success criterion 2)
- **Reality:** Phase 3 pivoted to provider-agnostic VPS 2026-05-17; Hetzner Cloud account doesn't exist; MinIO is already deployed via Phase 3 INFRA-01 and Caddy reverse-proxies it at `s3.148-253-214-156.sslip.io`.
- **Options weighed:**
  - (A) MinIO (existing infrastructure)
  - (B) Hetzner Storage Box (would require new vendor + creds + code path)
  - (C) Caddy file_server from VPS disk (would require SSH from CI to write APK + manifest)
- **Chosen:** (A) MinIO. Already deployed. Already Caddy-proxied. Already has presigned URL pattern in `services/backend/media/internal/s3/client.go`. Zero new vendors. Project principle "no vendor lock-in" (ADR-0006 §Сценарии пересмотра + Phase 4 save/scp/load preference).
- **Recorded as D-01.** ROADMAP/REQUIREMENTS Hetzner mentions to be rewritten as a Plan 08-01 closeout chore (D-22 deferred / "ROADMAP-MINIO-RENAME" — actually not deferred; handled in this phase per the must-haves list).

### 2. Manifest signing algorithm

- **ROADMAP says:** Ed25519-signed (success criterion 1)
- **Options weighed:**
  - (A) Ed25519 (32-byte sig, deterministic, native in Go + good JS lib `@noble/ed25519`)
  - (B) RSA-2048 (heavier, slower verification, 256-byte sig)
  - (C) HMAC-SHA256 (symmetric — would require shipping shared secret to mobile, no asymmetric integrity)
- **Chosen:** (A) Ed25519. Matches ROADMAP. Matches the X25519+Ed25519 primitive family already used by SOPS+age. Pure-JS verification possible on mobile.
- **Recorded as D-04.**

### 3. Public key distribution mechanism

- **Options weighed:**
  - (A) Hard-coded constant in mobile app source (rotate = ship new app version)
  - (B) Loaded from `app.json` extra at runtime
  - (C) Fetched from a backend endpoint on first launch (risk: tampering during cold-start)
- **Chosen:** (A) Hard-coded. Same trust model as the keystore itself (compromised dev workstation = key compromise; ship-new-version is the recovery path either way). Tampering at runtime is impossible because the pubkey is in the APK binary, which is signed by our keystore. Recovery from compromise = rotate keystore (ADR-0012 procedure) + rotate manifest-signing keypair + ship new APK with both rotated. Same trust boundary; same recovery path.
- **Recorded as D-09.**

### 4. Manifest endpoint serving

- **Options weighed:**
  - (A) Static file in MinIO public-read bucket (single storage backend)
  - (B) Caddy file_server from VPS disk (requires CI SSH write)
  - (C) Go service generates manifest dynamically (overkill; adds backend code path)
- **Chosen:** (A) Static file in MinIO. Same storage backend as APK. CI uploads via `mc` (MinIO client). No new Caddy config. No SSH-deploy step.
- **Recorded as D-03 + D-14.**

### 5. Update UX (banner vs forced vs auto-install)

- **Options weighed:**
  - (A) Non-blocking banner (user taps "Update", Android system installer handles install)
  - (B) Forced update on every new version (annoying; user loses control)
  - (C) Auto-install without user tap (requires `REQUEST_INSTALL_PACKAGES` permission, scary UX, blocked by Play Protect)
- **Chosen:** (A) for optional updates, (REUSE REL-02) for force-update when min_supported_version > installed. Two-tier UX matches what ROADMAP success criteria 3+4 specify.
- **Recorded as D-11.**

### 6. Mobile state for update flow

- **Options weighed:**
  - (A) Reuse `useForceUpdateStore` for everything
  - (B) Two new stores (`useUpdateBannerStore` non-blocking + `useUpdateCheckStore` fetch state) + reuse `useForceUpdateStore` for force path
  - (C) Single new store with status enum
- **Chosen:** (B). Separates non-blocking UX state from force-update state. Reuses the REL-02 store untouched for the force path so REL-02's existing tests + apiClient HTTP 426 hook keep working without modification. Each new store has narrow responsibility.
- **Recorded as D-18.**

### 7. Plan 07-03 dependency

- **ROADMAP says:** Phase 8 depends on Phase 7.
- **Reality:** Plan 07-01 (BUILD-01) is closed; Plan 07-03 (STAB-01 — foreground service + Pixel pocket-walk) is device-blocked.
- **Question:** Does Phase 8 wait for Plan 07-03? Or is Plan 07-01 the actual gate?
- **Analysis:** Phase 8's success criteria all reference the build pipeline (Plan 07-01 output) and the existing REL-02 force-update infrastructure (Phase 1). They do NOT reference foreground service notification visibility or vendor-killer mitigations or the 1h pocket-walk. Plan 07-03's outputs are independent of Plan 08-01's plumbing.
- **Chosen:** Plan 07-01 is the load-bearing gate (already passed). Plan 07-03 is in-parallel; Phase 8 planning + execution does NOT block on it.
- **Recorded as D-17.**

### 8. Manifest replay protection

- **Options weighed:**
  - (A) No replay protection (trust signature + min_supported_version semantics)
  - (B) `released_at` timestamp + monotonicity check on mobile
  - (C) Manifest nonce + per-tester binding
- **Chosen:** (B). Mobile stores `installed_released_at` on first successful manifest verify; rejects manifests where new released_at < stored. Cheap; defends against MinIO bucket rollback or attacker re-serving an old (validly-signed) manifest.
- **Recorded as D-24.**

---

## Scope creep redirects

None encountered during autonomous capture — the phase scope from ROADMAP is concrete enough that no temptations to expand surfaced. iOS arm (DIST-02) automatically excluded per Amendment 3.

The closest-to-scope-creep idea was "should manifest gate per-tester invites" — explicitly deferred to v1.0.1 `MANIFEST-INVITE-GATING` (deferred table in CONTEXT.md). For closed beta with 5-10 testers, public-readable manifest URL is acceptable; APK URL is signed.

---

## Claude-discretion swaps (documented in §<claude_discretion_swaps>)

Four swaps where Claude's reasoning overrides verbatim ROADMAP wording:

1. **"Hetzner Storage Box" → MinIO** (D-01) — ROADMAP text is stale post-Phase-3-pivot.
2. **Manifest served from MinIO, not Caddy file_server** (D-03, D-14) — single backend; no SSH-deploy step.
3. **Direct `fetch()` for manifest, not through `apiClient`** (D-20) — different origin; manifest doesn't follow the JWT+version-negotiation contract.
4. **Public-read manifest bucket + signed-URL APK bucket** (D-02) — different security models (integrity vs content-bounded access).

Each is documented in CONTEXT.md `<claude_discretion_swaps>` with rationale + (where applicable) backlog tracking.

---

## Areas NOT discussed (out of scope per <scope_guardrail>)

- **Tester onboarding + invite flow** — Phase 9 LAUNCH-01..02 scope, not Phase 8.
- **Crash reporting from installed app** — dropped per ADR-0011 CRASH-* (no mobile Sentry in v1.0).
- **CDN / multi-region** — out of v1.0 per PROJECT.md constraints table.
- **iOS TestFlight pipeline** — DEFERRED per ADR-0011 Amendment 3.
- **In-app purchase / monetization** — PREMIUM-* deferred to v1.4 per REQUIREMENTS.md.
- **A/B testing on update prompts** — out of scope; v1.0.1 if needed.

---

## Discussion outcome

**Decisions captured:** 25 (D-01..D-25). All locked enough that gsd-planner can author Plan 08-01 task breakdown without re-asking the user.

**Plans anticipated:** 1 plan (Plan 08-01, ~8 tasks, Wave 1, `autonomous: false` due to two USER ACTION tasks for MinIO credential provisioning + end-to-end pipeline verification on device).

**Deferred:** 4 v1.0.1 backlog items captured in `<deferred>` section of CONTEXT.md.

**ROADMAP/REQUIREMENTS rewrites tracked:** Hetzner-Storage-Box → MinIO rename is a Plan 08-01 closeout chore (in §<must_haves> item 7, not the deferred table).

**Next:** `/gsd-plan-phase 8` to spawn the planner. Plan execution can begin as soon as the plan is authored — Plan 07-01 is the actual gate and it's already passed.
