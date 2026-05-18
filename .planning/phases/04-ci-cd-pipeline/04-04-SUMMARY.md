---
phase: 04-ci-cd-pipeline
plan: 04
subsystem: ci-cd
status: CLOSED 2026-05-18 (live rollback drill PASS — CICD-04 acceptance + pivoted к save/scp/load image transfer)
tags: [drill, rollback, cicd-04, cicd-02, save-scp-load, gh-attestation, ansible, makefile]

requires:
  - phase: 04-01 (Wave 1 — GH repo at IsmailL01/sport)
  - phase: 04-02 (Wave 2 — backend-ci 8-service matrix + scanners green)
  - phase: 04-03a (Wave 3a — backend-cd.yml: cosign keyless + SLSA L2 + GHCR push)
  - phase: 04-03b (Wave 3b — Makefile + drill migrations 9990/9991 + assert script)
provides:
  - **CICD-02 acceptance** — local cosign/SLSA verification proven: 16/16 PASS via `gh attestation verify` (GitHub TSA, not Rekor — `actions/attest-build-provenance@v2` issues TSA-bundled signatures)
  - **CICD-04 acceptance** — live drill PASS: 3-stage assertion sequence (A: PRESENT → B: ABSENT → rollback: PRESENT) on prod 148.253.214.156
  - `infra/ansible/roles/sport-stack/tasks/transfer_images.yml` NEW — controller-side docker pull + gh-attest verify + docker save | gzip → synchronize → remote docker load (8 services); skips when sport_stack_tag undefined
  - `infra/ansible/roles/sport-stack/defaults/main.yml` EXTENDED — sport_services_with_image, sport_image_registry, sport_image_remote_dir, sport_image_local_stage_dir, sport_image_verify_enabled
  - `infra/ansible/roles/sport-stack/templates/sport.env.j2` EXTENDED — writes SPORT_STACK_TAG=<semver-stripped> when sport_stack_tag set
  - `infra/ansible/roles/sport-stack/tasks/{main,run_migrations}.yml` — `run-migrations` tag added для selective skip during rollback
  - `Makefile` rollback target REWRITTEN — pre-flight images-present check (fail-fast if <8 of 8 on prod); migrate down 1 uses grep-extracted POSTGRES_PASSWORD (sport.env has `<placeholder>` values incompatible with `set -a; .`); ansible re-deploy uses `--skip-tags=run-migrations` (prevents re-applying rolled-back migration via stale rsynced files)
  - `docs/RUNBOOKS/deploy.md` §5 + §6.1-6.5 REWRITTEN — save/scp/load flow, drill log table (§6.4), GHCR-pull v1.0.1 deferral note (§6.5)
  - `.planning/phases/04-ci-cd-pipeline/04-04-evidence-{digests.txt,gh-verify.log}` NEW — 16 image digests + per-image JSON verification result (timestamp.githubapp.com TSA, sourceRepositoryURI, githubWorkflowSHA, statement subject digest)
affects: [04-05 (no direct dep), 04-06 (deploy.md §11 freeze docs), v1.0.1 follow-ups (GHCR pull auth setup, rsync --delete для migrations)]

tech-stack:
  added:
    - "`gh attestation verify --owner IsmailL01 --signer-repo IsmailL01/sport oci://...`"
    - "`docker save | gzip` → `ansible.posix.synchronize` → `docker load -i` transport stack"
    - "Makefile rollback step [2/6] — pre-flight images count via `ssh ... docker images | grep -c`"
  patterns:
    - "Pattern A — `delegate_to: localhost` для controller-side pull + verify + save (re-used from Phase 3 D-12 SOPS-decrypt pattern)"
    - "Pattern B — `--platform=linux/amd64` для docker pull on arm64 Mac controllers (prod VPS is amd64; emulation handles save artifact correctly)"
    - "Pattern C — `--skip-tags=run-migrations` during rollback (explicit `migrate down 1` already ran; ansible's `migrate up` would re-apply via rsynced obsolete migration files)"

