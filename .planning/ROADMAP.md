# Roadmap: Running Ecosystem — Milestone v1.0 Closed Beta

## Overview

This roadmap takes Running Ecosystem from "Phase 5 code-complete on `feat/cursona-redesign`" to **a closed-beta release in 4 lean phases**: signed iOS + Android release builds, distributable to 5-10 friend testers, with the backend deploy that already shipped (single VPS via Ansible, CI/CD with cosign best-effort, structured logs + Prometheus + Loki ready to enable if needed).

**Replaces:** the earlier 21-phase enterprise-hardening v1.0 scope, retired 2026-05-20 per [ADR-0011](../docs/DECISIONS/0011-scope-reset-to-closed-beta-lean.md). The dropped phases (rate-limiting hardening, pgBackRest restore drills, k6+chaos, mobile crash reporting, 8-device matrix, 48h staging soak, etc.) are right-sized for a funded team, not a solo dev shipping to 5-10 friends. Old phase planning artifacts: `.planning/phases/_archive/superseded-21-phase-v1.0/`.

**Workstream tags:** `shared` | `backend` | `mobile-shared` | `android` | `ios`

**Strict order:** Phase 6 → Phase 7 → Phase 8 → Phase 9. No parallelization.

## Phases

- [x] **Phase 1: Release contract & version baseline** — `shared` — OpenAPI 3.1 contract + `pkg/clientversion` version negotiation + `pkg/featureflags` (FNV-1a rollout) + v1.0 scope freeze + ADR-0007 — **DONE 2026-05-15** (REL-01..05)
- [x] **Phase 2: Secrets & config hardening** — `backend` — SOPS+age + gitleaks/trufflehog (0 findings full-history) + envRequire across 8 services + IDENTITY_DEV_MODE fix + Mapbox token incident reset (ADR-0006) — **DONE 2026-05-16** (SEC-01..09)
- [x] **Phase 3: Infrastructure as code** — `backend` — Ansible-only deploy on single prod VPS, sport-stack systemd umbrella + containerized Caddy + UFW; provider-agnostic RUNBOOK — **DONE 2026-05-17** (INFRA-01/03/05/07; -02/-04 deferred v1.1; -06 moved to Phase 5)
- [x] **Phase 4: CI/CD pipeline** — `backend` — GitHub Actions 8-service matrix + 5 scanners + Trivy + cosign keyless + SLSA L2 + rollback drill PASS on prod + branch protection with 8 required checks — **DONE 2026-05-18** (CICD-01..06). Cosign/SLSA kept wired as **best-effort, not gated** per ADR-0011.
- [x] **Phase 5: Observability backend** — `backend` — slog JSON + PII deny-list scrub (OBS-04 OTP fix) + Prom `/metrics` + 3 Grafana dashboards + cardinality CI gate + OTel OTLP/HTTP + sentry-go SDK (dormant per D-38) + observability-stack on `srv1561293` (Loki+Grafana+Prom) + DebugSessionMiddleware backend seam + Alloy log-shipper + `pii_live_probe.py` + ADR-0009 + observability RUNBOOK — **DONE 2026-05-20** (OBS-01/03/04/05/06/07 complete; OBS-02 deferred per ADR-0010; OBS-08 mobile Settings UX dropped per ADR-0011, replaced with `DEBUG_SESSIONS_FOR_USER` env-allowlist seam + `scripts/debug-tail.sh` Loki wrapper; Task 6 acceptance walkthrough deferred to Phase 9 smoke test)
- [x] **Phase 6: Release signing** — `shared` — Android keystore + SOPS-encrypted at `.secrets/prod/mobile-signing.yaml` + `docs/SECRETS.md` recovery section + SHA-256 evidence (SIGN-01) — **DONE 2026-05-20** (Plan 06-01 Tasks 0-4 shipped, commits 7f43069..27d4954). _Tasks 5-6 (cloud backup + RECOVERY-CARD) DEFERRED per ADR-0011 Amendment 4 to v1.0.1 `KEYSTORE-CLOUD-BACKUP` backlog. iOS Apple Developer certs (SIGN-02) DEFERRED per ADR-0011 Amendment 3 (Android-first launch); artifact `06-02-PLAN.md` stays on disk._
- [ ] **Phase 7: Release builds + mobile stability** — `mobile-shared` — EAS Android production profile + R8/ProGuard rules + Android foreground service + MIUI/One UI mitigations (BUILD-01 + STAB-01 Android). _BUILD-02 (EAS iOS) + iOS SLC portion of STAB-01 DEFERRED per ADR-0011 Amendment 3._ **Plan 07-01 mid-flight (Tasks 0-5 shipped 2026-05-21..22 — gradle/ABI/proguard/eas.json production + `.github/workflows/android-release.yml` tag-triggered + ::add-mask:: + explicit eas-cli install per ADR-0012 P0 incident response); Task 6 blocked on user-action `eas init` (literal `extra.eas.projectId: "TODO-eas-project-id-after-eas-init"` placeholder in `apps/mobile-rn/app.json`). Plan 07-03 not yet started — needs physical Pixel device for 1h pocket-walk acceptance.**
- [ ] **Phase 8: Closed-beta distribution** — `shared` — Android signed-JSON manifest served via Caddy + APKs on Hetzner Storage Box behind signed URLs (DIST-01). _DIST-02 (iOS TestFlight) DEFERRED per ADR-0011 Amendment 3._
- [ ] **Phase 9: Closed-beta launch** — `shared` — Android-only smoke test on own + 1 friend's device + invite 5-10 Android testers + 72h watchlist via `scripts/debug-tail.sh` (LAUNCH-01..02 Android-only). _iOS testers DEFERRED per ADR-0011 Amendment 3._

