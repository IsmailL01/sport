# Codebase Concerns

**Analysis Date:** 2026-05-18

**Project context:** `sport` (Running Ecosystem), solo-dev (Ismail), v1.0 closed-beta hardening, prod VPS at `148.253.214.156` (`https://148-253-214-156.sslip.io`). Currently between Phase 4 Wave 3 (CI/CD pipeline; backend-cd.yml scaffolded but no live CD run yet) and Phase 4 Wave 4 (rollback drill + branch protection + freeze toggle).

Severity legend: **HIGH** = blocks v1.0-rc.1 tag or production stability • **MEDIUM** = degrades posture but not blocking • **LOW** = hygiene / future-proofing.

---

## Tech Debt

### Compromised production secrets pending rotation — HIGH (v1.0.1 / pre-Phase 21)

- **Issue:** Four production credentials transited chat / API during Phase 2-3 gap closure (2026-05-17). Injected into SOPS via `sops --set` (no plaintext eyeballed on disk) but treated as compromised: **POSTGRES_PASSWORD**, **JWT_SECRET**, **MINIO_ROOT_USER**, **MINIO_ROOT_PASSWORD**.
- **Files:** `.secrets/prod/shared.yaml` (encrypted; rotation procedure in `docs/SECRETS.md` §Rotation playbook).
- **Impact:** If the chat/API transit point is ever subpoenaed, replayed from logs, or scraped from terminal scrollback, an attacker has root-equivalent access to Postgres + ability to mint forever-valid JWTs + full MinIO admin. JWT rotation also invalidates all live tokens — coordinated downtime needed.
- **Fix approach:** Trigger before Phase 21 (first external testers / staging soak). Procedure: generate new values → `sops edit .secrets/prod/shared.yaml` → `ansible-playbook -i inventory/prod --tags=sport-stack site.yml` (re-renders `/run/sport.env`, restarts containers) → revoke old DB user / re-sign existing refresh tokens. Tracked in `.planning/phases/03-infrastructure-as-code/03-03-SUMMARY.md` §Carry-forward TODOs #1.

### SHA256 digest pinning not yet applied — MEDIUM (v1.0.1)

- **Issue:** Production compose pins images by mutable tag, not by immutable SHA256 digest. CICD-02 acceptance criteria #2 says "pinned to SHA256 digests in production manifests (no `latest` tags ever — hard rule)" — `:latest` is hard-blocked by `no-latest-tag-guard` workflow but the current `${SPORT_STACK_TAG}` tag-pin still allows silent re-publication of the same tag to a different digest.
- **Files:** `services/backend/docker-compose.prod.yml:116,133,154,181,203` (and three more for `feed`, `messaging`, `social-graph`) — all 8 Go services use `image: ghcr.io/ismaill01/<svc>:${SPORT_STACK_TAG:?…}`.
- **Impact:** Supply-chain attacker (compromised GH token) could re-tag a malicious image; production `docker compose pull` would silently fetch it. Cosign signing is in place (CI-side) but Ansible doesn't yet verify pre-pull.
- **Fix approach:** v1.0.1 follow-up workflow: post-publish job opens digest-update PR to compose; Ansible adds cosign-verify-pre-pull gate. Tracked in `.planning/phases/04-ci-cd-pipeline/04-03a-SUMMARY.md` §deferred bullet 3.

### Ansible cosign-verify-pre-pull gate missing — MEDIUM (v1.0.1)

- **Issue:** Phase 4 CD pipeline signs images with cosign keyless (Sigstore/Fulcio) and verifies the signature in its own `cosign-verify-smoke` self-check job, but the production deploy seam (`infra/ansible/roles/sport-stack/`) runs `docker compose pull` without any `cosign verify` step. Signatures exist; nothing forces verification on pull.
- **Files:** `infra/ansible/roles/sport-stack/tasks/main.yml`, `infra/ansible/roles/sport-stack/tasks/decrypt_sops.yml` — no cosign step. `.github/workflows/backend-cd.yml:108-132` — verify-smoke exists but is CI-side only.
- **Impact:** See concern above. The feedback loop is closed in CI; it is not closed at the deploy boundary.
- **Fix approach:** Add a `cosign verify ghcr.io/ismaill01/<svc>@<digest> --certificate-identity=… --certificate-oidc-issuer=https://token.actions.githubusercontent.com` pre-task in the sport-stack role; fail-closed if signature missing. Pairs with the digest-pinning concern above. Tracked in `.planning/phases/04-ci-cd-pipeline/04-03a-SUMMARY.md` §deferred bullet 3.

