---
phase: 02-secrets-and-config-hardening
plan: 03
type: execute
wave: 2
depends_on:
  - 02-01
files_modified:
  - .gitleaks.toml
  - .pre-commit-config.yaml
  - .trufflehog/config.yaml
  - services/backend/Makefile
  - services/backend/scripts/secrets/init-pre-commit.sh
  - docs/gitleaks-history-scan.json
  - docs/trufflehog-history-scan.json
  - docs/SECRETS.md
autonomous: true
requirements:
  - SEC-01
  - SEC-08
tags:
  - secrets
  - gitleaks
  - trufflehog
  - pre-commit
  - scanners

must_haves:
  truths:
    - "`.gitleaks.toml` extends default ruleset + adds two custom Mapbox rules covering bare `sk.` and bare `pk.` literals (closes RESEARCH Pitfall 2 — default v8.30.1 mapbox-api-token rule only catches keyword-adjacent pk.)"
    - "`.gitleaks.toml` allowlist includes `apps/mobile-rn/src/__fixtures__/secret.lint-fixture.ts` per D-10 (preserves intentional ESLint guard fixture from pre-v1.0 Plan 08)"
    - "`.pre-commit-config.yaml` at repo root pins gitleaks v8.30.1 hook; `pre-commit install` produces a working `.git/hooks/pre-commit` script"
    - "`services/backend/Makefile` has a `scan-secrets` target that invokes gitleaks against the full repo and exits non-zero on findings"
    - "`services/backend/scripts/secrets/init-pre-commit.sh` exists, is executable, and installs pre-commit hooks idempotently"
    - "Full-history scan results committed at `docs/gitleaks-history-scan.json` + `docs/trufflehog-history-scan.json` per D-12 (audit artifact)"
    - "Any historical finding triggers immediate rotation NOT history rewrite (per D-12); rotation entries logged in `docs/SECRETS.md` §Incident Log"
    - "Pre-commit hook smoke test: staging a file containing `sk.<60+ chars>.<20+ chars>` blocks the commit; allowlisted fixture file does NOT block"
  artifacts:
    - path: .gitleaks.toml
      provides: "Gitleaks ruleset: default + mapbox-secret-token + mapbox-public-token-bare + allowlist for lint-fixture"
      contains: "useDefault = true"
    - path: .pre-commit-config.yaml
      provides: "Pre-commit framework manifest pinning gitleaks v8.30.1 hook"
      contains: "gitleaks/gitleaks"
    - path: .trufflehog/config.yaml
      provides: "Trufflehog config (allowlist for archived planning artifacts if needed)"
    - path: services/backend/Makefile
      provides: "scan-secrets target invoking gitleaks against repo root"
      contains: "scan-secrets"
    - path: services/backend/scripts/secrets/init-pre-commit.sh
      provides: "One-time pre-commit installer for new dev workstations"
      contains: "pre-commit install"
    - path: docs/gitleaks-history-scan.json
      provides: "One-time full-history scan output (committed as audit artifact per D-12)"
    - path: docs/trufflehog-history-scan.json
      provides: "Complementary verified-secret scan output"
    - path: docs/SECRETS.md
      provides: "Existing rotation playbook EXTENDED with Incident Log section (per D-12); full extension lands in 02-04"
      contains: "Incident Log"
  key_links:
    - from: .pre-commit-config.yaml
      to: .gitleaks.toml
      via: "gitleaks hook automatically picks up .gitleaks.toml at repo root"
      pattern: "gitleaks/gitleaks"
    - from: .gitleaks.toml
      to: apps/mobile-rn/src/__fixtures__/secret.lint-fixture.ts
      via: "[[allowlists]] paths entry preserves intentional ESLint guard fixture"
      pattern: "secret\\.lint-fixture\\.ts"
    - from: services/backend/Makefile
      to: ".gitleaks.toml at repo root"
      via: "make scan-secrets shells out to gitleaks detect --source .."
      pattern: "gitleaks detect"
    - from: services/backend/scripts/secrets/init-pre-commit.sh
      to: .pre-commit-config.yaml
      via: "pre-commit install reads .pre-commit-config.yaml"
      pattern: "pre-commit install"