## Phase Details

### Phase 6: Release signing

**Workstream:** `shared`
**Goal:** Two signed-release secret bundles in hand, recoverable. Keystore loss = app dies for existing installs; this is the most critical secret.
**Depends on:** Phase 1-5 (all done)
**Requirements:** SIGN-01..02
**Success Criteria:**
1. Android release keystore generated offline (single workstation, deleted from disk after encryption)
2. Encrypted keystore committed to `.secrets/android-release.keystore.sops` with git history clean
3. **Two offline physical backups** in separate physical locations
4. Recovery playbook in `docs/SECRETS.md` §"Android Keystore Loss"
5. Apple Developer Program enrolled
6. Distribution certificate generated; private key encrypted in SOPS
7. Distribution provisioning profile for app bundle ID
8. App Store Connect API key (P8 file) in SOPS for unattended TestFlight uploads
9. EAS-managed credentials decision documented in `docs/SECRETS.md` §"iOS signing"

**Plans:**
- [ ] `06-01-PLAN.md` — Android keystore + 2 offline backups + recovery RUNBOOK — Wave 1, autonomous=false (Task 1 = offline keystore generation; Task 4 = physical-backup user action)
- [ ] `06-02-PLAN.md` — iOS Apple Dev certs + distribution provisioning + ASC API key in SOPS — Wave 2 (depends on 06-01), autonomous=false (Apple Developer enrollment is a USER ACTION)

### Phase 7: Release builds + mobile stability

