---
plan_id: 04-03b
phase: 4
phase_slug: ci-cd-pipeline
wave: 3
depends_on: [04-02]
files_modified:
  - Makefile
  - services/backend/migrations/9990_drill_metadata_col.up.sql
  - services/backend/migrations/9990_drill_metadata_col.down.sql
  - services/backend/migrations/9991_drill_drop_metadata_col.up.sql
  - services/backend/migrations/9991_drill_drop_metadata_col.down.sql
  - services/backend/scripts/drill_assert_schema.sh
requirements: [CICD-04]
autonomous: true
estimated_duration: "30-45 min (scaffolding only — drill execution is Plan 04-04)"
tags: [makefile, rollback, drill, migrations, scaffolding]
---

# Plan 04-03b — Top-level Makefile с `make rollback v=N` + drill migration pair 9990/9991 + schema-assertion script

<objective>
Создать scaffolding для CICD-04 rollback drill (live execution = Plan 04-04). Three artifact groups:

1. **NEW top-level `Makefile`** с `rollback v=N` target per RESEARCH §Code Examples §F. Wraps three orthogonal actions (per RESEARCH §Architecture Pattern 5):
   - `git checkout $(v)` — service-binary rollback (revert code к specified tag/SHA)
   - `ssh deploy@<vps-ip> 'docker compose ... migrations down 1'` — DB-state rollback (re-runs `*.down.sql` для most-recent migration)
   - `cd infra/ansible && ansible-playbook -i inventory/prod --tags sport-stack site.yml` — Ansible re-deploys A's binaries
   - Smoke probe (`curl /healthz`) после re-deploy

