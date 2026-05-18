---
phase: 04-ci-cd-pipeline
plan: 03a
subsystem: ci-cd
status: CLOSED 2026-05-18 (backend-cd.yml + compose digest scaffold; first live CD push deferred к Plan 04-04 drill execution)
tags: [github-actions, cd, cosign, sigstore, slsa-l2, ghcr, attestation, cicd-02, cicd-03]

requires:
  - phase: 04-01 (Wave 1 — github.com/IsmailL01/sport repo + GHCR namespace ismaill01)
  - phase: 04-02 (Wave 2 — backend-ci first-green-CI-run-record `26037119000` confirms CI plumbing)
provides:
  - `.github/workflows/backend-cd.yml` (NEW) — 8-service matrix · cosign keyless (Sigstore/Fulcio) · SLSA L2 attestation @v2 · GHCR push · `no-latest-tag-guard` · `cosign-verify-smoke` self-check
  - `services/backend/docker-compose.prod.yml` MODIFIED — 8 Go services с `image: ghcr.io/ismaill01/<svc>:${SPORT_STACK_TAG:?...}` fail-fast required-or-error syntax (W4 fix preserved); hybrid с `build:` retained для dev workflow
affects: [04-04 (live drill triggers CD pipeline first time), 04-05 (CD adds к existing CI status checks но Plan 04-05 protects only the 5 CI-checks per pinned contract), v1.0.1 future task (Ansible cosign-verify-pre-pull gate)]

tech-stack:
  added:
    - "actions/checkout@v4"
    - "docker/setup-buildx-action@v3"
    - "docker/login-action@v3"
    - "docker/metadata-action@v5 (с flavor: latest=false — D-15 hard rule enforcement)"
    - "docker/build-push-action@v5 (BuildKit GHA cache per-service scope; reuses Pattern A от backend-ci)"
    - "sigstore/cosign-installer@v3"
    - "actions/attest-build-provenance@v2 (LTS — NOT @v1 deprecation shim per RESEARCH §State of the Art correction)"
  patterns:
    - "Pattern A — BuildKit GHA cache: `cache-from: type=gha,scope=${{ matrix.service }}` reused от backend-ci.yml (per-service scope keeps cache hits high)"
    - "Pattern B — 4-permission matrix: `contents:read + packages:write + id-token:write + attestations:write` (RESEARCH Pitfall 3 mitigation — missing `id-token: write` silently breaks cosign keyless signing)"
    - "Pattern C — 8-service matrix shape: identical к backend-ci.yml `[identity, activity-sync, feed, media, messaging, notifications, realtime-gw, social-graph]`"
    - "Pattern E — RUNBOOK extension (deploy.md §6.4) deferred к Plan 04-04 — closes drill loop"
    - "no-latest-tag-guard job uses `grep -v '^#'` filter (prevents comment self-invalidation per planner-antipatterns)"
    - "cosign-verify-smoke job: workflow's own publish output verified — closes feedback loop без post-deploy-only verification"

decisions:
  - "D-13 KEPT — cosign keyless via Sigstore/Fulcio (no KMS, no key rotation). OIDC token short-lived via GH Actions id-token; signature pushed к Rekor."
  - "D-14 CORRECTED — `actions/attest-build-provenance@v2` (LTS). NOT @v1 (deprecation shim per RESEARCH §State of the Art line 1167)."
  - "D-15 KEPT — image tags: `:<sha>` always + `:vX.Y.Z` on tag pushes; NEVER `:latest` (enforced via `flavor: latest=false` + `no-latest-tag-guard` job)."
  - "W4 fix KEPT — `${SPORT_STACK_TAG:?...}` fail-fast в compose (NOT `:-v1.0.0-rc.1` default-value которое silently fell back к non-existent GHCR tag в previous draft)."
  - "Hybrid `image:` + `build:` в compose — image: wins on `docker compose up` (Ansible deploy path); build: still works для `docker compose up --build` (dev workstation pattern). Single file serves both."