**Workstream:** `mobile-shared` (Android-only for v1.0 per ADR-0011 Amendment 3)
**Goal:** Production Android build that survives a 1-hour GPS-track session without OS killing the recorder.
**Depends on:** Phase 6 (Plan 06-01 only — 06-02 deferred)
**Requirements:** BUILD-01 + STAB-01 (Android). _BUILD-02 (EAS iOS) DEFERRED per ADR-0011 Amendment 3._
**Success Criteria:**
1. `apps/mobile-rn/eas.json` has `production` profile (Android) pointing at production backend
2. R8 + ProGuard rules verified — do NOT strip Mapbox JNI, MMKV native, react-native-health JNI, expo-task-manager background classes, Hermes runtime
3. Android: `arm64-v8a` only (drop `armeabi-v7a` per ADR-0011 lean scope; closed-beta testers are flagship-only)
4. ~~iOS: Hermes enabled, bitcode disabled, staging↔prod flavor switching, iOS 16+ baseline~~ — **DEFERRED per ADR-0011 Amendment 3**
5. Background reliability: foreground service notification visible on Android. ~~iOS SLC fallback~~ — **DEFERRED per ADR-0011 Amendment 3**
6. Vendor-killer mitigations: MIUI + One UI handled (in-app auto-start permission dialog; battery-saver kill recovered via `recoverLast`); 4-vendor matrix from old Phase 16 deferred — monitor remaining vendors during beta
7. 1-hour pocket-walk session on Pixel records ≥95% of expected GPS points (~~+ iPhone~~ — iPhone arm DEFERRED per ADR-0011 Amendment 3)