### `IDENTITY_DEV_MODE` warning logs OTP `code` field — MEDIUM (Phase 5 OBS-04)

- **Issue:** `OtpService.RequestCode` calls `slog.InfoContext(ctx, "otp issued", "email", …, "code", code)` **unconditionally** — the comment on the next line says "Dev-mode logging only. В production не логируем code." but the `code` attribute is always emitted, not gated by `devMode`. SEC-05 (Phase 2) closed the `IDENTITY_DEV_MODE=true` default; the OTP log leak it covered remains.
- **Files:** `services/backend/identity/internal/service/otp.go:70-74`.
- **Impact:** Anyone with read-access to backend logs can see one-time login codes — full account takeover (the email field is also right there in the same log line). For closed beta this is "log access = full impersonation".
- **Fix approach:** Gate the `code` attribute behind `if devMode { … }` OR drop it entirely from the production code path. Already tracked as Phase 5 OBS-04 in `.planning/ROADMAP.md` and `.planning/STATE.md` §Blockers/Concerns. **Verify in Phase 5** — the structured-logger migration is the natural seam.

### `/auth/*` endpoints have no rate limit — MEDIUM (Phase 6 EDGE-01)

- **Issue:** `pkg/ratelimit` exists (Redis-backed sliding window) and is wired into `feed`, `social-graph`, `messaging`, `media` handler chains, but **no rate-limit middleware is mounted on `identity`'s `/auth/request-code` or `/auth/login-with-code`**. Email-enum and brute-force protections rely entirely on per-row OTP `attempts < 5` counter (which doesn't protect against rotating attacker emails).
- **Files:** `services/backend/identity/internal/handler/http.go` (handler chain — no ratelimit middleware), `services/backend/identity/internal/handler/otp.go` (`/auth/*` registrations), `services/backend/pkg/ratelimit/ratelimit.go` (the lib that's not used here).
- **Impact:** A botnet can enumerate the user table by spamming `POST /auth/request-code` with arbitrary emails (response code reveals existence) and burn Twilio / email-provider budget. Brute-force protection holds at 5 attempts per OTP row but no per-IP / per-account-creation throttle.
- **Fix approach:** Wire `ratelimit.New(...)` middleware into the identity handler chain in Phase 6 (already scoped as EDGE-01 in ROADMAP). Per-IP limit on `/auth/request-code`, per-email on `/auth/login-with-code`.

### R18 — `personal_records` and `sessions` user_id audit unresolved — MEDIUM (Phase 7 DB-03)

- **Issue:** `personal_records` table not defined in `services/backend/migrations/0001-0021_*.sql` (no migration creates it). `sessions` table has `user_id` set correctly (`services/backend/migrations/0002_activities.up.sql:7`), but the upstream review round (R18, CONCERNS pre-v1.0) flagged this and the fix was deferred to Phase 7 with backfill-strategy DEFERRED to `/gsd-discuss-phase 7`.
- **Files:** `services/backend/migrations/0002_activities.up.sql` (sessions — OK), `personal_records` (NOT FOUND — table either lives in a missing migration or hasn't shipped yet).
- **Impact:** If `personal_records` exists on a production DB and lacks `user_id`, multi-tenant query isolation breaks (user A sees user B's PRs). The CLAUDE.md project rule **"Multi-tenant с дня 1 — даже если сейчас один пользователь, в схеме есть `user_id`"** is potentially violated.
- **Fix approach:** Phase 7 DB-03 — verify `personal_records` schema on prod VPS (`psql -c '\d personal_records'`), then design zero-downtime migration with backfill. Tracked in `.planning/ROADMAP.md` §Phase 7 and `.planning/STATE.md` §Blockers/Concerns.

### Drill migrations 9990/9991 — clarify keep-or-drop policy — LOW (Phase 21)

- **Issue:** Two transient migrations `9990_drill_metadata_col.{up,down}.sql` + `9991_drill_drop_metadata_col.{up,down}.sql` add and drop a JSONB `users.metadata` column for the CICD-04 rollback drill. The column is **never read or written by application code** — verified by `grep -rn "metadata JSONB" services/backend/` returning only the migration files. Numbering 9990/9991 was chosen specifically to avoid collision with Phase 7 production migrations (which reserve `0022+`).
- **Files:** `services/backend/migrations/9990_drill_metadata_col.{up,down}.sql`, `services/backend/migrations/9991_drill_drop_metadata_col.{up,down}.sql`.
- **Impact:** Cosmetic; column adds one JSONB pointer per `users` row (NULL → 8 bytes overhead). Zero correctness impact. Only confusion: future maintainer reading `\d users` may wonder what `metadata` is for.
- **Fix approach:** Plan 04-04 Task 6 leaves them as historical record by default. After Phase 21 closeout, decide: keep as documented drill artifact OR add migration `0022_drop_drill_metadata.up.sql` that drops the column.

### `sport_repo_url` placeholder in Ansible group_vars — LOW (Plan 03-02 close-out)

- **Issue:** `infra/ansible/group_vars/all.yml:32` carries `sport_repo_url: "PLACEHOLDER_NO_GIT_REMOTE_ORIGIN_YET"` from Phase 3 Wave 1 (worktree had no `origin` remote at the time). Wave 2 ended up using rsync/scp-equivalent flow; the placeholder was never updated.
- **Files:** `infra/ansible/group_vars/all.yml:32`.
- **Impact:** None at runtime (no current task consumes the var), but a future Ansible task that templates `git clone {{ sport_repo_url }}` will fail loudly with "fatal: repository not found" — easy to diagnose, but easy to miss until it bites.
- **Fix approach:** Replace with `https://github.com/IsmailL01/sport.git` (the actual origin, since Phase 4-01 created the repo). One-line edit + commit.

### Stale `dev_admin_ips` group_var entry — LOW (hygiene)

- **Issue:** `infra/ansible/group_vars/all.yml:24` lists `91.92.33.145/32` in `dev_admin_ips`, but D-24 REVISED (UFW `limit 22/tcp` instead of per-IP allowlist) means **no task consumes `dev_admin_ips` anymore**. The dev IP also rotated to `85.239.149.26` during Phase 3 anyway (residential ISP DHCP churn).
- **Files:** `infra/ansible/group_vars/all.yml:24`, `infra/ansible/roles/common/defaults/main.yml`.
- **Impact:** None operational. Reader confusion only.
- **Fix approach:** Delete the `dev_admin_ips:` block OR add comment that it's an orphan kept for v1.1 reinstatement when a static dev IP or bastion lands.

### `golang-migrate` task always reports `changed=1` — LOW (cosmetic)

- **Issue:** Ansible task `run_migrations.yml` invokes `migrate up` via `community.docker.docker_container_exec`; the task lacks a proper `changed_when:` clause, so every Ansible run reports `changed=1` for migrations even when the binary's output indicates "no change".
- **Files:** `infra/ansible/roles/sport-stack/tasks/run_migrations.yml`.
- **Impact:** Idempotency reporting noise. Doesn't actually re-run migrations destructively (migrate is itself idempotent), but breaks the "Ansible run #2 should be `changed=0`" smoke test.
- **Fix approach:** Add `changed_when: "'no change' not in migration_result.stdout"` (or similar — parse `migrate` actual output). Tracked in `.planning/phases/03-infrastructure-as-code/03-02-SUMMARY.md` §Carry-forward TODOs #3 and `03-03-SUMMARY.md` §Carry-forward TODOs #3.

### `/opt/running-ecosystem/` legacy directory remains on prod VPS — LOW (post-Phase 4 cleanup)

- **Issue:** Pre-Phase-3 manual deploy used `/opt/running-ecosystem/` (compose file + `.env.prod` with secrets). Phase 3 sport-stack umbrella deploys to `/opt/sport/`. Legacy directory was **intentionally preserved** as emergency fallback per `docs/RUNBOOKS/deploy.md` §6.3 until Phase 4 CI rollback drill validates the sport-stack flow.
- **Files:** On VPS only: `/opt/running-ecosystem/` (compose + `.env.prod` plaintext secrets); not in repo.
- **Impact:** Plaintext `.env.prod` on disk contradicts SOPS-only canonical storage (Phase 2 SEC-02). Anyone with VPS shell can read the old secrets — these are the same compromised secrets flagged in the HIGH concern above, so the cleanup pairs with rotation.
- **Fix approach:** After Phase 4 Plan 04-04 rollback drill closes successfully, `rm -rf /opt/running-ecosystem/`. Tracked in `.planning/phases/03-infrastructure-as-code/03-03-SUMMARY.md` §Carry-forward TODOs #4.

### Orphan Mapbox SOPS placeholders — LOW (Phase 2 hygiene)

- **Issue:** `.secrets/<env>/mapbox.yaml` files still carry `MAPBOX_PUBLIC_TOKEN` and `MAPBOX_SECRET_TOKEN` schema keys from Plan 02-01's original scaffold; no code reads them post-Plan 02-04 (single-token strategy chose `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN` instead).
- **Files:** `.secrets/prod/mapbox.yaml`, `.secrets/dev/mapbox.yaml`, `.secrets/staging/mapbox.yaml`.
- **Impact:** None. Reader confusion only.
- **Fix approach:** `sops edit <file>` → remove orphan keys. Tracked in `.planning/STATE.md` §Pending Todos #4.

### `direnv` / shell-rc sops age-key env-var auto-export missing — LOW (Phase 2 hygiene)

- **Issue:** SOPS on macOS searches `~/Library/Application Support/sops/age/keys.txt` by default, but the dev workstation stores the key at the XDG-default `~/.config/sops/age/keys.txt`. Every `sops` invocation requires `SOPS_AGE_KEY_FILE=$HOME/.config/sops/age/keys.txt sops …`.
- **Files:** Dev workstation only (no repo file).
- **Impact:** Annoyance + frequent "file not found" errors when forgetting to export. Already bitten during Plan 02-04 (live cutover) and Plan 03-02 (sops decrypt step) — was solved by hand each time.
- **Fix approach:** Add to `~/.envrc` (direnv) or `~/.zshrc`: `export SOPS_AGE_KEY_FILE="$HOME/.config/sops/age/keys.txt"`. Tracked in `.planning/STATE.md` §Pending Todos #6.

### CODEOWNERS placeholder usernames — LOW (post-merge)

- **Issue:** `CODEOWNERS:4` says "🔄 TODO (P0-A-03): заменить плейсхолдеры на реальные GitHub usernames обоих разработчиков". Solo-dev project; second developer never materialized. File still carries the placeholder TODO comment.
- **Files:** `CODEOWNERS`.
- **Impact:** None. Branch protection (Plan 04-05) sets `0 required reviewers` for solo-dev; CODEOWNERS isn't enforced.
- **Fix approach:** Either delete the file (solo-dev, no co-owners ever) OR replace placeholders with `@IsmailL01`. Drop the TODO comment.

---

## Known Bugs

### OTP code-reuse does not return 401 — MEDIUM (Phase 1 release-contract regression)

- **Symptoms:** During Phase 3 Wave 2 cutover smoke probe (2026-05-17), `smoke_otp.py` showed that re-submitting a used OTP code returns `200 OK` instead of the contract-required `401 Unauthorized`. Phase 1 release-contract spec (REL-01, ADR-0007) requires single-use codes; the implementation accepts the code, finds `used_at IS NOT NULL`, and proceeds to mint a new token pair anyway.
- **Files:** `services/backend/identity/internal/service/otp.go` (suspected — needs trace through `LoginWithCode` path), `services/backend/scripts/smoke_otp.py` (test that detected it).
- **Trigger:** Reuse a 6-digit OTP code within the 5-minute TTL window.
- **Workaround:** None at runtime; spec contract is broken until fixed.
- **Fix approach:** Out-of-scope Phase 3; tracked for `/gsd-discuss-phase 1` follow-up in `.planning/phases/03-infrastructure-as-code/03-03-SUMMARY.md` §Carry-forward TODOs #2. Likely 5-line fix: add `if otp.UsedAt != nil { return ErrInvalidCredentials }` check before token mint.

---

## Security Considerations

### `sudoers` widened to `NOPASSWD: ALL` — MEDIUM (D-20 REVISED scar)

- **Risk:** Deploy user (`deploy`) has unrestricted `NOPASSWD: ALL` sudo on the prod VPS. Originally D-20 specified a narrow allowlist (`/usr/bin/docker compose`, `/bin/shred /run/sport.env`, `/usr/bin/migrate`, etc.), but D-20 REVISED widened it because narrow list blocked Ansible day-2 ops (e.g., apt operations, systemctl, restart of stateful containers).
- **Files:** `infra/ansible/roles/common/tasks/main.yml:108` — `{{ deploy_user }} ALL=(ALL) NOPASSWD: ALL`.
- **Current mitigation:** SSH is key-only (D-19); root login disabled (D-19); UFW rate-limits 22/tcp to 6 conn / 30s per source IP (D-24 REVISED). Defense-in-depth: attacker must first compromise dev workstation's age + SSH key.
- **Recommendations:** v1.1 — narrow back to allowlist once the day-2 ops surface stabilizes (post Phase 5 observability + Phase 7 DB ops). Document each new sudo invocation point as a tracked carry-forward. Tracked in `.planning/phases/03-infrastructure-as-code/03-01-SUMMARY.md` §Deviations and `03-CONTEXT.md` §D-20 REVISION.

### UFW SSH allow rule is `limit 22/tcp` not strict source IP — MEDIUM (D-24 REVISED scar)

- **Risk:** UFW allows SSH from any source IP, rate-limited to 6 conn / 30s. Originally D-24 specified `allow 22 from {{ dev_admin_ips }}` (per-/32 allowlist) but residential ISP rotated dev IP within 38 min during Phase 3, locking the dev out. Widened to `limit 22/tcp` for solo-dev v1.0.
- **Files:** `infra/ansible/roles/ufw/tasks/main.yml:18-33`.
- **Current mitigation:** Key-only auth + root login disabled + `MaxAuthTries 3` + UFW rate-limit. Brute-force requires: (1) valid SSH key for `deploy@`, (2) plus chained sudo for any privilege escalation.
- **Recommendations:** v1.1 — narrow back when static dev IP / VPN gateway with static egress / bastion lands. Documented inline in the UFW task and in `.planning/phases/03-infrastructure-as-code/03-CONTEXT.md` §D-24 REVISION.

### `ExecStopPost` shred removed from sport-stack.service — LOW (D-15 REVISED scar)

- **Risk:** Original D-15 added `ExecStopPost=/bin/shred -u /run/sport.env` as defense-in-depth to wipe the decrypted env file on service stop. Removed 2026-05-17 because the shred ran *before* the next `ExecStartPre` re-render, creating a restart loop with empty env → fail-fast on `${POSTGRES_PASSWORD:?}` → infinite loop.
- **Files:** `infra/ansible/roles/sport-stack/templates/sport-stack.service.j2:14-37`.
- **Current mitigation:** `/run` is tmpfs (RAM-only, wiped at reboot anyway) with mode 0600 owner `deploy`. So the env file never lands on disk; the shred was belt-and-braces and the suspenders were already redundant with the tmpfs mount.
- **Recommendations:** v1.1 — revisit if env-render moves to `ExecStartPre` (then `ExecStopPost` shred becomes safe and meaningful again). Inline comment in the unit file references D-15 REVISED.

### GHCR personal-account package visibility — LOW (workflow scar)

- **Risk:** GitHub Packages API does not support setting package visibility for personal-account (non-org) namespaces — the visibility flip from PRIVATE→PUBLIC must be done **manually via web UI** for each new service package after its first publish. If any of the 8 packages is left PRIVATE, prod VPS `docker compose pull` returns `401 Unauthorized` (no GHCR PAT installed on VPS by design).
- **Files:** `.planning/phases/04-ci-cd-pipeline/04-01-PLAN.md:91-97`, `04-03a-PLAN.md:349` (documentation of the manual step).
- **Current mitigation:** RUNBOOK step in `docs/RUNBOOKS/deploy.md` reminds operator to flip visibility post-first-publish.
- **Recommendations:** Plan 04-04 first CD run produces all 8 packages → operator opens GitHub UI for each → Settings → Change visibility → Public. If any single package is missed, the cutover surfaces it as a 401 on pull (easy to diagnose). Tracked in `.planning/phases/04-ci-cd-pipeline/04-01-SUMMARY.md` §Carry-forward.

---

## Performance Bottlenecks

### `messaging/internal/handler/http.go` is 653 lines, single file — LOW

- **Problem:** Largest single Go file in the backend (653 lines) is the messaging service's HTTP handler, mixing conversation CRUD, message CRUD, reactions, edits, group membership, and read-state updates in one file.
- **Files:** `services/backend/messaging/internal/handler/http.go` (653 LOC), and `service/svc.go` (506 LOC).
- **Cause:** Phase 8 / A+B (messaging MVP + groups) shipped fast; file split deferred.
- **Improvement path:** Functional-area split (`http_conversations.go`, `http_messages.go`, `http_reactions.go`, `http_groups.go`) — pure refactor, no behavior change. Useful before adding any new chat features.

### Mobile `TrainingModal.tsx` is 638 lines — LOW

- **Problem:** Single React component file at 638 LOC; lots of state and UI mixed.
- **Files:** `apps/mobile-rn/src/ui/TrainingModal.tsx`.
- **Cause:** Modal grew organically across Phase 6/6.5/7 (training-modes feature). No deliberate refactor yet.
- **Improvement path:** Hook-extract pattern already validated in Phase 1 (P1-B — `useTrackerCamera`, `useLayerVisibility`, `usePauseUI` extracted from `TrackerLiveScreen`). Apply same pattern: extract `useWorkoutTimer`, `useIntervalScheduler`, etc.

---

## Fragile Areas

### `sport-stack.service` restart sensitivity to env-file contents — MEDIUM

- **Files:** `infra/ansible/roles/sport-stack/templates/sport-stack.service.j2`, `infra/ansible/roles/sport-stack/tasks/decrypt_sops.yml`.
- **Why fragile:** `ExecStartPre` renders `/run/sport.env` from SOPS-decrypted source; any single env-var missing causes `docker compose up` to fail-fast on `${POSTGRES_PASSWORD:?need POSTGRES_PASSWORD}` (and seven peers). Worse: `D-15 REVISED` removed the auto-shred precisely because the previous design produced an unbreakable restart loop. The unit file is now correct but the *envelope* (SOPS slot completeness check + render order) is critical and untested under each rotation scenario.
- **Safe modification:** Always run `sops -d .secrets/prod/shared.yaml | grep -E "POSTGRES_|JWT_|MINIO_"` to verify 6-key SOPS slot before `ansible-playbook -i inventory/prod --tags=sport-stack site.yml`. Inventory comment block already documents this.
- **Test coverage:** No automated test of "incomplete SOPS slot → fail-fast at decrypt step, not at docker startup". Manual procedure in `docs/RUNBOOKS/deploy.md` §7.

### `sshd` drop-in config — MEDIUM

- **Files:** `infra/ansible/roles/common/files/sshd_config_overrides` — explicit "DO NOT add `Subsystem sftp`" comment header.
- **Why fragile:** Phase 3 Wave 1 wedged production sshd by adding a duplicate `Subsystem sftp` line (Ubuntu 24.04's main `/etc/ssh/sshd_config` already declares it; OpenSSH refuses to start on duplicate Subsystem entries). Recovery required out-of-band provider console (VNC/KVM) access. The file is correct now and has the warning, but any future maintainer who adds an SSH config directive without checking the base config can re-wedge production.
- **Safe modification:** Always `sshd -t -f /etc/ssh/sshd_config.d/99-hardening.conf` after editing the drop-in. Test the change against `dev` inventory first (no `dev` env exists today — provisioning a throwaway VPS is the only safe rehearsal seam until staging lands in v1.1).
- **Test coverage:** None. Mitigation is the warning comment in the file + `docs/RUNBOOKS/deploy.md` §7 Failure Mode "sshd wedge".

### Locked worktree-agent branches — LOW

- **Files:** `.claude/worktrees/agent-a2acfcb9614fc30b0`, `agent-a2cf95f1a5cb08640`, `agent-a3105aec3440ccf87`, `agent-a5ba17aa0a2a6814b` — all listed as `[locked]` in `git worktree list`.
- **Why fragile:** Leftover from Phase 1-3 GSD executor agents. None pushed to origin (only `feat/cursona-redesign` + `main` are at origin). The `a3105aec3440ccf87` worktree still contains `infra/terraform/` (deleted from main tree by Phase 3 pivot, lives on only in this worktree). Locked = `git worktree remove --force` is the only way to clean up.
- **Safe modification:** Verify each branch tip with `git log -1 <branch>` — these are agent-only refs, not production-bearing. After verify, `git worktree remove --force` each.
- **Test coverage:** None applicable. Hygiene cleanup. Tracked in `.planning/phases/04-ci-cd-pipeline/04-01-SUMMARY.md` §Deviations as "low priority — local-only".

---

## Scaling Limits

### Single-VPS deployment — accepted for v1.0 closed-beta

- **Current capacity:** One Ubuntu 24.04 VPS at `148.253.214.156` running 13 containers (8 Go services + 4 stateful: Postgres+TimescaleDB, NATS JetStream, Redis, MinIO + Caddy reverse proxy).
- **Limit:** Single point of failure for compute, storage, and TLS termination. No HA. INFRA-07 timing baseline measured fresh deploy at 66.5s (well under <60min target).
- **Scaling path:** v1.1 — staging environment (deferred per D-23). v2.0 — multi-region (deferred per user redline, see `.planning/STATE.md` §Deferred Items). Accepted for closed-beta with ≤50 users.

### Postgres database storage on VPS local disk — accepted for v1.0

- **Current capacity:** Postgres data volume on VPS local disk (no separate Storage Box backup yet).
- **Limit:** pgBackRest → Hetzner Storage Box is **Phase 7 DB-04** (deferred). Until that lands, the only backup is whatever the VPS provider offers as snapshots.
- **Scaling path:** Phase 7 ships pgBackRest with restore drill to a clean VPS. Tracked in `.planning/ROADMAP.md` §Phase 7.

---

## Dependencies at Risk

### `@rnmapbox/maps@10.3.0` (Mapbox SDK 10.x) — MEDIUM (Phase 13)

- **Risk:** Locked to 10.x; 11.x is the long-term-support line for new feature work (Studio integration, vector style v8, performance improvements). 10.x will eventually stop receiving security patches.
- **Impact:** Mobile build regression risk when 11.x migration happens — `@rnmapbox/maps` has known breaking API changes (camera, source, layer abstractions). All Phase 1 territory-core features must regress-pass on the bumped SDK.
- **Migration plan:** Phase 13 (`mobile-shared` workstream) — full SDK bump with debug-build regression gate of every Phase 1 tracker feature before merge. ADR-0008 scheduled (currently a placeholder in `.planning/STATE.md`).

### `react-native-health` / `react-native-health-connect` not yet installed — LOW

- **Risk:** HealthKit/HealthConnect adapter stubs exist (`HealthKitAdapter.ts`, `HealthConnectAdapter.ts`) but actually require their native pods; current implementation is stub-safe (returns mock data when packages absent). HEALTH-04 (Strava read-only) is what's actually in v1.0; the health-adapter native packages slide to v1.1.
- **Impact:** None for v1.0. Closing-beta testers cannot test HealthKit/Connect import (out of v1.0 scope per `.planning/REQUIREMENTS.md` §Deferred from v1.0).
- **Migration plan:** v1.1 Phase 11/12 follow-up after HEALTH-04 Strava OAuth completes.

---

## Missing Critical Features

### Field-test acceptance from old Phase 1 — HIGH (Phase 16)

- **Problem:** Phase 1 (old superseded scope) closed at code-level (`feat/cursona-redesign` 35 commits) but the field-test acceptance criteria (Pixel + iPhone + Chinese-Android × T1/T2/T6/T7/T8/T9) **were not executed**. ADR-0005 holds the deferral; new Phase 16 (`16-CONTEXT.md`) inherits the gate.
- **Blocks:** Closing v1.0-rc.1. The whole v1.0 milestone narrows to "≥8 real runners do a 48h staging soak in Phase 21" — and that requires the Phase 16 BG-01..08 acceptance numbers to be measured.
- **Files:** `tests/FIELD_PROTOCOL.md` (capture table — 541 lines, all per-device rows `pending`/`—`), `.planning/phases/16-background-reliability-in-release/16-CONTEXT.md`.

### iOS build prerequisite: Xcode install + Mapbox `sk.` token in `~/.netrc` — HIGH (Phase 10/12/15/16)

- **Problem:** No iOS build has ever been produced on this dev machine. Xcode is not installed (`STATUS.md` documents the TODO). `~/.netrc` does not contain the rotated Mapbox `sk.` download token (Phase 2 Plan 02-04 owner-driven step that was deferred and superseded by the single-token strategy — verify whether iOS pod install reads `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN` from env or from `~/.netrc`).
- **Blocks:** Phase 10 (iOS release signing), Phase 12 (iOS build config), Phase 15 (iOS device class compat), Phase 16 iPhone field tests, Phase 19 TestFlight pipeline, Phase 20 device matrix.
- **Files:** No repo file; dev-workstation state. `STATUS.md` §"Открытые TODO".

### Sentry self-hosted not yet provisioned — MEDIUM (Phase 5 OBS-01, Phase 17)

- **Problem:** No crash reporting in any environment. Phase 17 (mobile crash reporting) blocked on Phase 5 (Sentry backend infra) — currently Phase 5 has not started.
- **Blocks:** Production debug of any crash. Closed-beta testers cannot have their crashes auto-reported.
- **Files:** No repo file; the Sentry VPS doesn't exist yet. `.planning/REQUIREMENTS.md` §OBS-01..08.

---

## Test Coverage Gaps

### `pkg/ratelimit` not used by identity → no integration test of `/auth/*` rate-limit — MEDIUM

- **What's not tested:** `/auth/request-code` and `/auth/login-with-code` rate-limit behavior — because there is no rate-limit middleware on those endpoints (see Tech Debt §`/auth/*` endpoints have no rate limit). `services/backend/scripts/smoke_ratelimit.py` tests rate-limit on `feed/social-graph/messaging` paths.
- **Files:** `services/backend/identity/internal/handler/http.go`, `services/backend/scripts/smoke_ratelimit.py`.
- **Risk:** OTP enumeration / email-provider budget burn (see security concern).
- **Priority:** **High** — pairs with Phase 6 EDGE-01 fix; smoke script extension.

### `OtpService` does not test code-reuse → 401 — MEDIUM

- **What's not tested:** No unit test asserts "reuse a used OTP → ErrInvalidCredentials". Phase 3 cutover smoke surfaced the bug (response 200 instead of 401).
- **Files:** `services/backend/identity/internal/service/otp_test.go` (if exists), `services/backend/scripts/smoke_otp.py`.
- **Risk:** Spec contract violation — see Known Bugs §OTP code-reuse.
- **Priority:** **High** — add unit test alongside the fix.

### Rollback drill never run live — MEDIUM (Plan 04-04)

- **What's not tested:** End-to-end "deploy version N with migration → deploy N+1 with second migration → `make rollback v=N` reverts everything including N+1 down migration". Scaffolding (Makefile + drill migrations 9990/9991 + `drill_assert_schema.sh`) lives at top-level. Live execution = Plan 04-04 (pending).
- **Files:** `Makefile`, `services/backend/migrations/9990_*`, `9991_*`, `services/backend/scripts/drill_assert_schema.sh`.
- **Risk:** First real rollback need in production will be the first test of the procedure — high-stakes debug session under incident pressure.
- **Priority:** **High** — Phase 4 Wave 4 gate. CICD-04 acceptance.

### Restore drill (pgBackRest → fresh VPS) never run — MEDIUM (Phase 7)

- **What's not tested:** pgBackRest backup→restore→data-parity verification on a clean VPS. Required by Phase 7 DB-04 acceptance.
- **Files:** No file yet (Phase 7 not started).
- **Risk:** First real restore need in production = first test of the procedure under incident pressure.
- **Priority:** **High** — Phase 7 acceptance gate.

### Mobile field-test acceptance never captured — MEDIUM (Phase 16)

- **What's not tested:** Pixel + iPhone + Chinese-Android × T1/T2/T6/T7/T8/T9 background reliability and battery scenarios. `tests/FIELD_PROTOCOL.md` table all `pending`.
- **Files:** `tests/FIELD_PROTOCOL.md`, `.planning/phases/16-background-reliability-in-release/16-CONTEXT.md`.
- **Risk:** Blocks v1.0-rc.1 — see Missing Critical Features.
- **Priority:** **High** — Phase 16.

### Mobile current test count: 536 passing, no integration / E2E — LOW

- **What's not tested:** End-to-end mobile↔backend flows. Unit + hook + service-layer coverage is high (Phase 1 pipeline 93% / area 95% / domain high) but no Detox / Appium / Maestro tests exist.
- **Files:** `apps/mobile-rn/src/__tests__/*` and `apps/mobile-rn/src/**/__tests__/*` — 536 tests all unit/integration in-process.
- **Risk:** Wire-protocol regressions (mobile client version negotiation, X-Client-Version, 426 force-update) only caught by ad-hoc manual runs.
- **Priority:** Medium — overlaps Phase 21 E2E acceptance. Likely not addressed for v1.0; v1.1 candidate.

---

## Carry-Forward From Phase Pivots (Informational)

These are not active debt but historical scars worth tracking so future changes don't accidentally re-introduce the problem:

- **Phase 3 pivot — Hetzner Cloud / Terraform dropped → provider-agnostic VPS** (2026-05-17). `infra/terraform/` deleted from main tree in commit `00bcb39`. Terraform leftover still lives in locked worktree `.claude/worktrees/agent-a3105aec3440ccf87/infra/terraform/` (will be cleaned with worktree). No references in active code. Verified: `find . -name "terraform*" -not -path "*/node_modules/*" -not -path "*/.git/*"` returns only worktree paths. INFRA-02 + INFRA-04 deferred to v1.1.
- **Mobile framework — Flutter archived 2026-05-14** (Phase 0 close). `apps/mobile_flutter.archived/` deleted from working tree (no leftover dir verified — `find apps -maxdepth 2 -type d` shows only `mobile-rn`). Git history retains. Flutter must NOT be developed; ADR-0001 locked Expo RN.
- **Auto-mode classifier escalations during Phase 2-3** — blocked sudoers widening, `gh auth refresh -s write:packages`, scope escalations. Informational only; classifier behaved correctly. Not active debt.

---

*Concerns audit: 2026-05-18*
*Auditor context: Phase 4 Wave 3 closed (backend-cd.yml scaffold + Makefile + drill migrations); Wave 4 (live rollback drill + branch protection + freeze toggle) next.*