---

<objective>
Land the secret-scanner toolchain configuration: `.gitleaks.toml` with custom Mapbox rules closing the v8.30.1 default-ruleset gap (RESEARCH Pitfall 2), `.pre-commit-config.yaml` pinning the gitleaks v8.30.1 hook (D-08, D-11), optional `.trufflehog/config.yaml` allowlist, `services/backend/Makefile` `scan-secrets` target (Pattern F), and a `init-pre-commit.sh` installer (Pattern E). Run the one-time full-history scan (D-12), commit results as an audit artifact, and log any findings as Incident Log entries in `docs/SECRETS.md`. CI wiring is explicitly OUT OF SCOPE — Phase 4 / CICD-01 will wire GitHub Actions invocations.

Purpose: SEC-01 acceptance requires `gitleaks` + `trufflehog` on full clone (`--no-shallow`) report zero findings. SEC-08 requires pre-commit hook scanning for AWS / AKIA / GitHub PAT / Mapbox `sk.` patterns. RESEARCH critical finding 2 corrects an assumption: the upstream gitleaks v8.30.1 default `mapbox-api-token` rule only catches `pk.…` tokens when the keyword "mapbox" appears nearby — bare `sk.` and bare `pk.` literals are NOT caught. Custom rules are MANDATORY for SEC-08 acceptance.

Output: 5 new files at repo root or under `services/backend/scripts/`, 1 modified Makefile, 1 EXTENDED docs file (Incident Log section only — full playbook extension lands in 02-04), 2 audit JSON artifacts.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/02-secrets-and-config-hardening/02-CONTEXT.md
@.planning/phases/02-secrets-and-config-hardening/02-RESEARCH.md
@.planning/phases/02-secrets-and-config-hardening/02-PATTERNS.md
@.planning/phases/02-secrets-and-config-hardening/02-01-PLAN-sops-scaffold.md
@CLAUDE.md
@docs/SECRETS.md
@apps/mobile-rn/eslint.config.js
@services/backend/Makefile
@apps/mobile-rn/src/__fixtures__/secret.lint-fixture.ts

<interfaces>
`.gitleaks.toml` schema (RESEARCH §gitleaks-config + Pitfall 2 — verified 2026-05-15 against upstream regex at line 2569 of gitleaks/master config/gitleaks.toml):
```toml
[extend]
useDefault = true

[[rules]]
id = "mapbox-secret-token"
description = "Mapbox secret access token (sk.) — never bundles, never commits"
regex = '''\bsk\.[A-Za-z0-9_-]{60,}\.[A-Za-z0-9_-]{20,}\b'''
keywords = ["sk."]
tags = ["secret", "mapbox"]

[[rules]]
id = "mapbox-public-token-bare"
description = "Mapbox public access token (pk.) literal — flag for review"
regex = '''\bpk\.[A-Za-z0-9_-]{60,}\.[A-Za-z0-9_-]{20,}\b'''
keywords = ["pk."]
tags = ["mapbox"]

[[allowlists]]
description = "Intentional ESLint guard fixture (pre-v1.0 Plan 08)"
paths = [
  '''apps/mobile-rn/src/__fixtures__/secret\.lint-fixture\.ts''',
]
```

`.pre-commit-config.yaml` schema (RESEARCH §pre-commit-config — verified upstream hook manifest):
```yaml
repos:
  - repo: https://github.com/gitleaks/gitleaks
    rev: v8.30.1
    hooks:
      - id: gitleaks
```
Default entry: `gitleaks git --pre-commit --redact --staged --verbose`. <5s budget per D-11.

Full-history scan command (RESEARCH §full-history-scan):
```bash
gitleaks detect --no-banner --redact --report-format json \
  --report-path docs/gitleaks-history-scan.json \
  --log-opts="--all" --source .

trufflehog git --json --no-update --only-verified file://. \
  > docs/trufflehog-history-scan.json
```