2. **NEW drill migration pair 9990 + 9991** (per RESEARCH §Open Q 4 — `9990/9991` NOT `0021/0022`, collision-safe с Phase 7 future production migrations):
   - `9990_drill_metadata_col.up.sql` — `ALTER TABLE users ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT NULL` (backward-compatible NULLABLE add per RESEARCH Pitfall 5)
   - `9990_drill_metadata_col.down.sql` — `ALTER TABLE users DROP COLUMN IF EXISTS metadata` (symmetric)
   - `9991_drill_drop_metadata_col.up.sql` — `ALTER TABLE users DROP COLUMN IF EXISTS metadata` (drops the column added in A — drill's `make rollback v=v1.0.0-rc.test-a` undoes this)
   - `9991_drill_drop_metadata_col.down.sql` — `ALTER TABLE users ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT NULL` (re-creates column когда rolling back B)

3. **NEW `services/backend/scripts/drill_assert_schema.sh`** — integration test. Uses `ssh deploy@<vps-ip>` + `docker exec re_postgres psql` to assert that `users.metadata` column exists (after A applied OR after rollback к A) OR does not exist (after B applied). Returns exit 0 on expected state, exit 1 on unexpected. Called by Plan 04-04 to verify drill outcomes.

This plan creates scaffolding ONLY — actual drill execution (`make rollback-drill` OR manual A→B→rollback sequence on prod VPS) = Plan 04-04 (autonomous=false, user-supervised live drill).

Purpose: deliver CICD-04 scaffold (drill machinery ready to fire).
Output: 6 files committed; `make -n rollback v=foo` exits 0 с expected command sequence; SQL migrations lint-clean; assertion script `shellcheck`-clean.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/04-ci-cd-pipeline/04-CONTEXT.md
@.planning/phases/04-ci-cd-pipeline/04-RESEARCH.md
@.planning/phases/04-ci-cd-pipeline/04-PATTERNS.md
@.planning/phases/04-ci-cd-pipeline/04-VALIDATION.md
@services/backend/Makefile
@services/backend/migrations/0014_media.up.sql
@services/backend/migrations/0014_media.down.sql
@services/backend/migrations/0021_featureflags.up.sql
@docs/RUNBOOKS/deploy.md

<interfaces>
<!-- Identifiers + patterns required для top-level Makefile + drill migrations + assertion script -->

**VPS host (Phase 3 deploy.md §1-9 truth):** `deploy@148.253.214.156`. SSH user `deploy` (Phase 3 D-19 — root login disabled, key-only auth, sudo NOPASSWD для `deploy` user per Plan 03-01).

**Migration numbering (RESEARCH §Open Q 4):** **`9990` + `9991`** (NOT `0021+` — collision-safe с Phase 7). Existing top migration: `0021_featureflags.{up,down}.sql` (Phase 1 / Plan 01-03). Phase 7 will consume `0022+` для R18 zero-downtime backfill — picking `9990/9991` (far-future) leaves obvious "drill" semantic marker AND zero collision risk.

**Backward-compat constraint (RESEARCH Pitfall 5):** drill migrations MUST be NULLABLE add / drop only:
- `users.metadata` is JSONB DEFAULT NULL — no constraint violation на existing rows
- No application code reads/writes `users.metadata` (drill column only)
- DROP is `IF EXISTS` — idempotent
- ADD is `IF NOT EXISTS` — idempotent

**Top-level Makefile location:** REPO ROOT — separate от `services/backend/Makefile` (which scopes к backend dev ops only). Rationale per CONTEXT D-16: rollback spans code (git) + DB (migrate) + infra (ansible) — cross-cutting, не backend-only.

**Migration rollback invocation (per Phase 3 deploy.md §6.2 line 208 verbatim):**
```
ssh deploy@<vps-ip> 'cd /opt/sport/services/backend && sudo docker compose --env-file /run/sport.env -f docker-compose.prod.yml run --rm migrations down 1'
```

**Ansible re-deploy (per Phase 3 deploy.md §5.2 + §6.1):**
```
cd infra/ansible && ansible-playbook -i inventory/prod --tags sport-stack site.yml
```

**Smoke probe URL (per Phase 3 deploy.md §4.4):** `https://148-253-214-156.sslip.io/healthz`

**psql introspection idioms для assertion script:**
- `-tA` flags: `-t` tuples-only (no header/footer); `-A` unaligned (CSV-like). Combination = pure value output.
- Existence query: `SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='metadata'` returns `1` if present, empty if not.
- Run via prod container: `ssh deploy@<vps-ip> 'sudo docker exec re_postgres psql -U re -d running_ecosystem -tAc "<query>"'`

**Make `.PHONY` + env-guard + tool-presence patterns (analog: services/backend/Makefile lines 1, 29-30, 47-50, 84-87).**
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: CREATE top-level `Makefile` с `rollback v=N` + `rollback-drill` targets + tool-presence guards</name>
  <files>Makefile (at repo root — NEW)</files>
  <read_first>
    - `.planning/phases/04-ci-cd-pipeline/04-RESEARCH.md` §Code Examples §F lines 962-1020 (full Makefile body)
    - `.planning/phases/04-ci-cd-pipeline/04-PATTERNS.md` §Makefile (top-level, NEW) section lines 214-266
    - `services/backend/Makefile` (analog — `.PHONY` + env-guard + tool-presence patterns: lines 1, 29-30, 47-50, 84-87)
    - `docs/RUNBOOKS/deploy.md` §6.1 + §6.2 (manual rollback procedure that this Makefile wraps verbatim)
  </read_first>
  <action>
    Create new file `Makefile` at REPO ROOT. Composed from RESEARCH §Code Examples §F + analog hygiene from `services/backend/Makefile`.

    Required structure:

    - `.PHONY: help rollback rollback-drill drill-clean`
    - Top-level vars: `VPS_HOST ?= deploy@148.253.214.156` + `SMOKE_URL ?= https://148-253-214-156.sslip.io/healthz`
    - `help:` target — lists targets + points к `services/backend/Makefile` for dev ops
    - `rollback:` target wraps the 4-step sequence (each step `|| exit 1` per RESEARCH §Architecture Pattern 5 atomicity):
      1. Guard: `@test -n "$(v)" || (echo "Usage: make rollback v=<version-tag-or-sha>"; exit 1)`
      2. Tool presence: `@command -v ansible-playbook >/dev/null 2>&1 || { echo "ansible-playbook not installed. brew install ansible"; exit 1; }` + `@command -v curl >/dev/null 2>&1 || ...`
      3. Tag-exists guard: `@git rev-parse --verify $(v) >/dev/null || (echo "Tag/SHA $(v) not found"; exit 1)`
      4. `git checkout $(v)` (announces DETACHED HEAD — caller re-creates branch after drill)
      5. `ssh $(VPS_HOST) 'cd /opt/sport/services/backend && sudo docker compose --env-file /run/sport.env -f docker-compose.prod.yml run --rm migrations down 1'` с `|| (echo "DB rollback failed — recover per deploy.md §7"; exit 1)`
      6. `cd infra/ansible && ansible-playbook -i inventory/prod --tags sport-stack site.yml` с `|| (echo "Ansible re-deploy failed; recover per deploy.md §7"; exit 1)`
      7. `curl -fsS -o /dev/null -w "HTTP %{http_code}\n" $(SMOKE_URL)` с `|| (echo "Smoke probe failed; investigate"; exit 1)`
      8. Final: `@echo "==> Rollback к $(v) complete"`
    - `rollback-drill:` target sequences the 5-step drill scenario per RESEARCH §Code Examples §F lines 997-1019:
      1. `git tag -f v1.0.0-rc.test-a` + `git push -f origin v1.0.0-rc.test-a`
      2. `@read -p "Press Enter после backend-cd green for test-a: "` (waits for CD to publish — Plan 04-04 may swap к `gh run watch` invocation if preferred)
      3. `cd infra/ansible && ansible-playbook -i inventory/prod --tags sport-stack site.yml`
      4. `bash services/backend/scripts/drill_assert_schema.sh expect-present` (Task 3 creates this script)
      5. Repeat для tag B: `git tag -f v1.0.0-rc.test-b` + push + read + ansible + `drill_assert_schema.sh expect-absent`
      6. THE DRILL: `$(MAKE) rollback v=v1.0.0-rc.test-a`
      7. Assertion: `bash services/backend/scripts/drill_assert_schema.sh expect-present` (если present → PASS; absent → FAIL)
    - `drill-clean:` target (optional cleanup — Plan 04-04 Task 6 may invoke):
      - `-git tag -d v1.0.0-rc.test-a v1.0.0-rc.test-b` (leading `-` to ignore errors if tags already deleted)
      - `-git push origin :refs/tags/v1.0.0-rc.test-a :refs/tags/v1.0.0-rc.test-b`
      - `@echo "Drill tags cleaned (drill migrations 9990/9991 remain в tree per user preference — see SUMMARY)"`

    Use Write tool. Important: drill tags use `-f` (force) intentionally — drill may repeat multiple times. NOT a force-push к main (Plan 04-05 branch protection forbids force-push к main; tags are unprotected).

    Commit message: `feat(rollback): add top-level Makefile с rollback v=N + drill scenario (CICD-04 scaffold)`.
  </action>
  <verify>
    <automated>test -f Makefile &amp;&amp; make -n rollback v=foo 2>&amp;1 | head -20 | grep -q 'foo' &amp;&amp; grep -q '^rollback:' Makefile &amp;&amp; grep -q '^rollback-drill:' Makefile &amp;&amp; grep -q 'drill_assert_schema.sh' Makefile &amp;&amp; grep -q 'VPS_HOST ?= deploy@' Makefile &amp;&amp; grep -q 'v1.0.0-rc.test-a' Makefile</automated>
  </verify>
  <acceptance_criteria>
    - File `Makefile` exists at REPO ROOT (not under `services/backend/`)
    - `.PHONY` declares all 4 targets (help/rollback/rollback-drill/drill-clean)
    - `make -n rollback v=foo` exits 0 + dry-run output shows expected command sequence (git rev-parse, git checkout, ssh, ansible-playbook, curl)
    - `make -n rollback` (without `v=`) exits 1 + emits "Usage:" error (env-guard works)
    - `make -n rollback-drill` references both `v1.0.0-rc.test-a` AND `v1.0.0-rc.test-b` AND `drill_assert_schema.sh` AND `$(MAKE) rollback v=v1.0.0-rc.test-a`
    - Each shell-level step in `rollback:` has `|| (echo "...."; exit 1)` clause (atomicity per RESEARCH §Architecture Pattern 5)
    - `VPS_HOST` + `SMOKE_URL` are `?=` (overridable от env — для future staging support deferred к v1.1)
  </acceptance_criteria>
  <done>Top-level Makefile committed; `make -n rollback v=foo` and `make -n rollback-drill` both lint-clean per dry-run inspection.</done>
</task>

<task type="auto">
  <name>Task 2: CREATE drill migration pair 9990 + 9991 (4 files — up + down для each)</name>
  <files>
    services/backend/migrations/9990_drill_metadata_col.up.sql,
    services/backend/migrations/9990_drill_metadata_col.down.sql,
    services/backend/migrations/9991_drill_drop_metadata_col.up.sql,
    services/backend/migrations/9991_drill_drop_metadata_col.down.sql
  </files>
  <read_first>
    - `services/backend/migrations/0014_media.up.sql` (CREATE-style migration body — header-comment convention)
    - `services/backend/migrations/0014_media.down.sql` (single-statement DROP)
    - `services/backend/migrations/0021_featureflags.up.sql` lines 1-16 (Phase/REL annotation + design narrative convention)
    - `.planning/phases/04-ci-cd-pipeline/04-RESEARCH.md` §Common Pitfalls 5 (backward-compat constraint)
    - `.planning/phases/04-ci-cd-pipeline/04-PATTERNS.md` §migrations section lines 305-367
  </read_first>
  <action>
    Создать 4 SQL files в `services/backend/migrations/`. golang-migrate format = `NNNN_<name>.{up,down}.sql` paired files.

    **File 1: `9990_drill_metadata_col.up.sql`** — adds NULLABLE JSONB column. Header per `0021_featureflags.up.sql` convention:

    ```sql
    -- Phase 4 / CICD-04: drill migration A — backward-compatible NULLABLE column add.
    --
    -- Numbered 9990 (NOT 0021+) per RESEARCH §Open Q 4 — collision-safe с Phase 7
    -- production migrations (Phase 7 reserves 0022+ for R18 zero-downtime backfill).
    --
    -- TRANSIENT: drill column для rollback verification. NO application code reads OR
    -- writes users.metadata. Safe к drop at any time. May be removed после drill closes
    -- (per Plan 04-04 Task 6 user preference — default = keep as historical record).
    --
    -- Backward-compat per RESEARCH Pitfall 5: ADD COLUMN IF NOT EXISTS is idempotent;
    -- JSONB DEFAULT NULL imposes no constraint on existing rows.

    ALTER TABLE users ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT NULL;

    COMMENT ON COLUMN users.metadata IS
      'Drill column для CICD-04 rollback drill. Unused by application code. Safe к drop.';
    ```

    **File 2: `9990_drill_metadata_col.down.sql`** — drops the column (symmetric). Single statement per `0014_media.down.sql` convention:

    ```sql
    -- Phase 4 / CICD-04: drill migration A — down.
    -- Symmetric к 9990_drill_metadata_col.up.sql ADD COLUMN.

    ALTER TABLE users DROP COLUMN IF EXISTS metadata;
    ```

    **File 3: `9991_drill_drop_metadata_col.up.sql`** — drops the column added by 9990 (this is the migration that `make rollback v=v1.0.0-rc.test-a` will undo):

    ```sql
    -- Phase 4 / CICD-04: drill migration B — drops the drill column added by 9990.
    --
    -- This is the migration that the DRILL's `make rollback v=v1.0.0-rc.test-a` undoes
    -- (via `migrate down 1` — runs 9991_drill_drop_metadata_col.down.sql which
    -- re-adds the column). Restoring A's schema state.
    --
    -- Idempotent via IF EXISTS — safe к replay.

    ALTER TABLE users DROP COLUMN IF EXISTS metadata;
    ```

    **File 4: `9991_drill_drop_metadata_col.down.sql`** — re-adds the column (when rolling back B). Per RESEARCH Pitfall 5 — drill rollback verifies this restores A's schema:

    ```sql
    -- Phase 4 / CICD-04: drill migration B — down (re-creates column when rolling back B).
    --
    -- Data loss for any rows written between B's deploy и rollback — acceptable
    -- since no real code reads users.metadata (drill column only). For production
    -- migrations, this kind of asymmetric add↔drop would require explicit data
    -- preservation procedure (см. docs/RUNBOOKS/deploy.md §7 для future schema changes).

    ALTER TABLE users ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT NULL;
    ```

    Use Write tool для each file. Commit message: `feat(migrations): add drill migration pair 9990/9991 (CICD-04 scaffold, transient per RESEARCH Pitfall 5)`.
  </action>
  <verify>
    <automated>test -f services/backend/migrations/9990_drill_metadata_col.up.sql &amp;&amp; test -f services/backend/migrations/9990_drill_metadata_col.down.sql &amp;&amp; test -f services/backend/migrations/9991_drill_drop_metadata_col.up.sql &amp;&amp; test -f services/backend/migrations/9991_drill_drop_metadata_col.down.sql &amp;&amp; grep -q 'ADD COLUMN IF NOT EXISTS metadata JSONB' services/backend/migrations/9990_drill_metadata_col.up.sql &amp;&amp; grep -q 'DROP COLUMN IF EXISTS metadata' services/backend/migrations/9990_drill_metadata_col.down.sql &amp;&amp; grep -q 'DROP COLUMN IF EXISTS metadata' services/backend/migrations/9991_drill_drop_metadata_col.up.sql &amp;&amp; grep -q 'ADD COLUMN IF NOT EXISTS metadata JSONB' services/backend/migrations/9991_drill_drop_metadata_col.down.sql</automated>
  </verify>
  <acceptance_criteria>
    - All 4 SQL files exist в `services/backend/migrations/`
    - Migration numbers `9990` AND `9991` (NOT `0021/0022` — RESEARCH §Open Q 4 compliance)
    - File 1 (9990 up) ADDs `metadata JSONB DEFAULT NULL` — NULLABLE per Pitfall 5
    - File 2 (9990 down) DROPs `metadata` — symmetric к File 1
    - File 3 (9991 up) DROPs `metadata` — drops what 9990 added (drill scenario)
    - File 4 (9991 down) ADDs `metadata JSONB DEFAULT NULL` — re-creates when rolling back B (this is what makes `make rollback v=v1.0.0-rc.test-a` succeed)
    - All ADD use `IF NOT EXISTS`, all DROP use `IF EXISTS` (idempotent — safe к replay during drill iterations)
    - Header comments cite Phase 4 / CICD-04 + Pitfall 5 backward-compat justification
    - **Negative check:** no `0021_drill*` or `0022_drill*` files (`ls services/backend/migrations/0021*` returns only existing `0021_featureflags.*` files; no drill prefix collision)
  </acceptance_criteria>
  <done>4 drill migrations committed; ready для Plan 04-04 live deploy + rollback drill on prod VPS.</done>
</task>

<task type="auto">
  <name>Task 3: CREATE `services/backend/scripts/drill_assert_schema.sh` — psql introspection via SSH-к-prod, expect-present / expect-absent modes</name>
  <files>services/backend/scripts/drill_assert_schema.sh</files>
  <read_first>
    - `services/backend/scripts/` (existing scripts — verify directory convention)
    - `services/backend/Makefile` lines 80-82 (`check-routes` shell pattern), 84-87 (`scan-secrets` tool-presence guard pattern)
    - `docs/RUNBOOKS/deploy.md` §6.2 (existing ssh-deploy-к-prod psql invocation pattern)
  </read_first>
  <action>
    Create new file `services/backend/scripts/drill_assert_schema.sh`. Single-purpose shell script: asserts `users.metadata` column presence via SSH к prod VPS + `docker exec re_postgres psql` introspection.

    Body:

    ```bash
    #!/usr/bin/env bash
    # services/backend/scripts/drill_assert_schema.sh
    # Phase 4 / CICD-04 — drill scenario schema assertion.
    #
    # Usage:
    #   bash drill_assert_schema.sh expect-present   # exit 0 if users.metadata exists, exit 1 if absent
    #   bash drill_assert_schema.sh expect-absent    # exit 0 if users.metadata absent, exit 1 if present
    #
    # Called by Makefile rollback-drill target + by user-supervised drill в Plan 04-04.

    set -euo pipefail

    EXPECTATION="${1:-}"
    VPS_HOST="${VPS_HOST:-deploy@148.253.214.156}"

    if [[ "$EXPECTATION" != "expect-present" && "$EXPECTATION" != "expect-absent" ]]; then
      echo "Usage: $0 {expect-present|expect-absent}" >&2
      echo "       (VPS_HOST override via env: VPS_HOST=deploy@<ip> bash $0 expect-present)" >&2
      exit 1
    fi

    command -v ssh >/dev/null 2>&1 || { echo "ssh not installed"; exit 1; }

    echo "==> Querying prod DB ($VPS_HOST) для users.metadata column existence..."

    # information_schema.columns returns 1 if column exists, empty if not.
    # psql -tA = tuples-only + unaligned = pure value output.
    RESULT=$(ssh "$VPS_HOST" "sudo docker exec re_postgres psql -U re -d running_ecosystem -tAc \"SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='metadata'\"")

    # Trim whitespace
    RESULT_TRIMMED=$(echo "$RESULT" | tr -d '[:space:]')

    if [[ "$EXPECTATION" == "expect-present" ]]; then
      if [[ "$RESULT_TRIMMED" == "1" ]]; then
        echo "✓ ASSERTION PASS: users.metadata IS PRESENT (expected present)"
        exit 0
      else
        echo "✗ ASSERTION FAIL: users.metadata IS ABSENT (expected present)" >&2
        echo "  (psql returned: '$RESULT_TRIMMED')" >&2
        exit 1
      fi
    else  # expect-absent
      if [[ -z "$RESULT_TRIMMED" ]]; then
        echo "✓ ASSERTION PASS: users.metadata IS ABSENT (expected absent)"
        exit 0
      else
        echo "✗ ASSERTION FAIL: users.metadata IS PRESENT (expected absent)" >&2
        echo "  (psql returned: '$RESULT_TRIMMED')" >&2
        exit 1
      fi
    fi
    ```

    After Write, mark executable:
    ```bash
    chmod +x services/backend/scripts/drill_assert_schema.sh
    ```

    Commit message: `feat(scripts): add drill_assert_schema.sh для CICD-04 drill outcome verification`.
  </action>
  <verify>
    <automated>test -x services/backend/scripts/drill_assert_schema.sh &amp;&amp; bash -n services/backend/scripts/drill_assert_schema.sh &amp;&amp; (command -v shellcheck &gt;/dev/null 2>&amp;1 &amp;&amp; shellcheck services/backend/scripts/drill_assert_schema.sh || echo "(shellcheck not installed — bash -n syntax check passed)") &amp;&amp; (bash services/backend/scripts/drill_assert_schema.sh 2>&amp;1 | grep -q 'Usage:') &amp;&amp; (bash services/backend/scripts/drill_assert_schema.sh foo 2>&amp;1 | grep -q 'Usage:')</automated>
  </verify>
  <acceptance_criteria>
    - File `services/backend/scripts/drill_assert_schema.sh` exists + executable bit set (`-x` test passes)
    - `bash -n` syntax check exits 0 (no Bash syntax errors)
    - `shellcheck` exits 0 if installed (warnings acceptable; errors not)
    - Usage error: `bash drill_assert_schema.sh` (no arg) exits 1 + prints "Usage:"
    - Usage error: `bash drill_assert_schema.sh foo` (invalid arg) exits 1 + prints "Usage:"
    - Script handles both `expect-present` and `expect-absent` modes
    - `VPS_HOST` overridable от env (matches Makefile pattern)
    - Uses `psql -tA` flags (tuples-only + unaligned) для clean value output
    - Uses `information_schema.columns` query (portable PostgreSQL introspection — works on any TimescaleDB+PG16 setup)
  </acceptance_criteria>
  <done>drill_assert_schema.sh committed + executable; ready для Plan 04-04 to invoke via Makefile rollback-drill OR directly during user-supervised drill.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| dev workstation → prod VPS via SSH | Makefile rollback target SSHes к prod for migrate-down. Auth via existing `~/.ssh/<deploy-key>`; not introduced by this plan. |
| Drill migrations → production users table | ALTER TABLE ADD/DROP COLUMN affects real schema. Backward-compat constraint per RESEARCH Pitfall 5 (NULLABLE + IF EXISTS/IF NOT EXISTS) ensures aborted drill leaves valid state. |
| Make target chain → automation | Each rollback step has `|| exit 1` (atomicity); if any step fails, subsequent steps don't run (no partial state from this script's perspective — prod side may need manual recovery per deploy.md §7). |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-04-04 | Tampering + Availability | `make rollback` fails partway через 4-step sequence → prod stuck в inconsistent state | mitigate | Each shell step has explicit `\|\| (echo "<context>"; exit 1)` per RESEARCH §Architecture Pattern 5. Failure messages cite `deploy.md §7` failure-mode table для recovery procedure. Plan 04-04 Task 4 + Task 5 verify post-drill schema via `drill_assert_schema.sh` (integration test asserts atomicity actually held). HIGH. |
| T-04-DRILL-SCHEMA | Information disclosure / Data integrity | Drill migration touches production users table → unintended side-effect | mitigate | Backward-compat constraint (RESEARCH Pitfall 5) — NULLABLE column add/drop only; no DML; no FK changes; no INDEX. No application code reads/writes the column (verified via grep — `grep -r 'metadata' services/backend/` returns matches только в Phase 1 featureflags + non-related — sanity-check in Plan 04-04 Task 1 before tagging A). MEDIUM. |

