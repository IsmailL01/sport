---
plan_id: 04-03a
phase: 4
phase_slug: ci-cd-pipeline
wave: 3
depends_on: [04-02]
files_modified:
  - .github/workflows/backend-cd.yml
  - services/backend/docker-compose.prod.yml
requirements: [CICD-02, CICD-03]
autonomous: false
estimated_duration: "60-90 min (включая first CD run supervision если cosign keyless setup encounters Pitfall 3)"
tags: [cd, cosign, slsa, ghcr, image-signing, attestation]
---

# Plan 04-03a — Create backend-cd.yml: cosign keyless + SLSA L2 attestation + GHCR push + digest pinning seam в compose

<objective>
Создать NEW `.github/workflows/backend-cd.yml` per RESEARCH §Code Examples §B verbatim, реализующий CICD-02 (signed images pinned к SHA256 digests) + CICD-03 (SLSA L2 build provenance attestation). On `push: branches: [main]` + `push: tags: [v*]`, для каждого of 8 services:

1. Build multi-arch (amd64 only для v1.0 per RESEARCH §Standard Stack §Alternatives) image via `docker/build-push-action@v5` с per-service GHA cache scope
2. Push к `ghcr.io/runningecosystem/<service>:<sha>` (always) + `:vX.Y.Z` (on tag push) — **NEVER `:latest`** per D-15 hard rule (`flavor: latest=false` в `docker/metadata-action@v5`)
3. Sign image via cosign keyless (Sigstore + Fulcio OIDC) — `sigstore/cosign-installer@v3` + `cosign sign --yes`
4. Generate SLSA Build L2 attestation via `actions/attest-build-provenance@v2` (**CRITICAL CORRECTION** per RESEARCH §State of the Art line 1167: D-14's `@v1` is deprecation shim; planner MUST use `@v2` LTS or `@v4` latest)
5. Push attestation к GHCR via `push-to-registry: true` (Sigstore reference convention)

Также добавить SEPARATE `no-latest-tag-guard` job в backend-cd.yml (mirror of backend-ci.yml's guard — defense-in-depth: CD pipeline must независимо verify it doesn't tag `:latest`).

Также: MODIFY `services/backend/docker-compose.prod.yml` per CICD-02 — switch service `image:` fields от `build: context` К `image: ghcr.io/runningecosystem/<svc>:${SPORT_STACK_TAG:?...}` (RESEARCH §Code Examples §E Option (b) — tag-based pin + cosign-verify-в-Ansible deferred к v1.0.1). **Fail-fast default:** SPORT_STACK_TAG MUST be set explicitly (either via Ansible `-e sport_stack_tag=...` OR exported в shell); no silent fallback к non-existent tag. Hybrid mode для closed-beta: keep `build:` ALSO so dev workstation can still build locally; Ansible decides at deploy time which path активен via env var.

Purpose: deliver CICD-02 + CICD-03 acceptance.
Output: 2 files committed (1 new workflow + 1 modified compose); first CD run validates cosign signing + SLSA attestation; cosign verify command exit 0 on published image.
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
@.planning/phases/04-ci-cd-pipeline/04-01-SUMMARY.md
@.planning/phases/04-ci-cd-pipeline/04-02-SUMMARY.md
@.github/workflows/backend-ci.yml
@services/backend/docker-compose.prod.yml
@services/backend/identity/Dockerfile

<interfaces>
<!-- Identifiers and pin versions required by backend-cd.yml. RESEARCH §State of the Art table is the authoritative source. -->

**Action versions (CRITICAL — RESEARCH §State of the Art correction applies):**
- `actions/checkout@v4`
- `docker/setup-buildx-action@v3`
- `docker/login-action@v3`
- `docker/metadata-action@v5` с `flavor: latest=false` (D-15 hard rule — RESEARCH Pitfall 6)
- `docker/build-push-action@v5`
- `sigstore/cosign-installer@v3` (v3 stable widely-deployed; v4 newer but v3 safer для closed-beta)
- **`actions/attest-build-provenance@v2`** (LTS recommendation per RESEARCH §State of the Art line 1167; `@v4` latest also acceptable). **NEVER `@v1`** — wraps deprecated `actions/attest`, emits deprecation warning.

**Permissions (CRITICAL — RESEARCH Pitfall 3 — missing any of these silently breaks signing):**
```yaml
permissions:
  contents: read
  packages: write       # GHCR push
  id-token: write       # cosign keyless OIDC + SLSA attestation
  attestations: write   # actions/attest-build-provenance push к Rekor
```

**GHCR namespace:** `ghcr.io/runningecosystem/<service>` (from 04-01-SUMMARY — sed-updated если user picked alt namespace).

**Service matrix (D-08):** `[identity, activity-sync, feed, media, messaging, notifications, realtime-gw, social-graph]` — 8 entries (pkg has no Dockerfile).

**Tag scheme (D-15) — published images from backend-cd.yml use `:${{ github.sha }}` (NO `ci-` prefix; CI verify-builds use `:ci-${{ github.sha }}` per Plan 04-02 Task 1 step 9):**
- Always: `:<git-sha-short>` (immutable; `docker/metadata-action@v5` `type=sha,format=short`) + `:<git-sha-full>` (на main only; `type=raw,value={{sha}},enable={{is_default_branch}}`)
- On release tags: `:vX.Y.Z` (`type=semver,pattern={{version}}`) + `:vX.Y` (`type=semver,pattern=v{{major}}.{{minor}}`)
- **NEVER `:latest`** (`flavor: latest=false`)

**Cosign verify command (для smoke step + Ansible future pre-pull gate — RESEARCH §Code Examples §J):**
```bash
cosign verify \
  --certificate-identity-regexp 'https://github.com/runningecosystem/.*' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  ghcr.io/runningecosystem/<service>@sha256:<digest>
```

**SLSA verify command:**
```bash
cosign verify-attestation \
  --type slsaprovenance \
  --certificate-identity-regexp 'https://github.com/runningecosystem/.*' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  ghcr.io/runningecosystem/<service>@sha256:<digest>
```

**Compose modification path (D-15 + RESEARCH §Code Examples §E Option (b) recommended for v1.0):**
Switch each Go-service block в `services/backend/docker-compose.prod.yml`:
- BEFORE: `build: { context: ., dockerfile: identity/Dockerfile }`
- AFTER: `image: ghcr.io/runningecosystem/identity:${SPORT_STACK_TAG:?need SPORT_STACK_TAG — set via ansible -e OR export}` + KEEP `build:` (hybrid: env var `SPORT_STACK_USE_REGISTRY=true` selects image; default = build locally to preserve dev workflow). Final compose file decision: planner picks Option (b) per RESEARCH recommendation; cosign-verify-в-Ansible deferred к v1.0.1.

**Why `:?` (required-or-fail) instead of `:-` (default value) for SPORT_STACK_TAG:**
- `${SPORT_STACK_TAG:-v1.0.0-rc.1}` (previous draft) silently falls back к `v1.0.0-rc.1` even когда no such tag exists в GHCR — produces a confusing "manifest not found" pull error AFTER ansible has already started swapping containers.
- `${SPORT_STACK_TAG:?...}` causes `docker compose pull/up/config` к fail-fast при пустой env var с a clear error message ("SPORT_STACK_TAG: need SPORT_STACK_TAG — set via ansible -e OR export"). Operator immediately knows what к do.
- Plan 04-04 Task 2 uses `ansible-playbook -e sport_stack_tag=v1.0.0-rc.test-a` к set the var — first-CD-run output tag `v1.0.0-rc.test-a` (NOT `v1.0.0-rc.1`), so previous default would have pointed к non-existent registry tag даже если user followed the runbook precisely. Fail-fast solves this.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: CREATE `.github/workflows/backend-cd.yml` — cosign keyless + SLSA L2 + 8-service matrix + no-latest-tag-guard</name>
  <files>.github/workflows/backend-cd.yml</files>
  <read_first>
    - `.planning/phases/04-ci-cd-pipeline/04-RESEARCH.md` §Code Examples §B lines 702-790 (full body verbatim)
    - `.planning/phases/04-ci-cd-pipeline/04-RESEARCH.md` §Code Examples §C lines 792-813 (attest-build-provenance verbatim minimal)
    - `.planning/phases/04-ci-cd-pipeline/04-RESEARCH.md` §State of the Art line 1167 (v1→v2/v4 correction)
    - `.planning/phases/04-ci-cd-pipeline/04-RESEARCH.md` §Common Pitfalls 3 (id-token: write permission) + 6 (`:latest` guard) + 7 (no SOPS в CI)
    - `.planning/phases/04-ci-cd-pipeline/04-PATTERNS.md` §backend-cd.yml (NEW) section lines 131-211
    - `.planning/phases/04-ci-cd-pipeline/04-PATTERNS.md` Pattern B (job permissions) + Pattern C (matrix per service)
    - `.github/workflows/backend-ci.yml` (existing — reuse `docker-build` job's `cache-from`/`cache-to` per-service scope pattern)
  </read_first>
  <action>
    Create new file `.github/workflows/backend-cd.yml` from RESEARCH §Code Examples §B + §C + Pitfall corrections. Required structure:

    **1. Triggers (push к main + tag `v*`):**
    ```yaml
    on:
      push:
        branches: [main]
        paths:
          - "services/backend/**"
          - ".github/workflows/backend-cd.yml"
        tags:
          - "v*"
    ```
    Note: `paths:` filter applies к branch pushes only; tag pushes (per `tags: [v*]`) trigger unconditionally — release tag forces full build regardless of paths.

    **2. Top-level `permissions:` block (Pattern B — CRITICAL per RESEARCH Pitfall 3):**
    ```yaml
    permissions:
      contents: read
      packages: write       # GHCR push
      id-token: write       # cosign keyless OIDC token fetch from Fulcio
      attestations: write   # actions/attest-build-provenance push к Rekor
    ```

    **3. `publish` job:**
    - `runs-on: ubuntu-latest`
    - `strategy.fail-fast: false`
    - `strategy.matrix.service: [identity, activity-sync, feed, media, messaging, notifications, realtime-gw, social-graph]`
    - Steps в order:
      a. `actions/checkout@v4`
      b. `docker/setup-buildx-action@v3`
      c. `docker/login-action@v3` к `ghcr.io` (username `${{ github.actor }}` + password `${{ secrets.GITHUB_TOKEN }}` — built-in, no extra secret per D-22/D-23)
      d. **`docker/metadata-action@v5` (`id: meta`)** с `flavor: latest=false` + tags:
         ```
         type=sha,format=short
         type=raw,value={{sha}},enable={{is_default_branch}}
         type=semver,pattern={{version}}
         type=semver,pattern=v{{major}}.{{minor}}
         ```
      e. **`docker/build-push-action@v5` (`id: build`)** с `push: true`, `tags: ${{ steps.meta.outputs.tags }}`, `labels: ${{ steps.meta.outputs.labels }}`, `cache-from: type=gha,scope=${{ matrix.service }}`, `cache-to: type=gha,mode=max,scope=${{ matrix.service }}`
      f. `sigstore/cosign-installer@v3`
      g. **`cosign sign --yes ghcr.io/runningecosystem/${{ matrix.service }}@${DIGEST}`** (DIGEST env from `${{ steps.build.outputs.digest }}`)
      h. **`actions/attest-build-provenance@v2`** (NOT @v1 — RESEARCH §State of the Art correction) с `subject-name: ghcr.io/runningecosystem/${{ matrix.service }}` + `subject-digest: ${{ steps.build.outputs.digest }}` + `push-to-registry: true`
      i. Notice step: `echo "::notice title=Published::ghcr.io/runningecosystem/${{ matrix.service }}@${{ steps.build.outputs.digest }}"`

    **4. `cosign-verify-smoke` job** (self-check per RESEARCH §Architecture Pattern 4 — verifies publish job's own output):
    ```yaml
    cosign-verify-smoke:
      name: Cosign verify smoke (CICD-02 self-check)
      runs-on: ubuntu-latest
      needs: publish
      strategy:
        matrix:
          service: [identity, activity-sync, feed, media, messaging, notifications, realtime-gw, social-graph]
      steps:
        - uses: sigstore/cosign-installer@v3
        - name: Verify signature
          run: |
            cosign verify \
              --certificate-identity-regexp 'https://github.com/runningecosystem/.*' \
              --certificate-oidc-issuer https://token.actions.githubusercontent.com \
              ghcr.io/runningecosystem/${{ matrix.service }}:${{ github.sha }}
        - name: Verify SLSA attestation
          run: |
            cosign verify-attestation \
              --type slsaprovenance \
              --certificate-identity-regexp 'https://github.com/runningecosystem/.*' \
              --certificate-oidc-issuer https://token.actions.githubusercontent.com \
              ghcr.io/runningecosystem/${{ matrix.service }}:${{ github.sha }}
    ```

    **5. `no-latest-tag-guard` job (defense-in-depth — mirror of backend-ci's guard но on CD side):**
    ```yaml
    no-latest-tag-guard:
      name: Guard (no :latest in CD outputs)
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4
        - name: Negative grep — forbid `:latest` in any workflow OR compose
          run: |
            if grep -v '^#' .github/workflows/*.yml services/backend/docker-compose.prod.yml \
                 | grep -E ':latest["\x27]?\s*$' ; then
              echo "FAIL: \`:latest\` tag found (non-comment) — D-15 violation"
              exit 1
            fi
            echo "PASS — no :latest tags"
    ```

    Use Write tool — NEVER Bash heredoc.

    Commit message: `feat(cd): add backend-cd.yml с cosign keyless + SLSA L2 attestation (@v2) for 8 services (CICD-02, CICD-03)`.
  </action>
  <verify>
    <automated>actionlint .github/workflows/backend-cd.yml &amp;&amp; grep -q 'id-token: write' .github/workflows/backend-cd.yml &amp;&amp; grep -q 'attestations: write' .github/workflows/backend-cd.yml &amp;&amp; grep -q 'packages: write' .github/workflows/backend-cd.yml &amp;&amp; grep -q 'attest-build-provenance@v2' .github/workflows/backend-cd.yml &amp;&amp; ! grep -q 'attest-build-provenance@v1' .github/workflows/backend-cd.yml &amp;&amp; grep -q 'cosign sign --yes' .github/workflows/backend-cd.yml &amp;&amp; grep -q 'flavor: latest=false' .github/workflows/backend-cd.yml &amp;&amp; grep -q 'cosign verify' .github/workflows/backend-cd.yml &amp;&amp; grep -q 'cosign verify-attestation' .github/workflows/backend-cd.yml &amp;&amp; grep -q 'no-latest-tag-guard' .github/workflows/backend-cd.yml &amp;&amp; (grep -v '^#' .github/workflows/backend-cd.yml | grep -E ':latest["\x27]?\s*$' &amp;&amp; echo "FAIL — :latest found" &amp;&amp; exit 1) || echo "STRUCTURE OK"</automated>
  </verify>
  <acceptance_criteria>
    - `actionlint .github/workflows/backend-cd.yml` exits 0
    - All 4 required permissions present (contents:read, packages:write, id-token:write, attestations:write) — RESEARCH Pitfall 3 mitigation
    - `actions/attest-build-provenance@v2` present (LTS) — NOT `@v1` (verified via negative grep — RESEARCH §State of the Art correction applied)
    - `flavor: latest=false` present в `docker/metadata-action@v5` invocation — D-15 hard rule
    - 8-service matrix verified (`grep -E 'matrix:\s*$' -A1` returns service list)
    - `cosign sign --yes` command present in `publish` job
    - `cosign verify` + `cosign verify-attestation` BOTH present в `cosign-verify-smoke` job (self-check per RESEARCH §Architecture Pattern 4)
    - `no-latest-tag-guard` job present + uses `grep -v '^#'` filter (prevents self-invalidation)
    - **Negative check:** `grep -v '^#' .github/workflows/backend-cd.yml | grep -E ':latest["\x27]?\s*$'` returns empty (workflow file itself does not contain `:latest`)
  </acceptance_criteria>
  <done>backend-cd.yml created с 8-service matrix + cosign + SLSA L2 (@v2) + self-verify smoke + no-latest guard. actionlint clean.</done>
</task>

<task type="auto">
  <name>Task 2: MODIFY `services/backend/docker-compose.prod.yml` — switch service `image:` от build-context к tag-pinned GHCR image (hybrid с build: kept для dev; fail-fast default за W4)</name>
  <files>services/backend/docker-compose.prod.yml</files>
  <read_first>
    - `services/backend/docker-compose.prod.yml` (existing 314 lines)
    - `.planning/phases/04-ci-cd-pipeline/04-RESEARCH.md` §Code Examples §E lines 903-960 (Options (a) full digest vs (b) tag-based; recommendation = Option (b))
    - `.planning/phases/04-ci-cd-pipeline/04-PATTERNS.md` §docker-compose.prod.yml (MODIFY) section lines 371-394
  </read_first>
  <action>
    Modify `services/backend/docker-compose.prod.yml` per CICD-02 + RESEARCH §Code Examples §E Option (b) (recommended for v1.0 solo-dev — simpler than Option (a) digest-update-PR cycle; cosign-verify wrap deferred к v1.0.1).

    Для каждого of 8 Go services (identity at lines 115-129, activity-sync 131-148, media 151-174, notifications 177-195, realtime-gw 198-210, messaging 213-233, feed 236-256, social-graph 260-280), ADD `image:` field ABOVE the existing `build:` block. Both fields can coexist в Compose v2 — when both present, `image:` wins on `up` if image exists locally OR can be pulled; `build:` only used if `--build` flag passed OR no image available.

    Pattern (apply к each service) — **fail-fast `:?` required-or-error syntax, NOT `:-` default-value**:
    ```yaml
    identity:
      image: ghcr.io/runningecosystem/identity:${SPORT_STACK_TAG:?need SPORT_STACK_TAG — first set via `ansible-playbook -e sport_stack_tag=v1.0.0-rc.test-a` OR `export SPORT_STACK_TAG=<tag>` locally; no default к non-existent GHCR tag}
      build:
        context: .
        dockerfile: identity/Dockerfile
      container_name: re_identity
      ... (rest unchanged)
    ```

    **Why fail-fast `:?` instead of default `:-`:**
    - Previous draft used `${SPORT_STACK_TAG:-v1.0.0-rc.1}` — silently fell back к a tag that doesn't exist в GHCR until someone explicitly tags `v1.0.0-rc.1`. Plan 04-04 Task 1 tags `v1.0.0-rc.test-a` (NOT `v1.0.0-rc.1`), so any Ansible deploy attempted между end of 04-03a и start of 04-04 would hit "manifest not found" mid-deploy (containers down, registry pull fails).
    - `:?` causes `docker compose pull/up/config` к fail-fast с a clear actionable error при unset var — operator immediately knows к `export SPORT_STACK_TAG=...` OR pass `-e sport_stack_tag=...` к ansible-playbook.

    **Why hybrid (image + build):** Phase 3 Ansible deploy uses `docker compose up -d` (without `--build`) → pulls image from GHCR (requires SPORT_STACK_TAG set). Dev workstation uses `docker compose up -d --build` (existing pattern в `services/backend/Makefile up-stack`) → builds locally от source — но also requires SPORT_STACK_TAG set OR uses `--no-deps` to bypass; document this в Makefile change comment as part of Plan 04-03b если needed. Single compose file serves both — no `docker-compose.dev.yml` / `docker-compose.prod.yml.tmpl` split needed.

    **DO NOT touch** the `gateway` (Caddy), `postgres`, `nats`, `redis`, `minio`, `migrations` blocks — those use third-party images, не subject к CICD-02.

    Add file-header comment explaining the hybrid mode + fail-fast rationale (insert после existing header comment block, before line 21 `name: running-ecosystem`):
    ```yaml
    # Phase 4 / CICD-02: service `image:` fields pin к ghcr.io/runningecosystem/<svc>:${SPORT_STACK_TAG}
    # — `:latest` NEVER allowed (D-15; backend-cd.yml no-latest-tag-guard enforces).
    # — `${SPORT_STACK_TAG:?...}` is REQUIRED-OR-FAIL (NOT defaulted via `:-`) — prevents
    #   silent fallback к non-existent GHCR tag. Set via:
    #     • ansible-playbook -i inventory/prod --tags sport-stack -e sport_stack_tag=<TAG> site.yml
    #     • OR locally: export SPORT_STACK_TAG=<TAG> && docker compose -f ... up
    # Both `image:` AND `build:` present per service: docker compose up pulls registry image
    # by default; `docker compose up --build` forces local build (dev workflow preserved).
    # Future v1.0.1: switch к `@sha256:<digest>` pinning + cosign-verify-в-Ansible pre-pull
    # gate (RESEARCH §Code Examples §E Option (a); §Code Examples §J verify command).
    ```

    **Important — docker compose config dry-run check requires SPORT_STACK_TAG set:** Task verify step must `export SPORT_STACK_TAG=v1.0.0-rc.test-a` (placeholder) before invoking `docker compose -f ... config` — otherwise compose's `:?` will fail-fast (which is exactly the new desired behavior, но then the verify command itself errors). Wrap verify в env-var assignment.

    Commit message: `feat(deploy): pin docker-compose.prod.yml service images к ghcr.io tags (CICD-02, hybrid build/image mode, fail-fast SPORT_STACK_TAG)`.
  </action>
  <verify>
    <automated>grep -c 'image: ghcr.io/runningecosystem/' services/backend/docker-compose.prod.yml | grep -q '^8$' &amp;&amp; ! (grep -v '^#' services/backend/docker-compose.prod.yml | grep -E ':latest["\x27]?\s*$') &amp;&amp; grep -q 'SPORT_STACK_TAG:?' services/backend/docker-compose.prod.yml &amp;&amp; ! grep -q 'SPORT_STACK_TAG:-' services/backend/docker-compose.prod.yml &amp;&amp; SPORT_STACK_TAG=v1.0.0-rc.test-a docker compose -f services/backend/docker-compose.prod.yml config &gt;/dev/null 2>&amp;1 &amp;&amp; (unset SPORT_STACK_TAG; ! docker compose -f services/backend/docker-compose.prod.yml config &gt;/dev/null 2>&amp;1) &amp;&amp; echo "COMPOSE CONFIG OK — fail-fast SPORT_STACK_TAG works"</automated>
  </verify>
  <acceptance_criteria>
    - Exactly 8 `image: ghcr.io/runningecosystem/` lines added (one per Go service; postgres/nats/redis/minio/caddy/migrations untouched)
    - **`${SPORT_STACK_TAG:?...}` fail-fast required form** present (allows Ansible/dev override; NO silent default к non-existent GHCR tag)
    - **Negative check — no defaulted form:** `! grep -q 'SPORT_STACK_TAG:-' services/backend/docker-compose.prod.yml` exits 0 (no `:-v1.0.0-rc.1` legacy syntax remains anywhere)
    - **Negative check — no `:latest`:** `grep -v '^#' services/backend/docker-compose.prod.yml | grep -E ':latest["\x27]?\s*$'` exits 1
    - **Positive check — fail-fast works:** `SPORT_STACK_TAG=v1.0.0-rc.test-a docker compose -f services/backend/docker-compose.prod.yml config` exits 0 (compose validates когда var set)
    - **Negative check — fail-fast fires:** `unset SPORT_STACK_TAG && ! docker compose -f services/backend/docker-compose.prod.yml config` exits 0 (compose fails-fast when var unset, with the `:?` error message visible на stderr)
    - File header comment block explains hybrid mode + cites D-15 + CICD-02 + fail-fast rationale (W4 fix)
    - Existing `build:` blocks ALL preserved (greppable: `build:\s*$` count unchanged)
  </acceptance_criteria>
  <done>docker-compose.prod.yml modified to hybrid image+build mode с fail-fast SPORT_STACK_TAG requirement; backend-cd.yml's first publish (Task 3) requires explicit `export SPORT_STACK_TAG=<sha-tag>` OR Ansible `-e` flag to deploy.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: First CD run supervised — push к main triggers backend-cd.yml, verify cosign signing + SLSA attestation succeed для all 8 services</name>
  <files>(none — git push triggers existing workflow)</files>
  <read_first>
    - `.planning/phases/04-ci-cd-pipeline/04-RESEARCH.md` §Common Pitfalls 3 (id-token: write — silent cosign failure)
    - `.planning/phases/04-ci-cd-pipeline/04-RESEARCH.md` §Code Examples §J (cosign verify commands)
  </read_first>
  <what-built>backend-cd.yml NEW + docker-compose.prod.yml MODIFIED — both need first-run validation on real GitHub Actions environment, with iteration if Pitfall 3 (silent OIDC/signing failure) hits.</what-built>
  <how-to-verify>
    1. Если Tasks 1+2 committed на feat/cursona-redesign — merge к main via PR or push directly (after Plan 04-05 lands branch protection, direct push к main will be blocked; for now still allowed). Either way, observe push event triggers `backend-cd.yml`.

    2. Watch first CD run в Actions tab:
       ```bash
       gh run watch  # picks latest in-progress run automatically
       # OR specific run:
       gh run view <run-id> --log-failed   # if a job failed, dump failed logs
       ```

    3. Expect ~15-20 min для full 8-service publish + 8-service cosign-verify-smoke + guard job. Monitor for these specific failure modes per RESEARCH Pitfall 3:
       - **Failure pattern A** — "Error: 0xc003 — Failed to fetch OIDC token": missing `id-token: write` permission. Verify Task 1's permissions block is intact; commit fix.
       - **Failure pattern B** — "no matching credentials for ghcr.io": missing `packages: write` permission. Same fix.
       - **Failure pattern C** — "attestation could not be uploaded к Rekor": missing `attestations: write` permission. Same fix.
       - **Failure pattern D** — "service `pkg` Dockerfile not found": should not happen since matrix только 8 actual services; if it does, sanity-check Task 1 matrix list.
       - **Failure pattern E** — "Dockerfile <service>/Dockerfile not found": Architectural Responsibility Map A8 — verify Dockerfile exists для each service. Если missing, raise issue (out-of-scope для Plan 04-03a — pre-existing assumption broken; surface к user).

    4. Once all jobs green, run **local verification** (RESEARCH §Code Examples §J) from dev workstation:
       ```bash
       brew install cosign  # if not yet installed
       # Pick any of 8 services (e.g. identity); use commit SHA от main HEAD:
       export GIT_SHA=$(git rev-parse --short HEAD)
       cosign verify \
         --certificate-identity-regexp 'https://github.com/runningecosystem/.*' \
         --certificate-oidc-issuer https://token.actions.githubusercontent.com \
         ghcr.io/runningecosystem/identity:${GIT_SHA}
       # Expected: "Verification for ... — The following checks were performed ..."
       echo "Exit code: $?"  # должно быть 0

       cosign verify-attestation \
         --type slsaprovenance \
         --certificate-identity-regexp 'https://github.com/runningecosystem/.*' \
         --certificate-oidc-issuer https://token.actions.githubusercontent.com \
         ghcr.io/runningecosystem/identity:${GIT_SHA}
       echo "Exit code: $?"  # должно быть 0
       ```

    5. After first publish lands 8 images в GHCR (Plan 04-01 Task 0 deferred reminder):
       ```bash
       # Flip GHCR package visibility = public per RESEARCH §Open Q recommendation
       for SVC in identity activity-sync feed media messaging notifications realtime-gw social-graph; do
         gh api -X PATCH "/user/packages/container/${SVC}/visibility" -f visibility=public
       done
       # Verify:
       gh api "/user/packages/container/identity" --jq '.visibility'  # → "public"
       ```
       Если ownership=organization, substitute `/orgs/runningecosystem/packages/container/<svc>/visibility`.

    6. Tell user the result + summarize: any iterations needed, final image count, SLSA attestation verified, GHCR visibility flipped.
  </how-to-verify>
  <acceptance_criteria>
    - `gh run watch` (или `gh run view <id>`) shows publish + cosign-verify-smoke + no-latest-tag-guard ALL green (SUCCESS conclusion)
    - 8 images visible at https://github.com/runningecosystem/sport/packages (или equivalent if alt namespace)
    - `cosign verify ... ghcr.io/runningecosystem/identity:<sha>` exits 0 — signature valid
    - `cosign verify-attestation --type slsaprovenance ... ` exits 0 — SLSA L2 attestation queryable
    - 8 GHCR packages set к `visibility=public` (verify via `gh api /user/packages/container/identity --jq '.visibility'` returns `"public"`)
    - **CICD-02 acceptance demonstrated:** signed image references resolvable + cosign-verifiable
    - **CICD-03 acceptance demonstrated:** SLSA L2 attestation attached + verifiable
  </acceptance_criteria>
  <resume-signal>Type "all-8-published verified" OR "iteration needed — &lt;failure pattern&gt;"</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| GitHub Actions OIDC issuer (token.actions.githubusercontent.com) → Fulcio CA | cosign keyless signing trusts ephemeral cert from Fulcio. Cert lifecycle ~10 minutes; revocation via transparency log Rekor. |
| GHCR image storage → consumers (Ansible deploy, future cosign-verify-в-Ansible) | Image immutability via SHA256 digest (Compose tag pin only — digest-pin Option (a) deferred к v1.0.1 per RESEARCH §Code Examples §E). |
| Build runner → published image | SLSA L2 attestation records builder identity + workflow + commit SHA; queryable post-publish via `cosign verify-attestation`. |
| `SPORT_STACK_TAG` env var (operator-supplied) → compose pull/up | Fail-fast `:?` syntax ensures missing var → loud error before container swap, NOT silent pull-failure mid-deploy. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-04-03 | Tampering | Cosign signature missing → unverified image pulled к prod (substitution attack) | mitigate | `cosign sign --yes` step в publish job + `cosign-verify-smoke` job verifies its own output (self-check per RESEARCH §Architecture Pattern 4); future Ansible deploy adds pre-pull `cosign verify` gate (RESEARCH §Code Examples §J — deferred к v1.0.1). HIGH. |
| T-04-PIV-PERM | Availability + Tampering | Missing `id-token: write` permission silently breaks cosign signing (no error visible until first verify-attempt fails) | mitigate | Top-level `permissions:` block с all 4 required scopes (RESEARCH Pitfall 3 verbatim). Task 1 acceptance grep'd before commit. Task 3 first-run verification exposes silent-fail если permission misconfigured. HIGH. |
| T-04-LATEST-CD | Tampering | `:latest` tag emitted by `docker/metadata-action@v5` defaults — race condition prod pulls moving target | mitigate | `flavor: latest=false` в metadata-action invocation (D-15 hard rule). Defense-in-depth: `no-latest-tag-guard` job greps backend-cd.yml + compose. HIGH. |
| T-04-SUBST-DIGEST | Tampering | Compose tag-based pin (`:vX.Y.Z`) allows registry-side tag-overwrite attack | accept | RESEARCH §Code Examples §E recommends Option (b) tag-based для v1.0 (Option (a) digest-pin + auto-PR-update deferred к v1.0.1). Accept risk for closed-beta (single-dev, no untrusted CI access). Future Ansible cosign-verify gate (deferred v1.0.1) closes this. Documented в SUMMARY. accept_risk: "Closed-beta single-dev — registry-side tampering requires GHCR compromise; cosign-verify-в-Ansible deferred v1.0.1 mitigates fully." MEDIUM. |
| T-04-STALE-TAG | Availability | Compose's default `:-v1.0.0-rc.1` would silently target non-existent GHCR tag когда operator forgets к export SPORT_STACK_TAG → ansible-driven `docker compose pull` fails mid-deploy с unclear error | mitigate | W4 fix — replaced `:-v1.0.0-rc.1` с `:?need SPORT_STACK_TAG — ...` fail-fast syntax. `docker compose config/pull/up` errors immediately с clear actionable message before any container is touched. Task 2 acceptance verifies both positive (set var → exit 0) AND negative (unset var → exit ≠0) cases. MEDIUM. |

**Block-on-high gate:** Three HIGH-severity threats (T-04-03, T-04-PIV-PERM, T-04-LATEST-CD). All mitigated via guards + self-checks. T-04-SUBST-DIGEST + T-04-STALE-TAG are MEDIUM, both explicitly handled (accept_risk OR fail-fast). `block_on: high` satisfied.
</threat_model>

<must_haves>
  truths:
    - "D-13: cosign keyless signing via Sigstore/Fulcio (no KMS, no key rotation, no GH-secrets-stored cosign key)"
    - "D-14 CORRECTED per RESEARCH §State of the Art line 1167: `actions/attest-build-provenance@v2` (LTS) — NEVER `@v1` (deprecation shim)"
    - "D-15: image tagging — always `:<git-sha>`, on tag `:vX.Y.Z`, NEVER `:latest` (`flavor: latest=false` в metadata-action)"
    - "D-22: NO SOPS-decrypt в CD workflow — GHCR push uses `GITHUB_TOKEN` only"
    - "D-23: only repo secret = `GITHUB_TOKEN` (auto-provisioned); cosign keyless eliminates signing-key management"
    - "RESEARCH §Code Examples §B + §C verbatim — workflow body composed from verified action versions"
    - "RESEARCH §Code Examples §E Option (b) applied — tag-based pin в compose (digest-pin Option (a) + cosign-verify-в-Ansible deferred к v1.0.1)"
    - "RESEARCH §Architecture Pattern 4 applied — `cosign-verify-smoke` job в same CD run validates publish job's own output (catch silent signing failures immediately)"
    - "RESEARCH Pitfall 3 mitigated: all 4 permissions (contents:read, packages:write, id-token:write, attestations:write) present at workflow level"
    - "RESEARCH Pitfall 6 mitigated: `no-latest-tag-guard` job present (mirror of backend-ci.yml's guard — defense-in-depth)"
    - "RESEARCH §Open Q recommendation applied: GHCR package visibility = public after first publish (Task 3) — eliminates GHCR auth complexity на prod VPS"
    - "W4 fix applied: docker-compose.prod.yml uses `${SPORT_STACK_TAG:?...}` fail-fast (NOT `:-v1.0.0-rc.1` default) — prevents silent pull-failure when ansible/operator forgets к set the var; Plan 04-04 Task 2 explicitly uses `-e sport_stack_tag=v1.0.0-rc.test-a`"
    - "Published-image tag scheme is `:${{ github.sha }}` (NO `ci-` prefix). CI verify-builds use `:ci-${{ github.sha }}` (Plan 04-02). Two distinct namespaces, never overlap — distinguishable in GHCR listing."
  behaviors:
    - "`actionlint .github/workflows/backend-cd.yml` exits 0"
    - "First push к main triggers `backend-cd.yml`; publish job pushes 8 images к ghcr.io/runningecosystem/<svc>:<sha>"
    - "`cosign verify --certificate-identity-regexp ... <image>` exits 0 for any of the 8 published images"
    - "`cosign verify-attestation --type slsaprovenance ... <image>` exits 0 (SLSA L2 attestation queryable)"
    - "8 GHCR packages set к visibility=public after Task 3 user-action"
    - "`SPORT_STACK_TAG=<x> docker compose -f services/backend/docker-compose.prod.yml config` exits 0 (config valid когда var set)"
    - "`unset SPORT_STACK_TAG && docker compose -f services/backend/docker-compose.prod.yml config` exits ≠0 (fail-fast fires когда var unset — W4 verification)"
  forbidden:
    - "NO `actions/attest-build-provenance@v1` (deprecation shim — RESEARCH §State of the Art correction)"
    - "NO cosign keypair-based signing (Anti-Pattern per RESEARCH §Anti-Patterns line 401 — keyless is the whole point)"
    - "NO `:latest` tag anywhere в backend-cd.yml OR docker-compose.prod.yml (D-15 hard rule + no-latest-tag-guard enforces)"
    - "NO SOPS-decrypt commands в backend-cd.yml (D-22)"
    - "NO removal of existing `build:` blocks от compose (hybrid mode — dev workflow preserved)"
    - "NO `pull_request_target` triggers (RESEARCH §Security Domain — workflow injection vector)"
    - "NO commit к main of backend-cd.yml until backend-ci.yml passed на same commit (Plan 04-02 sequence — но this is post-04-02 so already satisfied)"
    - "NO default image tag в docker-compose.prod.yml that points к non-existent GHCR tag — must fail-fast если SPORT_STACK_TAG unset. Specifically: no `${SPORT_STACK_TAG:-v1.0.0-rc.1}` syntax (W4 fix — replaced с `:?` required-or-error form)."
</must_haves>

<verification>
- `actionlint .github/workflows/backend-cd.yml` exits 0
- `grep -q 'attest-build-provenance@v2' .github/workflows/backend-cd.yml && ! grep -q 'attest-build-provenance@v1' .github/workflows/backend-cd.yml` (both conditions must succeed — v2 present AND v1 absent)
- `gh run view <first-cd-run-id> --json status,conclusion --jq '.conclusion'` returns `"success"`
- `cosign verify --certificate-identity-regexp 'https://github.com/runningecosystem/.*' --certificate-oidc-issuer https://token.actions.githubusercontent.com ghcr.io/runningecosystem/identity:<sha>` exits 0
- `cosign verify-attestation --type slsaprovenance --certificate-identity-regexp 'https://github.com/runningecosystem/.*' --certificate-oidc-issuer https://token.actions.githubusercontent.com ghcr.io/runningecosystem/identity:<sha>` exits 0
- `SPORT_STACK_TAG=v1.0.0-rc.test-a docker compose -f services/backend/docker-compose.prod.yml config | grep -c 'ghcr.io/runningecosystem'` returns ≥8 (when var set, config resolves)
- `unset SPORT_STACK_TAG && ! docker compose -f services/backend/docker-compose.prod.yml config 2>/dev/null` exits 0 (fail-fast fires)
- `! grep -q 'SPORT_STACK_TAG:-' services/backend/docker-compose.prod.yml` exits 0 (no `:-` default form remains)
- `! (grep -v '^#' services/backend/docker-compose.prod.yml .github/workflows/backend-cd.yml | grep -E ':latest["\x27]?\s*$')` exits 0 (no `:latest`)
- 04-03a-SUMMARY records: first CD run URL, image digests verbatim (для future digest-pin Option (a) migration), cosign verify output verbatim, GHCR visibility flip command + verification result, any iteration counts.
</verification>

<success_criteria>
1. CICD-02 acceptance: 8 services have cosign-keyless signatures + image references в `docker-compose.prod.yml` use ghcr.io/runningecosystem/<svc>:tag (digest-pin Option (a) deferred к v1.0.1; accept_risk documented).
2. CICD-03 acceptance: SLSA L2 attestation attached к each image; queryable via `cosign verify-attestation --type slsaprovenance`.
3. backend-cd.yml + docker-compose.prod.yml committed; first CD run green; 8 images public in GHCR.
4. RESEARCH §State of the Art correction applied: `@v2` (NOT `@v1`).
5. W4 fix applied: docker-compose.prod.yml fail-fast `${SPORT_STACK_TAG:?...}` syntax — operator gets clear actionable error на missing var, not silent registry-pull failure mid-deploy.
</success_criteria>

<output>
After completion, create `.planning/phases/04-ci-cd-pipeline/04-03a-SUMMARY.md` recording:
- First CD run URL + commit SHA
- 8 published image references с SHA256 digests verbatim (record для future digest-pin Option (a) migration)
- `cosign verify` output verbatim для at least 1 service (proof of CICD-02 acceptance)
- `cosign verify-attestation --type slsaprovenance` output verbatim для at least 1 service (proof of CICD-03 acceptance)
- GHCR visibility flip — 8 packages flipped к public (per RESEARCH §Open Q recommendation)
- Hybrid compose mode confirmation (`build:` blocks preserved для dev workflow; `image:` for prod registry pull)
- W4 verification: positive case (`SPORT_STACK_TAG=...` set → `docker compose config` exits 0) AND negative case (unset → fail-fast error message captured verbatim)
- Accept_risk note for T-04-SUBST-DIGEST: tag-based pin acceptable для closed-beta; cosign-verify-в-Ansible deferred к v1.0.1 per RESEARCH recommendation
- Iteration count (= number of pushes-к-main before first all-green CD run)
</output>
</output>