Existing pre-v1.0 Plan 08 fixture (must not be flagged):
- Path: `apps/mobile-rn/src/__fixtures__/secret.lint-fixture.ts`
- Purpose: intentional fake `sk.…` literal that the existing ESLint v9 token-secret guard rejects (rejects = test passes — the fixture is a test fixture)
- This file MUST be in `.gitleaks.toml` global allowlist to avoid pre-commit false-positive
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: .gitleaks.toml + .pre-commit-config.yaml + .trufflehog/config.yaml</name>
  <files>.gitleaks.toml, .pre-commit-config.yaml, .trufflehog/config.yaml</files>
  <action>
    Create `.gitleaks.toml` at the repo root using the verified shape in `<interfaces>` block (matches RESEARCH §gitleaks-config + PATTERNS.md §.gitleaks.toml). Include a leading comment: `# Phase 2 / SEC-08 — D-10. Upstream rule mapbox-api-token catches pk.+keyword only; sk. and bare pk. need custom rules (RESEARCH Pitfall 2 closes the gap).`

    Create `.pre-commit-config.yaml` at the repo root using the verified upstream hook manifest. Pin `rev: v8.30.1` exactly (do NOT use floating tags like `main` or `latest` — per Hard Rule "no `latest` tags ever" from ROADMAP §Hard Rules; pinning a specific gitleaks revision is the analog). Leading comment: `# Phase 2 / SEC-01 / SEC-08 — D-08 + D-11. Staged-files-only gitleaks scan; full-repo + trufflehog runs in CI (Phase 4 CICD-01).`

    Create `.trufflehog/config.yaml` (optional, lightweight — D-09 splits gitleaks pre-commit + trufflehog CI). v3.95.3 supports a top-level `detectors` allowlist; for v1.0, the only allowlist entry needed is the archived planning artifacts directory in case prior scans found ambient `pk.` placeholders. Use:
    ```yaml
    # Phase 2 / SEC-01 — D-09. Trufflehog config for CI deep-scan complementing gitleaks pre-commit.
    # Most defaults are fine; this file's purpose is to allowlist the pre-v1.0 archive if needed.
    detectors:
      # Use all default detectors; no excludes for v1.0 except path-level below.
    # Trufflehog v3.95 supports --exclude-paths via flag; this file documents repo-level intent.
    exclude_paths:
      - '.planning/phases/_archive/.*'
    ```
    If trufflehog v3.95.3 schema differs (verify via `trufflehog --help`), produce the equivalent. The Phase 4 GH Actions invocation will reference this file via `--config .trufflehog/config.yaml`.

    Per CLAUDE.md "Не коммитить секреты": these config files MUST NOT embed any secret values. They reference patterns and paths only.
  </action>
  <verify>
    <automated>test -f .gitleaks.toml && grep -q "useDefault = true" .gitleaks.toml && grep -q "mapbox-secret-token" .gitleaks.toml && grep -q "secret\\.lint-fixture\\.ts" .gitleaks.toml && test -f .pre-commit-config.yaml && grep -q "gitleaks/gitleaks" .pre-commit-config.yaml && grep -q "rev: v8.30.1" .pre-commit-config.yaml && test -f .trufflehog/config.yaml</automated>
  </verify>
  <done>3 config files exist at expected paths; gitleaks config has `useDefault = true`, both custom Mapbox rules, and the lint-fixture allowlist; pre-commit pinned to v8.30.1. Atomic commit: `feat(phase2-sec): add .gitleaks.toml + .pre-commit-config.yaml + trufflehog config (SEC-01/08)`.</done>
</task>