**Plans:**
- [⏳] `07-01-PLAN.md` — EAS Android production profile + R8/ProGuard verification + arm64-v8a only — Wave 1, autonomous=true. **MID-FLIGHT 2026-05-23:** Tasks 0-5 shipped (commits 7f43069..fbc5186 series + ADR-0012 incident commits f35b4c6/fbc5186/c3659e7/21b992c/0a206a0). Task 6 (Stage A' R8 device smoke) blocked on user-action `eas init` (literal `extra.eas.projectId` placeholder in `apps/mobile-rn/app.json`; CI run 26258849328 validated workflow + security + masking but EAS Cloud build itself fails on `Invalid UUID appId`). Task 7 (07-01-SUMMARY) pending Task 6.
- [ ] ~~`07-02-PLAN.md`~~ — **DEFERRED per ADR-0011 Amendment 3 (Android-first).** EAS iOS production profile not planned in v1.0. Plan file does not exist yet; will be created when iOS work re-triggers.
- [ ] `07-03-PLAN.md` — Background reliability Android — foreground service + MIUI + One UI mitigations + 1h Pixel pocket-session validation — Wave 2 (depends on 07-01), autonomous=false (Task N = pocket-walk on real Pixel device, USER ACTION). _iOS SLC portion DEFERRED per ADR-0011 Amendment 3._ **NOT YET STARTED:** Wave 2 won't start until Plan 07-01 closes; also device-blocked (no physical Pixel currently available).

### Phase 8: Closed-beta distribution

**Workstream:** `shared` (Android-only for v1.0 per ADR-0011 Amendment 3)
**Goal:** One command tags a release → Android testers receive the new APK.
**Depends on:** Phase 7
**Requirements:** DIST-01 (Android). _DIST-02 (iOS TestFlight) DEFERRED per ADR-0011 Amendment 3._
**Success Criteria:**
1. Android: Caddy serves `/android/manifest.json` (Ed25519-signed) with latest version + APK signed-URL + min-supported-version
2. APKs uploaded to Hetzner Storage Box; served via 24h signed URLs (regenerated per request)
3. In-app check-on-launch + Settings "Check for updates" — both verify manifest signature before showing update UI
4. Force-update path — `min-supported-version > installed` blocks app usage until update
5. ~~iOS: `.github/workflows/ios-release.yml` triggers on `v1.0-*` tags; uploads to TestFlight via ASC API~~ — **DEFERRED per ADR-0011 Amendment 3**
6. ~~Build number auto-bumps on each CI run (CFBundleVersion += 1)~~ — **DEFERRED per ADR-0011 Amendment 3**
7. ~~Internal TestFlight group seeded with closed-beta testers' Apple IDs~~ — **DEFERRED per ADR-0011 Amendment 3**

**Plans:**
- [ ] `08-01-PLAN.md` — Android self-hosted manifest + Caddy serving + Hetzner Storage Box signed URLs + in-app update UX — Wave 1, autonomous=false (Task N = signed-URL secret rotation USER ACTION)
- [ ] ~~`08-02-PLAN.md`~~ — **DEFERRED per ADR-0011 Amendment 3 (Android-first).** iOS TestFlight CI workflow not planned in v1.0. Plan file does not exist yet; will be created when iOS work re-triggers.

### Phase 9: Closed-beta launch

**Workstream:** `shared` (Android-only for v1.0 per ADR-0011 Amendment 3)
**Goal:** First real Android runners on the app. Treat their feedback as the actual acceptance gate — no 48h soak rigor, just "ship, watch, iterate".
**Depends on:** Phase 8
**Requirements:** LAUNCH-01..02 (Android-only — iOS testers deferred per ADR-0011 Amendment 3)
**Success Criteria:**
1. Tag `v1.0.0-beta.1` → CI publishes Android APK to Caddy manifest. _(iOS TestFlight upload DEFERRED per ADR-0011 Amendment 3.)_
2. Solo-dev smoke test: install release build on own Android device + 1 friend's Android device; complete 1 full GPS-track session per device; no crashes; no data loss. _(iOS smoke arm DEFERRED.)_
3. **If smoke test passes:** invite 5-10 Android closed-beta testers via manifest URL
4. **72-hour watchlist:** `scripts/debug-tail.sh <user-id>` queries Loki on `srv1561293` for any tester reporting an issue; triage daily
5. Tester feedback intake: GitHub Issues template OR Telegram channel (decide in plan)
6. If a P0 surfaces (crash on launch, GPS pipeline broken, can't save session): hotfix → re-tag → re-distribute. No formal soak gate; ship when stable.

**Plans:**
- [ ] `09-01-PLAN.md` — Solo-dev Android smoke test (own + 1 friend, 1 full GPS session per device) + tag `v1.0.0-beta.1` — Wave 1, autonomous=false (Task 1 = solo smoke USER ACTION)
- [ ] `09-02-PLAN.md` — Invite 5-10 Android testers + 72h watchlist via debug-tail.sh + feedback intake — Wave 2 (depends on 09-01 PASS), autonomous=false (Task 1 = send invites USER ACTION; Task 2 = 72h triage)

## Acceptance Gate for v1.0 Closed Beta

Hard criteria (drastically reduced from the old 21-phase scope per ADR-0011; further narrowed to Android-only per Amendment 3):

1. **Signed Android release build** installs and runs on developer's Android device (Phase 6 + 7). _iPhone arm DEFERRED per Amendment 3._
2. **1-hour GPS pocket-session** records ≥95% of expected points on Pixel (Phase 7 / Plan 07-03). _iPhone arm DEFERRED per Amendment 3._
3. **Tag → distribute** works end-to-end: `git tag v1.0.0-beta.X` → CI publishes APK to Caddy manifest (Phase 8). _TestFlight upload DEFERRED per Amendment 3._
4. **5-10 Android friend testers** complete onboarding + 1 GPS session each within 72h of invite (Phase 9). _iOS tester arm DEFERRED per Amendment 3._
5. **Zero P0 crashes** in 72h watchlist; P1/P2 logged for v1.0.x patch cycle.

That's the gate. No 48h soak. No 8-device matrix. No restore drill. No on-call rotation. Android-only, solo dev, friend testers, ship-when-stable.

## Hard Rules for Agents (Milestone-wide)

Kept from the 21-phase scope (still apply):

- No secret ever committed. Use placeholders like `EXPO_PUBLIC_MAPBOX_TOKEN_EXAMPLE_DO_NOT_USE`.
- No `latest` image tags in production manifests. Pin to immutable SHA256 digests.
- No `--no-verify` on commits. Pre-commit hooks must pass.
- No telemetry event that could correlate a runner to a specific location they ran. Default to NOT sending if unsure.
- Release APK/IPA must be reproducible: two CI runs of same tag → byte-identical artifacts (modulo signature).

Dropped from the 21-phase scope (per ADR-0011):

- ~~Crash reports → separate Sentry projects per env~~ — no mobile crash reporting in v1.0; rely on user reports + Loki tails.
- ~~Phase 2 → Phase 3 strict sequencing~~ — both done; rule retired.

## Archived Phases (dropped from v1.0 — see ADR-0011)

One-line residual-risk pointer per dropped phase. Original artifacts in `.planning/phases/_archive/superseded-21-phase-v1.0/` (only Phase 16 had a CONTEXT skeleton on disk; Phases 6-15 and 17-21 were ROADMAP-only).

| Old phase | Dropped | Residual risk for closed beta |
|---|---|---|
| 6: Edge protection + rate-limiting | full | `/auth/*` rate-limit gap (CONCERNS.md P0). Mitigation: closed-beta blast radius = 5-10 friends; SOPS dev-mode removed in Phase 2. v1.1 backlog. |
| 7: DB + queues + pgBackRest drills | full | No proven restore drill. Mitigation: `pg_dump` snapshot before each migration (already in `docs/RUNBOOKS/deploy.md §6.4` from CICD-04). |
| 8: Load + chaos baselines (k6) | full | No load profile. Mitigation: 5-10 testers won't hit limits; trust user-report signal during beta. |
| 13: Mapbox SDK 11.x migration | full | Stay on `@rnmapbox/maps@^10.3` for beta. No native crashes observed at 10.3 to date. |
| 14-15: Native + ABI matrix | full | arm64-v8a (Android) + arm64 (iOS) only. No 16 KB page-size validation for Android 15+ — risk reviewed if tester reports Android 15+ failure. |
| 16: Background reliability (old) | partial → moved to new Phase 7.03 | Solo dev validates on 2 devices instead of 4-vendor matrix. Pixel + iPhone smoke covers majority of beta; MIUI/HyperOS/EMUI/One UI = monitor during beta. |
| 17: Crash reporting (mobile Sentry) | full | No automated crash collection. Mitigation: backend Sentry SDK already wired-dormant per D-38 — flip on if needed by populating SOPS DSN. Mobile crashes surface via user reports + Loki tails. |
| 20: Device matrix (8 classes) | full | Solo dev = 2 devices, testers = ~5-10 devices total. No structured device protocol. v1.1 if a vendor-specific bug surfaces in beta. |
| 21: Staging E2E + 48h soak + on-call | full | No formal soak window. Mitigation: Phase 9 = ship-then-watch with 72h tester window; tag iterates if P0 hits. |

**Re-expansion triggers** (when to revisit the archive):
1. Beta passes >50 users (load + crash visibility become real)
2. A P0 incident exposes one of the dropped phases' gaps (e.g., a tester's MIUI device kills the recorder — re-open Phase 16 mitigations)
3. Team grows beyond 1 dev (workload to maintain extra rigor becomes affordable)

## v1.0.1 Backlog (debt items)

Tracked for first post-v1.0 maintenance milestone. Inherited from the 21-phase scope's `v1.0.1 Backlog`:

| ID | Item | Source | Rationale |
|----|------|--------|-----------|
| GHCR-PULL-AUTH | Direct GHCR pull on prod (replace save/scp/load) | Plan 04-04 D-04-04-A | +5min wall-clock per deploy; flip 8 packages public or short-lived registry-token push |
| MIGRATE-RSYNC-DELETE | rsync --delete for migrations subtree only | Plan 04-04 | Obsolete migration files linger on prod after deploy |
| METADATA-RAW-TAG | metadata-action `pattern={{raw}}` for semver | Plan 04-04 | CD strips `v` prefix; raw git tag and GHCR tag-string mismatch |
| CD-SMOKE-VERIFY | Fix `cosign-verify-smoke` job | Plan 04-04 | UNAUTHORIZED on private packages |
| DIGEST-PINNING | SHA256 digest-pin compose images | Plan 04-03a/04 | Current tag-pin is mutable |
| SECRETS-ROTATE | Rotate POSTGRES_PASSWORD, JWT_SECRET, MINIO creds | Phase 3 chat-leak 2026-05-17 | Pasted in chat during Phase 3 SOPS-fill |
| AUTH-RATELIMIT | Add `/auth/*` rate-limit (was Phase 6 EDGE-01) | CONCERNS.md P0 | Closed-beta mitigates blast radius; revisit before public |
| DEBUG-MIDDLEWARE-ENV | Refactor DebugSessionMiddleware to read `DEBUG_SESSIONS_FOR_USER` env-allowlist (currently 3-gate via featureflag — featureflag has no admin UI for solo dev) | ADR-0011 OBS-08 | Small refactor; do when first debug-on-demand is needed in beta |
| PROD-LAUNCH-PREP | Bank-grade key custody — re-backup `.secrets/prod/mobile-signing.yaml` to 2 encrypted-DMG USB sticks at ≥5 km separation + laminated paper RECOVERY-CARDs + 1Password sealed DMG passphrase entry | ADR-0011 Amendment 2026-05-20 PM | Closed-beta uses single SOPS copy on dev workstation (per Amendment 4); promote to bank-grade when beta passes 50 users (same trigger as ADR-0011 re-expansion §1). No re-keying needed — just additional copies of the existing SOPS file. |
| KEYSTORE-CLOUD-BACKUP | Keystore cloud backup — execute Plan 06-01 Tasks 5+6 (cloud-sync SOPS bundle + age key + RECOVERY-CARD.md + cross-device sync verification). Plan body preserved in `.planning/phases/06-release-signing/06-01-PLAN.md` from ADR-0011 Amendment 2 PM. | ADR-0011 Amendment 4 2026-05-20 PM | Closed-beta uses single SOPS copy on dev workstation. Promote when ANY: (a) Google Play Store submission begins; (b) tester base passes 50 users; (c) explicit decision to start treating keystore as a production asset. Promotion = un-flag deferral notices in Plan 06-01 + run Tasks 5+6 against a live cloud-sync provider. |
| CI-WORKFLOW-REGISTRY-AUDIT | Audit + reconcile GH Actions workflow registry vs `main` branch contents. **Drift observed 2026-05-21:** `backend-cd.yml` appears in active workflow registry but is NOT present at `.github/workflows/backend-cd.yml` on `main` (it lives only on `feat/cursona-redesign`). GH retains workflow index entries after removal; registered workflows fire even if absent from default branch. New workflows (like `android-release.yml` cherry-picked in Phase 7 Stage A' fix) only register when present on default branch. Audit: list all workflows in registry vs files on main; reconcile by either backporting missing files OR explicitly deregistering stale ones via GH UI. | Phase 7 Stage A' diagnostic 2026-05-21 | Non-urgent; doesn't block Phase 7 closeout. Schedule for post-Phase-7 CI cleanup pass. |
| CI-MASK-LINT | Pre-commit / actionlint rule that flags `echo "X=$value" >> $GITHUB_ENV` without a preceding `::add-mask::` line. Generalize to any `$GITHUB_OUTPUT` / `$GITHUB_STEP_SUMMARY` write of a non-`${{ secrets.X }}` value. Closes the recurrence vector for the ADR-0012 leak class. | ADR-0012 §"Mitigations Phase C" | Low complexity (single grep rule); high-leverage (catches the entire class of bugs the incident exposed). Schedule with the SECRETS-LEAK-PLAYBOOK-AMEND item. |
| SECRETS-LEAK-PLAYBOOK-AMEND | Append §"Incident response — credential leak in CI logs" to `docs/SECRETS.md` codifying the corrected order: verify-decrypt-first (with `SOPS_AGE_KEY_FILE` explicitly set) → audit blast radius (grep logs for value) → then delete leaking runs → rotate → patch leak vector → ADR. Order matters: STEP 1 deletion BEFORE verification was the operational mis-ordering exposed during the original ADR-0012 response. | ADR-0012 §"Mitigations Phase B" | Documentation-only; ~30 min to write. Includes the trailing-newline `yq -r` shape-vs-value lesson from the amendment. |
| SOPS-VERIFY-HARDENING | Every verification script under `evidence/` and `scripts/` must (a) require `SOPS_AGE_KEY_FILE` explicitly (no relying on shell default), (b) check `sops -d` exit code (no `2>/dev/null` swallow), (c) validate decrypted value shape (length, schema) before downstream processing. Audit existing scripts; add the guard pattern. | ADR-0012 §"Mitigations Phase C" | The SOPS_AGE_KEY_FILE-unset diagnostic blind spot triggered the false-positive sub-incident in the original ADR-0012 response. Audit deliverable is a one-shot pass. |
| CRED-DIAG-DISCIPLINE | Codify the 4 credential-diagnostics discipline rules in `docs/SECRETS.md` as a "Credential diagnostics" section: (1) single canonical fingerprint form `printf '%s' "$VAR" \| shasum -a 256 \| cut -c1-12`; (2) no byte-level inspection of values (no `xxd`, `od -c`, `hexdump`, `${VAR:0:N}`, `${VAR: -N}`); (3) length OK / bytes not; (4) fingerprint discrepancies are shape problems not value problems. Add a pre-commit grep rule for `xxd .*\$[A-Z_]+` patterns in shell scripts (false-positive-tolerant). | ADR-0012 amendment §"Lessons added" | The discipline rules are what closed the self-inflicted re-incident loop. Codifying them prevents the next dev (or future me) from repeating. |
| EAS-PROJECT-INIT | `apps/mobile-rn/app.json` has literal placeholder `extra.eas.projectId: "TODO-eas-project-id-after-eas-init"`. Blocks Plan 07-01 Task 6 final EAS Cloud build under tag-triggered `android-release.yml`. Resolution: user-action `cd apps/mobile-rn && eas login && eas init` (or `EXPO_TOKEN=... eas init --non-interactive`). | ADR-0012 + Plan 07-01 Task 6 | **Note:** not actually a v1.0.1 deferral — it's the immediate next user-action to close Plan 07-01. Tracked here so it doesn't drift out of mind if Plan 07-01 closeout slips. |
| DISTRIBUTION-PIPELINE-RE-ENABLE | Phase 8 distribution-pipeline (Plan 08-01) is code-complete + runtime-disabled per ADR-0011 Amendment 5. Re-enable = (1) populate `MINIO_RELEASES_ACCESS_KEY` + `MINIO_RELEASES_SECRET_KEY` repo secrets (CI side flips `DISTRIBUTE_ENABLED` to `true` on next tag push automatically), (2) configure mobile env `EXPO_PUBLIC_UPDATE_MANIFEST_URL` to match MinIO public-read bucket URL, (3) cut a new beta tag. Code already in repo (Ed25519 signer + verifier, manifestCheck dispatch, force-update store, UpdateBanner UI, useUpdateCheckOnForeground hook, Settings button); 638/638 jest tests defend against drift. | ADR-0011 Amendment 5 2026-05-24 | Closed-beta uses manual sideload by solo dev. Promote when ANY: (a) tester base passes ~20 active users (DM-with-link starts hitting "did everyone update" overhead); (b) forced upgrade becomes operationally needed (backend breaking change requires `min_supported_version` enforcement); (c) MinIO or equivalent S3-compatible object store provisioned on user's infra; (d) transition to broader distribution OUTSIDE Play Store. No code changes required to re-enable. |
| STORIES-REVIVAL | Re-introduce stories UI module on mobile (was removed Phase 8/C closeout; backend `feed` service on port 8085 + SQLite tables `stories`+`story_views` v11 still exist for rollback). Includes: viewer with progress bars, creator (camera + upload), ring badge on chat/profile avatars, story-reactions store, sync loop, cleanup-cron client. Needs design decisions on retention (24h?) and visibility model (followers-only vs public). | `/gsd-quick chat-polish-pass` 2026-05-25 discussion | Was deliberately removed Phase 8/C; revival is feature add (~2-4 days). Recommend deferring until post-v1.0 unless beta testers explicitly ask. |
| FRIEND-REQUEST-FLOW | Symmetric friend-request with accept/reject (current model is asymmetric follow, no accept needed). New `social-graph` endpoints (POST `/friend-requests/{userId}`, GET `/friend-requests/incoming`, POST `/friend-requests/{id}/accept`, POST `/friend-requests/{id}/reject`) + new `friend_requests` schema/migration + mobile `useFriendRequestsStore` + `FriendRequestInboxScreen` + Me-tab badge + notification path. Decide co-exist vs replace follow. | `/gsd-quick chat-polish-pass` 2026-05-25 discussion | Currently follow model gates DMs via `canDm` permission (Phase 8/K). Promote when product decision: do we want explicit friendship as a stronger relation than follow? ~1-2 days. |
| CHAT-TYPING-INDICATOR | Ghost bubble when peer is typing on ChatScreen. Backend realtime pubsub event (`typing.started` / `typing.stopped` on conversation channel) + mobile listener in `useRealtimeStore` (5s expiry) + render below message list with fade animation. | `/gsd-quick chat-polish-pass` 2026-05-25 discussion | Touches messaging service. Big UX feel improvement for small effort (~3h). Good first follow-up to chat-polish-pass when ready. |
| CHAT-SWIPE-DELETE | Left-swipe row on ChatsListScreen → reveal red Delete button → soft-delete chat. `react-native-gesture-handler` Swipeable wrapper + animated removal via LayoutAnimation. Needs new backend endpoint `DELETE /conversations/{id}` (soft-delete, mark `deleted_at`). | `/gsd-quick chat-polish-pass` 2026-05-25 discussion | Modern gesture-based polish; gesture-handler already in project. ~3h. |
| CHAT-MODULE-MIGRATION | Move chat code from `src/state/social/`, `src/storage/socialRepository.ts`, `src/domain/social.ts`, `src/ui/social/` into `src/modules/chat/{domain,storage,state,sync,ui}/index.ts` to match the modular pattern used by Phase 8/E moderation. | `/gsd-quick chat-polish-pass` 2026-05-25 discussion | Architectural refactor; non-urgent (1-2 days). Useful before adding bigger features (e.g. STORIES-REVIVAL or FRIEND-REQUEST-FLOW). |

---

*Roadmap last updated: 2026-05-25 — Quick task `chat-polish-pass` complete (7 commits, 6 FE polish items shipped); v1.0.1 backlog gains 5 chat/social items: `STORIES-REVIVAL`, `FRIEND-REQUEST-FLOW`, `CHAT-TYPING-INDICATOR`, `CHAT-SWIPE-DELETE`, `CHAT-MODULE-MIGRATION` (12 items total).*
*Roadmap previously updated: 2026-05-24 — Phase 7 .aab signed end-to-end; Plan 07-03 Tasks 1-4 shipped (device-blocked on Pixel); Plan 08-01 GATED per ADR-0011 Amendment 5 (code-complete + runtime-disabled); v1.0.1 backlog gains `DISTRIBUTION-PIPELINE-RE-ENABLE` (7 items total).*
*Roadmap previously updated: 2026-05-23 — Phase 7 Plan 07-01 mid-flight; v1.0.1 backlog extended with 5 ADR-0012 items (CI-MASK-LINT + SECRETS-LEAK-PLAYBOOK-AMEND + SOPS-VERIFY-HARDENING + CRED-DIAG-DISCIPLINE + EAS-PROJECT-INIT) on top of the existing CI-WORKFLOW-REGISTRY-AUDIT (added 2026-05-21 during Stage A' diagnostic).*
*Roadmap rewritten: 2026-05-20 per ADR-0011 (was 21-phase enterprise-hardening scope, retired)*
*Milestone: v1.0 Closed Beta — Phase 6 closed; Phase 7 mid-flight (Plan 07-01 Task 6 awaiting `eas init`).*