**Block-on-high gate:** One HIGH-severity threat (T-04-04), mitigated via per-step atomicity + integration test. `block_on: high` satisfied.
</threat_model>

<must_haves>
  truths:
    - "D-16: `make rollback v=N` Make target в NEW top-level `Makefile` — wraps git checkout + ssh-к-prod migrate-down + ansible-playbook + smoke probe"
    - "D-17: drill scenario — A (NULLABLE add) → B (drop) → rollback к A → verify column re-present; tagged `v1.0.0-rc.test-{a,b}`"
    - "D-18: drill target = existing prod VPS (148.253.214.156) — no staging exists (Phase 3 D-23 deferred v1.1); backward-compat per Pitfall 5 mitigates risk"
    - "RESEARCH §Open Q 4 applied: drill migration numbering `9990/9991` (NOT `0021/0022`) — collision-safe с Phase 7 future migrations"
    - "RESEARCH Pitfall 5 applied: backward-compatible NULLABLE add/drop only — if drill aborts mid-way prod stays valid"
    - "RESEARCH §Architecture Pattern 5 applied: each `make rollback` step has `\|\| exit 1` clause — atomicity through abort-on-error"
    - "RESEARCH §Code Examples §F verbatim — Makefile body composed from research, не hand-rolled"
  behaviors:
    - "`make -n rollback v=foo` exits 0 + dry-run shows command sequence (git rev-parse, git checkout, ssh, ansible, curl)"
    - "`make -n rollback` (без `v=`) exits 1 + prints 'Usage:' (env-guard works)"
    - "`make -n rollback-drill` references drill_assert_schema.sh + both test-a + test-b tags + recursive `$(MAKE) rollback`"
    - "`bash -n services/backend/scripts/drill_assert_schema.sh` exits 0 (syntax clean)"
    - "Drill migration pair 9990/9991 exists в `services/backend/migrations/` (NOT 0021/0022)"
    - "All ADD use `IF NOT EXISTS`; all DROP use `IF EXISTS` (idempotency for drill iteration)"
  forbidden:
    - "NO drill migrations numbered `0021+` (would collide с Phase 7 production migrations per RESEARCH §Open Q 4)"
    - "NO destructive operations (DROP TABLE, DROP DATABASE, etc.) в drill migrations — only ALTER TABLE ADD/DROP COLUMN"
    - "NO application-code dependency on `users.metadata` column (it's intentionally unused — drill-only)"
    - "NO rollback step lacking `|| exit 1` failure-mode clause (atomicity hard requirement)"
    - "NO live drill execution в this plan (that's Plan 04-04 — autonomous=false — supervised live drill)"
    - "NO modification к `services/backend/Makefile` (different scope; top-level Makefile is new and separate)"