<task type="auto">
  <name>Task 2: Makefile scan-secrets target + init-pre-commit.sh installer + smoke test</name>
  <files>services/backend/Makefile, services/backend/scripts/secrets/init-pre-commit.sh</files>
  <action>
    Modify `services/backend/Makefile` per PATTERNS.md §Makefile + Pattern F. Add `scan-secrets` to the `.PHONY` declaration at the top of the file. Append a new target block following the shape of the existing `check-routes` target (line 79-80 — single-line cd + tool invocation; install-check idiom matching `migrate` target lines 46-49):

    ```
    scan-secrets:
    	@command -v gitleaks >/dev/null 2>&1 || { \
    		echo "gitleaks не установлен. Установите: brew install gitleaks"; exit 1; }
    	cd .. && gitleaks detect --no-banner --redact --source .
    ```

    The `cd ..` matters — Makefile lives at `services/backend/Makefile`, and gitleaks must scan from repo root (where `.gitleaks.toml` resides). Add a help-text entry under the existing `help:` block at line 14 area: `@echo "  scan-secrets    Run gitleaks against repo (Phase 2 / SEC-01)"`.

    Create `services/backend/scripts/secrets/init-pre-commit.sh` per PATTERNS.md §init-pre-commit.sh + Pattern E:

    ```
    #!/usr/bin/env bash
    # Phase 2 / SEC-01 — D-08 — pre-commit installer for new dev workstations.
    # Run once per laptop after cloning the repo.

    set -euo pipefail

    command -v pre-commit >/dev/null 2>&1 || {
        echo "pre-commit not installed. Run: brew install pre-commit (or: pip install pre-commit==4.6.0)"
        exit 1
    }

    cd "$(git rev-parse --show-toplevel)"
    pre-commit install
    echo "✓ pre-commit hook installed at .git/hooks/pre-commit"
    echo "  Verify: pre-commit run --all-files"
    ```

    `chmod +x services/backend/scripts/secrets/init-pre-commit.sh`. Run `bash services/backend/scripts/secrets/init-pre-commit.sh` — must succeed (assuming Task 0 of 02-01 installed pre-commit).

    Smoke test the pre-commit hook end-to-end:
    1. Create temp test file outside of repo: `mkdir -p /tmp/gitleaks-smoke && cd /tmp/gitleaks-smoke && git init && cp <repo>/.gitleaks.toml .gitleaks.toml`
    2. Stage a fake leak: `echo 'const x = "sk.eyJ1IjoiZmFrZWlkIiwiYSI6ImNrcXFxYWFhYTAwMWEybG90eHh4eHh4eHgifQ.signature-bytes-here-need-to-be-at-least-twenty-chars"' > leak.go && git add leak.go`
    3. Run `gitleaks protect --staged --redact --no-banner --config .gitleaks.toml` — MUST exit non-zero (finding detected).
    4. Sanity test the allowlist: copy `apps/mobile-rn/src/__fixtures__/secret.lint-fixture.ts` content to the same temp file at the SAME path within the temp repo. Re-run — should NOT trigger the mapbox-secret-token rule because of the allowlist entry. (Note: this test uses a stand-in path; the canonical allowlist match is verified in `verify` step against the real repo.)
    5. Cleanup: `rm -rf /tmp/gitleaks-smoke`.

    Then run `make scan-secrets` from `services/backend/` — must exit 0 if repo is clean OR exit non-zero with a clear report if any current finding (current expectation per RESEARCH §full-history-scan §Expected outcome: HIGH confidence zero findings).
  </action>
  <verify>
    <automated>grep -q "scan-secrets" services/backend/Makefile && grep -q "gitleaks detect" services/backend/Makefile && test -x services/backend/scripts/secrets/init-pre-commit.sh && pre-commit run gitleaks --all-files 2>&1 | tee /tmp/precommit-output.txt; PRECOMMIT_EXIT=$?; grep -v "^secret\\.lint-fixture" /tmp/precommit-output.txt | grep -i "finding" >/dev/null 2>&1; if [ $PRECOMMIT_EXIT -ne 0 ]; then echo "REVIEW: pre-commit findings — see /tmp/precommit-output.txt"; fi; bash services/backend/scripts/secrets/init-pre-commit.sh</automated>
  </verify>
  <done>Makefile has `scan-secrets` target invokable via `make scan-secrets` from `services/backend/`; init-pre-commit.sh installs hook successfully; pre-commit smoke test confirms allowlist works (fixture path NOT flagged) and bare `sk.…` IS flagged in a temp repo. Atomic commit: `feat(phase2-sec): add scan-secrets Makefile target + pre-commit installer (SEC-01/08)`.</done>