decisions:
  - "**D-04-04-A — save/scp/load image transport** (NEW, Wave 4 pivot 2026-05-18 mid-execution): GHCR personal-account package visibility flip requires web UI (REST API gap); direct prod pull blocked. Chose controller→prod save/scp/load over (a) manual web-UI flip (security debt for closed-beta acceptable, but adds 8-package manual step) and (b) long-lived PAT on prod (secret-of-secret bootstrap problem). Trade-off: +5 min wall-clock per deploy vs zero prod-side auth complexity."
  - "**D-04-04-B — gh attestation verify > cosign verify locally**: local cosign 3.0.6 cannot validate `attest-build-provenance@v2` bundles because Sigstore TUF trusted-root lacks GitHub TSA chain (timestamp.githubapp.com). `gh` CLI's embedded sigstore-go library handles it natively. Cosign verify still works inside CD pipeline (`cosign-installer@v3` uses compatible trusted-root)."
  - "**D-04-04-C — re-target local tag v1.0.0-rc.test-a после Ansible cherry-pick**: drill-state-a HEAD (4e7872a) pre-dates transfer_images.yml + Makefile fixes. Cherry-picked b6c9b6d into drill-state-a + force-updated local tag (no push — GHCR images keyed by tag-string match, not SHA). Resulting state: tag points to checkoutable commit with full deploy toolchain."

key-files:
  created:
    - "infra/ansible/roles/sport-stack/tasks/transfer_images.yml (NEW — 113 lines, 10 tasks)"
    - ".planning/phases/04-ci-cd-pipeline/04-04-evidence-digests.txt (NEW — 16 image digests)"
    - ".planning/phases/04-ci-cd-pipeline/04-04-evidence-gh-verify.log (NEW — per-image JSON proof)"
    - ".planning/phases/04-ci-cd-pipeline/04-04-SUMMARY.md (this file)"
  modified:
    - "infra/ansible/roles/sport-stack/defaults/main.yml (+27 lines transfer-images defaults)"
    - "infra/ansible/roles/sport-stack/tasks/main.yml (+5 lines transfer-images import + run-migrations tag)"
    - "infra/ansible/roles/sport-stack/tasks/run_migrations.yml (run-migrations tag added)"
    - "infra/ansible/roles/sport-stack/templates/sport.env.j2 (+3 lines SPORT_STACK_TAG injection)"
    - "Makefile rollback target rewritten — 5 → 6 steps; grep-based DATABASE_URL; --skip-tags=run-migrations"
    - "docs/RUNBOOKS/deploy.md §5 + §6 — save/scp/load flow + drill log + GHCR-pull v1.0.1 note"

git-commits:
  - "b6c9b6d — feat(04-04): save/scp/load image transfer + verify evidence"
  - "9724197 — docs(04-04): attach gh-attest verify JSON evidence (16/16 PASS)"
  - "(pending) docs(04-04): Plan 04-04 SUMMARY + deploy.md §5+§6 rewrite + Makefile rollback fixes"

acceptance:
  CICD-02 (cosign/SLSA verifiable outside CI):
    - ✓ 16/16 images verify via `gh attestation verify --owner IsmailL01 --signer-repo IsmailL01/sport oci://...`
    - ✓ Per-image JSON evidence captured: sourceRepositoryURI=https://github.com/IsmailL01/sport, githubWorkflowName=backend-cd, ts=timestamp.githubapp.com
    - ⚠ CD workflow's own cosign-verify-smoke job still fails (UNAUTHORIZED — packages private) — separate from CICD-02 acceptance; tracked в Carry-forward
  CICD-04 (rollback drill with real DB migration):
    - ✓ pg_dump backup taken before drill (/tmp/pre-drill-backup-20260518-174447.sql.gz, ~65 KB)
    - ✓ Stage A: deploy v1.0.0-rc.test-a → migrate up 9990 → users.metadata PRESENT (drill_assert_schema.sh expect-present PASS, smoke HTTP 202)
    - ✓ Stage B: deploy v1.0.0-rc.test-b → migrate up 9991 → users.metadata ABSENT (drill_assert_schema.sh expect-absent PASS, smoke HTTP 202, schema_migrations.version=9991)
    - ✓ Stage Rollback: migrate down 1 + ansible --skip-tags=run-migrations → users.metadata PRESENT (drill_assert_schema.sh expect-present PASS, smoke HTTP 202 + HTTP 200 /healthz, schema_migrations.version=9990)
    - ✓ Drill exposure window: ~12 min wall-clock total (3 deploys × ~5 min — image transfer dominates; future cached deploys ~30s)
  Image transfer infrastructure:
    - ✓ transfer_images.yml syntactically valid (ansible-playbook --syntax-check passes)
    - ✓ Pre-flight images-count check works correctly (verified 8/8 present)
    - ✓ Per-image cosign+SLSA verify gate (sport_image_verify_enabled=true default) — 16 of 16 PASS

