---
phase: 04-ci-cd-pipeline
plan: 03b
subsystem: ci-cd
status: CLOSED 2026-05-18 (Wave 3b scaffolding — drill execution в Plan 04-04)
tags: [makefile, rollback, drill, migrations, scaffolding, cicd-04]

requires:
  - phase: 04-02 (Wave 2 — completed parallel; CI verifies migrations don't break tests)
  - phase: 03 (Ansible deploy seam — sport-stack role consumed via make rollback step 6)
provides:
  - Top-level `Makefile` с `rollback v=N` + `rollback-drill` + `drill-clean` targets
  - Drill migration pair 9990/9991 (4 SQL files) — backward-compatible NULLABLE add/drop users.metadata
  - `services/backend/scripts/drill_assert_schema.sh` executable — psql introspection via SSH
affects: [04-04 (live drill execution invokes Makefile), 04-05 (no direct dep), 04-06 (deploy.md §11 freeze Path #3 references make rollback)]

tech-stack:
  added:
    - "Top-level Makefile (NEW) — rollback automation entry point"
    - "Drill migrations 9990/9991 (golang-migrate format)"
    - "drill_assert_schema.sh (psql-via-ssh introspection)"
  patterns:
    - "Atomic Make target: per-step '|| (echo ...; exit 1)' (RESEARCH §Architecture Pattern 5)"
    - "Backward-compat drill schema: NULLABLE ADD/DROP — safe abort if drill fails mid-way (RESEARCH Pitfall 5)"
    - "Drill numbering 9990/9991 (NOT 0021/0022) — collision-safe с Phase 7 production migrations (RESEARCH §Open Q 4)"
    - "VPS_HOST + SMOKE_URL overridable via env (?= operator) — future staging support v1.1"

key-files:
  created:
    - "Makefile (NEW top-level — 5.7K, 4 targets: help/rollback/rollback-drill/drill-clean)"
    - "services/backend/migrations/9990_drill_metadata_col.up.sql (ADD NULLABLE column)"
    - "services/backend/migrations/9990_drill_metadata_col.down.sql (DROP column)"
    - "services/backend/migrations/9991_drill_drop_metadata_col.up.sql (DROP column — drill scenario migration B)"
    - "services/backend/migrations/9991_drill_drop_metadata_col.down.sql (ADD column — what rollback executes)"
    - "services/backend/scripts/drill_assert_schema.sh executable (psql-via-ssh schema introspection)"

git-commits:
  - "767c123 — feat(04-03b): Wave 3b — top-level Makefile + drill migrations 9990/9991 + assert script"

acceptance:
  - ✓ `test -f Makefile` (top-level) — exists
  - ✓ `make -n rollback v=foo` exits 0; dry-run shows expected command sequence (rev-parse, checkout, ssh migrate down, ansible-playbook, curl)
  - ✓ `make -n rollback` (без v=) emits "Usage:" + exits 1 (env-guard works)
  - ✓ `make -n rollback-drill` references v1.0.0-rc.test-a, v1.0.0-rc.test-b, drill_assert_schema.sh
  - ✓ All 4 drill SQL files exist в services/backend/migrations/
  - ✓ Migration numbers 9990 + 9991 (NOT 0021/0022 — collision-safe per RESEARCH §Open Q 4)
  - ✓ ADD use IF NOT EXISTS, DROP use IF EXISTS (idempotent — safe к replay)
  - ✓ `bash -n drill_assert_schema.sh` syntax check passes
  - ✓ Script executable bit set (`-x` test passes; mode 755)
  - ✓ Usage error: `bash drill_assert_schema.sh` (no arg) exits 1 + prints Usage; `bash ... foo` also exits 1 с Usage

drill-readiness:
  - "All scaffolding в place для Plan 04-04 live execution на prod VPS (148.253.214.156)"
  - "Pre-flight Plan 04-04 requires: backend-cd.yml ready (Plan 04-03a) + GHCR write:packages scope (gh auth refresh)"
  - "Drill exposure window: ~10 min wall-clock; backward-compat migrations make abort-safe per RESEARCH Pitfall 5"

self-check: PASSED (3 tasks complete; ready для Plan 04-04 live drill)

---

*Phase: 04-ci-cd-pipeline*
*Plan: 03b (Wave 3 scaffolding — drill execution в Plan 04-04)*
*Completed: 2026-05-18*
*Status: CLOSED ✓ — Plan 04-04 unblocked once 04-03a + Wave 2 complete*