</task>

<task type="auto">
  <name>Task 3: Run full-history scan + commit artifacts + log Incident Log in docs/SECRETS.md</name>
  <files>docs/gitleaks-history-scan.json, docs/trufflehog-history-scan.json, docs/SECRETS.md</files>
  <action>
    Execute the one-time full-history scan per D-12 + RESEARCH §full-history-scan:

    ```bash
    # gitleaks: scan entire git history, all branches
    gitleaks detect \
      --no-banner \
      --redact \
      --report-format json \
      --report-path docs/gitleaks-history-scan.json \
      --log-opts="--all" \
      --source .

    # trufflehog: complementary verified-secret scan
    trufflehog git \
      --json \
      --no-update \
      --only-verified \
      file://. \
      > docs/trufflehog-history-scan.json
    ```

    The scans run on `feat/cursona-redesign` (active branch) AND all other branches via `--log-opts="--all"`. Expected outcome per RESEARCH §full-history-scan: HIGH confidence ZERO findings on `sk.…`/`pk.…` (pre-v1.0 `git grep` audit was clean). LOW confidence on `MAPBOX_DOWNLOADS_TOKEN=...` patterns in archived planning files in `.planning/phases/_archive/pre-v1.0-territory-refactors/` — these would be allowlisted in `.gitleaks.toml` if they appear, OR if they are real (not placeholder) values, trigger immediate rotation per D-12 (NOT history rewrite).

    Classify each finding (if any) per RESEARCH Pitfall 7:
    - **(a) Intentional fixture** — already covered by Task 1's `.gitleaks.toml` allowlist (`apps/mobile-rn/src/__fixtures__/secret.lint-fixture.ts`). If a finding is in this path, no action needed.
    - **(b) Historical leak — rotation required.** Real value committed to history. Per D-12, do NOT rewrite history. Trigger rotation by:
      1. Adding an `## Incident Log` section near the top of `docs/SECRETS.md` (per PATTERNS.md §`docs/SECRETS.md` MOD-extend §Add Incident Log).
      2. Logging the finding (commit SHA, file path, finding type — NOT the secret value, since gitleaks `--redact` already hid it).
      3. Cross-referencing the rotation playbook (existing for Mapbox `sk.`; for other secret types, the playbooks land in 02-04).
    - **(c) False positive** — add allowlist entry in `.gitleaks.toml` with descriptive comment (e.g. test data, doc placeholder).

    Modify `docs/SECRETS.md` per D-12 + PATTERNS.md — add an `## Incident Log` section near the top (after the existing `# SECRETS` header and lead paragraph, before `## Инвентарь токенов`). Use RU heading style matching the existing file (Pattern D). Section body:

    ```markdown
    ## Incident Log

    Хроника утечек, ротаций и историко-сканирующих находок. Каждая запись:
    дата, какой токен/секрет, что произошло, какие действия предприняты, статус.

    | Дата | Секрет | Событие | Действия | Статус | Ссылка |
    |------|--------|---------|----------|--------|--------|
    | 2026-05-{day} | (см. полную ротацию в 02-04) | Pre-v1.0 chat leak: все 3 Mapbox-токена однажды передавались в чат с AI | Treated-as-compromise full reset (02-04 / SEC-03..04); ADR-0006 | In-progress (02-04) | `docs/DECISIONS/0006-mapbox-token-incident.md` |
    | 2026-05-{day} | gitleaks history scan | Полное `--log-opts="--all"` сканирование репо | См. `docs/gitleaks-history-scan.json` | {Clean / N findings — rotated} | — |
    | 2026-05-{day} | trufflehog history scan | Verified-secret deep scan | См. `docs/trufflehog-history-scan.json` | {Clean / N findings — rotated} | — |
    ```

    The full extension of `docs/SECRETS.md` (10 rotation playbooks per D-18) is OUT OF SCOPE for this plan — it lands in 02-04 with the Mapbox playbook update (per PATTERNS.md §docs/SECRETS.md MOD-extend §Sections to add — 10 total kept together for atomicity).

    Commit both JSON artifacts to `docs/` per D-12 (audit trail visible in git history; values are `--redact`ed so safe to commit). If file size is large (>1 MB), check it isn't binary garbage; should be plain JSON.
  </action>
  <verify>
    <automated>test -f docs/gitleaks-history-scan.json && test -f docs/trufflehog-history-scan.json && python3 -c "import json; d=json.load(open('docs/gitleaks-history-scan.json')); print(f'gitleaks findings: {len(d) if isinstance(d, list) else 1}')" && grep -q "## Incident Log" docs/SECRETS.md && grep -q "gitleaks-history-scan.json" docs/SECRETS.md</automated>
  </verify>
  <done>`docs/gitleaks-history-scan.json` and `docs/trufflehog-history-scan.json` exist and are valid JSON (parseable by `python3 -c "import json; json.load(open(...))"`); `docs/SECRETS.md` has `## Incident Log` section listing the scan results and cross-referencing 02-04 for the in-progress Mapbox rotation; any (b)-class historical finding has both an Incident Log entry AND a rotation action committed (or, if none found, the log notes "Clean — no findings"). Atomic commit: `docs(phase2-sec): full-history scan + Incident Log skeleton (SEC-01)`.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| developer-shell ↔ git-index | Pre-commit hook is the gate — staged content cannot be committed without passing gitleaks regex + allowlist |