drill-evidence-summary:
  pg_dump_backup: "/tmp/pre-drill-backup-20260518-174447.sql.gz on prod (~65 KB)"
  baseline_state:
    users_metadata_present: false
    schema_migrations_max: 21
  stage_a:
    tag: v1.0.0-rc.test-a
    commit: 1681f64 (drill-state-a + transfer_images cherry-pick; tag locally re-targeted)
    migration_applied: 9990 (ADD COLUMN users.metadata JSONB DEFAULT NULL)
    assert: users.metadata IS PRESENT — PASS
    smoke: HTTP 202 (Caddy + identity reachable)
  stage_b:
    tag: v1.0.0-rc.test-b
    commit: 0db67d8 (feat/cursona-redesign tip at drill setup time)
    migration_applied: 9991 (DROP COLUMN users.metadata)
    assert: users.metadata IS ABSENT — PASS
    smoke: HTTP 202
  stage_rollback:
    method: "migrate down 1 (revert 9991) + ansible-playbook --skip-tags=run-migrations -e sport_stack_tag=v1.0.0-rc.test-a"
    migration_reverted: "9991/d drill_drop_metadata_col (20ms)"
    assert: users.metadata IS PRESENT — PASS
    smoke: HTTP 202 + HTTP 200 /healthz
    schema_migrations_max: 9990

threat_model:
  - "T-04-04-SCHEMA-FORWARD-INCOMPAT (apps fail after schema reverted because rolled-back code expects newer schema): MITIGATED — drill migrations 9990/9991 chosen backward-compat (NULLABLE add/drop, no app code reads users.metadata). Same pattern enforced in Phase 7 R18 (RESEARCH Pitfall 5)."
  - "T-04-04-STALE-MIGRATIONS (rsync delete:false leaves obsolete migration files on prod; ansible migrate up re-applies them after explicit down): MITIGATED post-discovery — `--skip-tags=run-migrations` in Makefile rollback target. v1.0.1 follow-up: rsync --delete for migrations subtree only."
  - "T-04-04-DB-URL-BREAK (sport.env placeholder values break `set -a; .` sourcing for ad-hoc migrate down): MITIGATED — Makefile + deploy.md §6.2 use grep-based POSTGRES_PASSWORD extract."
  - "T-04-04-VERIFY-GAP (local cosign 3.0.6 cannot validate v2 attest-build-provenance bundles): MITIGATED — `gh attestation verify` adopted as canonical local verify tool (it embeds GitHub TSA chain). Documented in deploy.md §5.1."

deferred (v1.0.1 follow-ups):
  - "GHCR direct-pull from prod — current save/scp/load adds ~5 min per deploy. Options: (a) flip 8 packages public via web UI; (b) short-lived registry-token via Ansible delegate_to localhost. Tracked в ROADMAP backlog debt-item GHCR-PULL-AUTH."
  - "rsync --delete for migrations subtree only — eliminate need для --skip-tags=run-migrations + manual migration-file cleanup on prod. Currently mitigated, but design fragility remains."
  - "metadata-action `pattern={{raw}}` for semver tags — preserve `v` prefix in GHCR tag-string (currently `1.0.0-rc.test-a` is published; raw git tag is `v1.0.0-rc.test-a`). Doc'd inconsistency in transfer_images.yml header."
  - "CD workflow cosign-verify-smoke job still fails on UNAUTHORIZED for private packages — `cosign verify` inside the workflow needs `--allow-insecure-registry=false` + workflow-token auth setup. Currently overridden by manual `gh attestation verify` (this Plan's CICD-02 evidence). Either fix workflow auth OR retire job in favor of post-publish OCI referrer check."
  - "SHA256 digest pinning в docker-compose — current SPORT_STACK_TAG=<semver-stripped> tag-pin (mutable). digest-pin would require committed `compose.lock.yml` per tag (v1.0.1)."

self-check: PASSED (all 5 tasks complete; drill PASS proven on prod; evidence files committed; deploy.md + Makefile + Ansible all updated)

---

*Phase: 04-ci-cd-pipeline*
*Plan: 04 (Wave 4 — live rollback drill execution + save/scp/load image transport pivot)*
*Completed: 2026-05-18*
*Status: CLOSED ✓ — CICD-02 + CICD-04 acceptance + transport pivot to direct SSH save/scp/load*