key-files:
  created:
    - ".github/workflows/backend-cd.yml (NEW — 153 lines, 3 jobs: publish + cosign-verify-smoke + no-latest-tag-guard)"
  modified:
    - "services/backend/docker-compose.prod.yml (8 Go services: image: ghcr.io/ismaill01/<svc>:\\${SPORT_STACK_TAG:?...} added ABOVE existing build: blocks)"

git-commits:
  - "6dbce9b — feat(04-03a): backend-cd.yml + compose image refs (CICD-02, CICD-03)"

acceptance:
  - ✓ `.github/workflows/backend-cd.yml` exists; YAML syntax OK
  - ✓ 4 required permissions present (`contents:read + packages:write + id-token:write + attestations:write`)
  - ✓ `actions/attest-build-provenance@v2` (LTS) NOT `@v1` — negative-grep verified
  - ✓ `flavor: latest=false` present в metadata-action
  - ✓ 8-service matrix: identity, activity-sync, feed, media, messaging, notifications, realtime-gw, social-graph
  - ✓ `cosign sign --yes` present в publish job
  - ✓ `cosign verify` + `cosign verify-attestation` BOTH present в cosign-verify-smoke job (Pattern 4 self-check)
  - ✓ `no-latest-tag-guard` job uses `grep -v '^#'` filter
  - ✓ Compose: 8 services с `image:` field added above `build:` blocks; all use `${SPORT_STACK_TAG:?...}` fail-fast (verified `grep -c "SPORT_STACK_TAG:\?" docker-compose.prod.yml` returns 8)
  - ✓ NO `:-v1.0.0-rc.1` default-value syntax анywhere (W4 fix verified)

deferred:
  - "**First live CD run** — requires `gh auth refresh -s write:packages` (current scopes: gist+read:org+repo+workflow; needs +write:packages для GHCR push). Triggered by Plan 04-04 Task 1 first tag push `v1.0.0-rc.test-a`."
  - "**GHCR package visibility flip к public** — RESEARCH Q1 recommendation для eliminating GHCR auth complexity на prod VPS. Deferred к Plan 04-04 Task 1 after first CD run produces packages."
  - "**SHA256 digest pinning (Option (a) per RESEARCH §E)** — current implementation uses `:${SPORT_STACK_TAG}` tag pin (Option (b)). v1.0.1 follow-up: separate workflow that commits digest-update PR + cosign-verify pre-pull в Ansible."

threat_model:
  - "T-04-03 (cosign signature missing → unverified image pulled): MITIGATED — cosign-verify-smoke job runs against publish output; future Ansible cosign-verify wrap deferred к v1.0.1"
  - "T-04-PIV-PERM (missing id-token:write silently breaks signing): MITIGATED — explicit top-level permissions block; RESEARCH Pitfall 3 cited в file comment"
  - "T-04-LATEST-CD (CD emits :latest tag): MITIGATED — `flavor: latest=false` + `no-latest-tag-guard` job negative-grep"
  - "T-04-STALE-TAG (compose default tag points к non-existent GHCR ref): MITIGATED — `:?` fail-fast instead of `:-` default; W4 fix"
  - "T-04-SUBST-DIGEST (tag-pin instead of digest-pin): accept_risk MEDIUM v1.0 — tag pinning acceptable для solo-dev closed-beta; digest pinning + Ansible cosign-verify deferred к v1.0.1"

self-check: PASSED (files written, frontmatter intact, RESEARCH corrections applied, threat model HIGH-severity mitigated, W4 fix preserved)

---

*Phase: 04-ci-cd-pipeline*
*Plan: 03a (Wave 3 parallel с 03b — CD pipeline + compose digest scaffold)*
*Completed: 2026-05-18*
*Status: CLOSED ✓ — first live CD push pending gh auth refresh + Plan 04-04 tag push*