</must_haves>

<verification>
- `test -f Makefile` (top-level) — exists
- `make -n rollback v=foo` exits 0; output contains `git checkout foo`, `ssh deploy@`, `ansible-playbook`, `curl`
- `make -n rollback 2>&1 | grep -q 'Usage:'` (env-guard works)
- `make -n rollback-drill 2>&1 | grep -q 'v1.0.0-rc.test-a'` (drill flow references correct tag)
- 4 drill SQL files exist (9990 up/down, 9991 up/down)
- `grep -c 'ALTER TABLE users' services/backend/migrations/999[01]_drill*.sql` returns 4 (one per file)
- `bash -n services/backend/scripts/drill_assert_schema.sh` exits 0
- `bash services/backend/scripts/drill_assert_schema.sh 2>&1 | grep -q Usage` (no-arg case prints Usage)
- 04-03b-SUMMARY confirms: top-level Makefile + drill migrations + assertion script ready; live drill happens в Plan 04-04
</verification>

<success_criteria>
1. CICD-04 scaffolding complete: top-level `Makefile` exposes `rollback v=N` + `rollback-drill` targets.
2. Drill migration pair `9990` + `9991` exists в `services/backend/migrations/`, backward-compatible per RESEARCH Pitfall 5.
3. `drill_assert_schema.sh` ready для drill outcome verification (called by Plan 04-04 Tasks 2 + 4).
4. All 6 files committed; ready для Plan 04-04 live execution.
</success_criteria>

<output>
After completion, create `.planning/phases/04-ci-cd-pipeline/04-03b-SUMMARY.md` recording:
- All 6 files created (paths verbatim)
- `make -n rollback v=foo` dry-run output verbatim (proves Makefile structure)
- Drill migration numbering chosen `9990/9991` per RESEARCH §Open Q 4 (cite reason: collision-safe с Phase 7)
- Bash-syntax check + (optional) shellcheck result для drill_assert_schema.sh
- Confirmation that live drill execution = Plan 04-04 (NOT this plan — this is scaffolding only)
- Reminder for Plan 04-04: drill execution will require user-supervised live mutation on prod VPS — recommend 10-min cutover window когда no active testers (RESEARCH Architectural Responsibility Map A3)
</output>