| repo ↔ history (any prior commit) | One-time `gitleaks --log-opts="--all"` scan is the gate — historical secrets are surfaced for rotation, never silently hidden |
| pre-commit-hook ↔ `--no-verify` bypass | ROADMAP §Hard Rules bans `--no-verify`; Phase 4 CI gitleaks is the backstop when this hard rule fails socially |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-02-16 | Information Disclosure | Mapbox `sk.<token>` literal committed in a `.go`/`.ts`/`.md` file via the upstream gitleaks default rule which only catches keyword-adjacent `pk.` | mitigate | Custom rule `mapbox-secret-token` regex `\bsk\.[A-Za-z0-9_-]{60,}\.[A-Za-z0-9_-]{20,}\b` (Task 1); no keyword proximity required; matches the actual Mapbox token format. Closes RESEARCH Pitfall 2 explicitly. |
| T-02-17 | Information Disclosure | Mapbox `pk.<token>` literal committed without the keyword "mapbox" nearby | mitigate | Custom rule `mapbox-public-token-bare` regex (Task 1); flags for review even though `pk.` is "public" — leakage still enables quota abuse / Bundle-ID restriction bypass attempts. |
| T-02-18 | Repudiation | dev uses `git commit --no-verify` to bypass the gitleaks pre-commit hook and lands a secret | accept (with backstop) | ROADMAP §Hard Rules ban `--no-verify`; Phase 4 CI gitleaks runs on every PR as backstop (this plan lands the CONFIG; Phase 4 wires the INVOCATION). For v1.0 two-dev team, social-trust gate is acceptable. |
| T-02-19 | Tampering | a malicious actor with commit access weakens `.gitleaks.toml` rules (removes a custom rule, broadens the allowlist) to land a secret undetected | mitigate | PR review on `.gitleaks.toml` changes (Phase 4 branch protection); changes to allowlist paths require justification in the commit message. For v1.0 closed-beta with 2 trusted devs, residual risk is accepted. |
| T-02-20 | Information Disclosure | pre-commit hook is slow (>5s) on large stagings → dev disables it or skips → first leak follows | mitigate | D-11 + RESEARCH §pre-commit-config — gitleaks default entry uses `--staged` which scans only staged files, typically <100 ms on practical staging sizes. Budget <5 s per D-11. If a future commit's staging exceeds this, `pre-commit run gitleaks` profile is logged. |
| T-02-21 | Information Disclosure | full-history scan reveals an old leaked `sk.` token that is STILL ACTIVE in Mapbox dashboard (Pitfall 7 — would require rotation NOW, not history rewrite) | mitigate | Task 3 explicitly classifies any (b)-class finding and triggers Incident Log + rotation. Rotation for Mapbox specifically is the 02-04 user-action checkpoint — cross-reference is recorded. D-12 + ROADMAP §Hard Rule "do not rewrite history; rotate" enforced. |
| T-02-22 | Information Disclosure | gitleaks `--redact` truncates the secret in the JSON report but leaks the commit SHA + path, allowing an attacker who later reads the report to git-archive that commit and view the unredacted file | accept | The audit artifact (`docs/gitleaks-history-scan.json`) is committed to a public-ish repo; the commit SHA is intrinsic to git history. Mitigation is rotation: the leaked secret should already be revoked by the time the report is committed. Phase 4 CI keeps trufflehog `--only-verified` running to detect future regressions where a rotated-but-still-active secret slips back in. |
| T-02-23 | Denial of Service | trufflehog `--only-verified` rate-limits or accidentally triggers API abuse alarms on Mapbox/AWS by hammering the verification endpoint | accept | One-time scan only in this phase; Phase 4 CI runs it on PR commits which is low cadence. Trufflehog handles rate limiting internally per its docs. |
| T-02-24 | Information Disclosure | `.trufflehog/config.yaml` `exclude_paths` mistakenly broadens to hide a real leak in `.planning/phases/_archive/...` | mitigate | The exclude is scoped narrowly to `.planning/phases/_archive/.*` (archived pre-v1.0 planning); gitleaks scans the same paths WITHOUT the exclude (defense in depth). If trufflehog flags something in the archive, gitleaks will too. |
</threat_model>

<verification>
- `gsd-sdk query verify.plan-structure` returns valid
- `gitleaks version` returns ≥ 8.30.x; `pre-commit --version` returns ≥ 4.6.x
- `.gitleaks.toml`, `.pre-commit-config.yaml`, `.trufflehog/config.yaml` all exist at expected paths
- `pre-commit run gitleaks --all-files` exits 0 OR exits non-zero with findings classifiable per Task 3 logic (no unhandled findings remain at commit boundary)
- `services/backend/Makefile` has `scan-secrets` target; `make scan-secrets` invokable from `services/backend/`
- `services/backend/scripts/secrets/init-pre-commit.sh` is executable; running it on a fresh clone installs `.git/hooks/pre-commit` successfully
- `docs/gitleaks-history-scan.json` + `docs/trufflehog-history-scan.json` valid JSON, committed
- `docs/SECRETS.md` has new `## Incident Log` section near top
- Smoke test: temp git repo with fake `sk.…` literal triggers gitleaks block; same content under `apps/mobile-rn/src/__fixtures__/secret.lint-fixture.ts` does NOT trigger
</verification>

<success_criteria>
SEC-01 partial: gitleaks + trufflehog configs exist and `--log-opts="--all"` runs clean (or any findings are properly classified and rotated per D-12). CI wiring deferred to Phase 4 / CICD-01 per D-09.
SEC-08 closed: pre-commit hook scans for AWS / AKIA / GitHub PAT / Mapbox `sk.` / Mapbox `pk.` literals; v8.30.1 pinned; lint-fixture allowlist preserved.

`docs/SECRETS.md` extended with `## Incident Log` skeleton — full playbook extension (10 rotation playbooks per D-18) lands in 02-04 alongside the Mapbox dashboard rotation.
</success_criteria>

<output>
After completion, create `.planning/phases/02-secrets-and-config-hardening/02-03-SUMMARY.md` recording:
- Exact `gitleaks` + `trufflehog` versions pinned in configs and used for the one-time scan
- Number of findings from gitleaks `--log-opts="--all"` scan; per-finding classification ((a)/(b)/(c)) and disposition
- Number of findings from trufflehog `--only-verified` scan; per-finding action taken
- Note that the `## Incident Log` skeleton is in place; full 10-playbook extension lands in 02-04
- Confirmation that `apps/mobile-rn/src/__fixtures__/secret.lint-fixture.ts` is allowlisted and not flagged
- Confirmation that the pre-commit smoke test (staging a `sk.…` literal in a temp repo) blocks the commit
</output>
