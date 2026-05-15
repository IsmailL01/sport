---
phase: 02-secrets-and-config-hardening
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .sops.yaml
  - .gitattributes
  - .gitignore
  - .secrets/dev/shared.yaml
  - .secrets/dev/mapbox.yaml
  - .secrets/dev/oauth.yaml
  - .secrets/staging/shared.yaml
  - .secrets/staging/mapbox.yaml
  - .secrets/staging/oauth.yaml
  - .secrets/prod/shared.yaml
  - .secrets/prod/mapbox.yaml
  - .secrets/prod/oauth.yaml
  - .secrets/README.md
  - services/backend/scripts/secrets/verify_sops_roundtrip.sh
autonomous: false
requirements:
  - SEC-02
tags:
  - secrets
  - sops
  - age
  - encryption
  - backend
user_setup:
  - service: sops+age toolchain
    why: "SOPS encryption requires sops + age binaries installed per developer workstation"
    install_cmd: "brew install sops age gitleaks trufflehog pre-commit"
    expected_versions:
      sops: ">= v3.13.0"
      age: ">= v1.3.1"
      gitleaks: ">= v8.30.1"
      trufflehog: ">= v3.95.3"
      pre-commit: ">= v4.6.0"
  - service: age master key
    why: "Per-developer X25519 key required to encrypt/decrypt .secrets/**"
    action: "Each developer runs `age-keygen -o ~/.config/sops/age/keys.txt`, copies the public key (printed to stderr) into Task 1's .sops.yaml recipients list; backs up private key to 1Password sealed entry + encrypted USB per D-04"

must_haves:
  truths:
    - "sops + age + gitleaks + trufflehog + pre-commit installed locally at HIGH-confidence pinned versions"
    - "Two age keypairs exist on dev workstations; both public keys recorded as recipients in .sops.yaml"
    - ".sops.yaml at repo root has a single creation_rule for .secrets/**/*.yaml using age key_groups"
    - "9 encrypted YAML files exist under .secrets/{dev,staging,prod}/{shared,mapbox,oauth}.yaml; each decrypts cleanly with `sops -d`"
    - "Round-trip smoke test (sops -d --output-type=dotenv) produces correct KEY=value lines for shared.yaml — guards Pitfall 1 regression"
    - "`.gitattributes` marks `.secrets/**/*.yaml` as binary (or `-text`) to prevent merge-conflict ciphertext corruption (Pitfall 5)"
    - "`.gitignore` does NOT block `.secrets/**/*.yaml` (encrypted state is safe to commit; only plaintext `.env` stays blocked)"
  artifacts:
    - path: .sops.yaml
      provides: "creation_rules for .secrets/**/*.yaml with age recipients"
      contains: "creation_rules"
    - path: .secrets/dev/shared.yaml
      provides: "SOPS-encrypted dev runtime secrets (POSTGRES_PASSWORD, JWT_SECRET, MinIO, Expo, Caddy)"
    - path: .secrets/dev/mapbox.yaml
      provides: "SOPS-encrypted dev Mapbox tokens (pk./sk. placeholder until 02-04 rotation)"
    - path: .secrets/dev/oauth.yaml
      provides: "SOPS-encrypted dev OAuth placeholders (Strava/Google/Apple — deferred to Phase 11/12)"
    - path: .secrets/staging/shared.yaml
      provides: "Same shape as dev/shared.yaml, distinct JWT_SECRET per Open Question Q2"
    - path: .secrets/staging/mapbox.yaml
      provides: "Same shape as dev/mapbox.yaml, distinct staging Mapbox tokens"
    - path: .secrets/staging/oauth.yaml
      provides: "Same shape as dev/oauth.yaml"
    - path: .secrets/prod/shared.yaml
      provides: "SOPS-encrypted prod runtime secrets — values populated in 02-04 after toolchain proven"
    - path: .secrets/prod/mapbox.yaml
      provides: "SOPS-encrypted prod Mapbox slots — values populated in 02-04 after dashboard rotation"
    - path: .secrets/prod/oauth.yaml
      provides: "SOPS-encrypted prod OAuth placeholders"
    - path: .secrets/README.md
      provides: "Directory legend pointing to docs/RUNBOOKS/sops-edit.md (warning: never edit *.yaml directly)"
    - path: services/backend/scripts/secrets/verify_sops_roundtrip.sh
      provides: "Smoke-test that encrypts a sample file then dotenv-decrypts to catch Pitfall 1 multi-line/dollar-sign regressions"
    - path: .gitattributes
      provides: "`.secrets/**/*.yaml -text` (or `binary`) — prevents 3-way merge ciphertext corruption per Pitfall 5"
  key_links:
    - from: .sops.yaml
      to: ".secrets/**/*.yaml"
      via: "creation_rules path_regex"
      pattern: "path_regex.*\\\\.secrets"
    - from: .secrets/dev/shared.yaml
      to: "age key_groups in .sops.yaml"
      via: "SOPS encrypts on save against recipient list"
      pattern: "age:"
    - from: services/backend/scripts/secrets/verify_sops_roundtrip.sh
      to: ".secrets/dev/shared.yaml"
      via: "sops -d --output-type=dotenv pipeline"
      pattern: "sops -d --output-type=dotenv"
---

<objective>
Stand up the SOPS+age secrets infrastructure: install toolchain, generate per-dev age keys, commit `.sops.yaml` recipient configuration at the repo root, create the 9-file `.secrets/<env>/{shared,mapbox,oauth}.yaml` layout encrypted at rest with placeholder values, and prove round-trip decrypt works (especially `--output-type=dotenv` per RESEARCH Pitfall 1). This plan lands the encryption substrate; values for prod Mapbox slots are populated in 02-04 after dashboard rotation.

Purpose: SEC-02 requires every secret living in SOPS-encrypted files. No SOPS scaffold exists today (bus factor of 1 on the prod VPS). Phase 3 IaC will consume from these encrypted YAMLs — strict gate per user redline. Per CONTEXT D-01..D-06: age backend (not PGP/cloud KMS), `.secrets/<env>/{shared,mapbox,oauth}.yaml` layout, decrypt-once-at-deploy via `sops --output-type=dotenv`.

Output: 9 SOPS-encrypted YAML files, `.sops.yaml` recipient config, `.gitattributes` merge-safety, `.gitignore` clarification, `.secrets/README.md` directory legend, and a `verify_sops_roundtrip.sh` smoke script.
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
@CLAUDE.md
@docs/SECRETS.md
@.gitignore
@services/backend/docker-compose.prod.yml

<!-- Interface contracts that downstream plans (02-02, 02-03, 02-04) consume -->
<interfaces>
- `.sops.yaml` creation_rule covers `.secrets/**/*.yaml` (no other globs) — 02-03 `.gitleaks.toml` does NOT need a SOPS-content allowlist because gitleaks scans plaintext-staged content and never sees the encrypted blob's "secret-looking" markers as raw strings.
- `.secrets/<env>/shared.yaml` keys (canonical, consumed by docker-compose.prod.yml unchanged):
  - `POSTGRES_PASSWORD`, `JWT_SECRET` (≥32 bytes — `pkg/auth.NewSigner` enforces), `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`, `EXPO_ACCESS_TOKEN`, `CADDY_ACME_EMAIL`
- `.secrets/<env>/mapbox.yaml` keys:
  - `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN` (pk.), `MAPBOX_DOWNLOADS_TOKEN` (sk.)
- `.secrets/<env>/oauth.yaml` keys (placeholders only in v1.0):
  - `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `GOOGLE_OAUTH_CLIENT_SECRET`, `APPLE_SIGN_IN_CLIENT_SECRET`
- `verify_sops_roundtrip.sh` exit code 0 on success; any non-zero exit signals a Pitfall 1 regression.
</interfaces>
</context>

<tasks>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 0: USER ACTION — Install toolchain + generate per-dev age keys</name>
  <what-built>
    Claude has prepared the plan; the next steps require physical access to each developer workstation (private-key material cannot leave the workstation, per D-04). After this checkpoint clears, all subsequent tasks are autonomous.
  </what-built>
  <how-to-verify>
    1. Run: `brew install sops age gitleaks trufflehog pre-commit` (≈30 s on M1/M2 Mac).
    2. Verify versions meet HIGH-confidence pins from RESEARCH §Standard Stack:
       - `sops --version` → `3.13.x` or newer
       - `age --version` → `v1.3.1` or newer
       - `gitleaks version` → `8.30.x` or newer
       - `trufflehog --version` → `3.95.x` or newer
       - `pre-commit --version` → `4.6.x` or newer
    3. Generate this dev's age key:
       ```bash
       mkdir -p ~/.config/sops/age
       age-keygen -o ~/.config/sops/age/keys.txt
       chmod 600 ~/.config/sops/age/keys.txt
       ```
       Note the **public key** printed to stderr (`Public key: age1...`).
    4. Append `export SOPS_AGE_KEY_FILE=$HOME/.config/sops/age/keys.txt` to `~/.zshrc` (or current shell rc) and `source` it.
    5. Back up the private key per D-04: 1Password sealed entry + encrypted USB drive (separate physical location). Recovery is impossible without it (Pitfall 4).
    6. Repeat steps 3-5 on the **second developer workstation**. Exchange the two public keys out-of-band (Signal/Slack DM is fine — public keys are non-secret).
    7. Paste both public keys here as the resume signal so Task 1 can write them into `.sops.yaml`.
  </how-to-verify>
  <resume-signal>Paste both age public keys (format `age1xxxx...`), one per line, labeled `DEV_A_AGE_PUBKEY:` and `DEV_B_AGE_PUBKEY:`. If only one developer is active for v1.0, paste the same key twice — recipient duplication is harmless and preserves the two-recipient invariant from day one per Pitfall 4.</resume-signal>
</task>

<task type="auto">
  <name>Task 1: Write .sops.yaml + .gitattributes + .gitignore comment</name>
  <files>.sops.yaml, .gitattributes, .gitignore</files>
  <action>
    Create `.sops.yaml` at the repo root with a single `creation_rules` entry matching `path_regex: '\.secrets/.*\.yaml$'` and an `age:` key_groups list containing the two public keys captured in Task 0 (and a commented-out placeholder line for the CI key that Phase 4 will append). Follow the verified shape in RESEARCH.md §Code Examples §sops-config and PATTERNS.md §.sops.yaml — single creation rule for v1.0 simplicity per Claude's discretion area D-05. Add a leading comment line referencing Phase 2 / SEC-02 / D-01..D-05.

    Create `.gitattributes` at the repo root (or append if it exists) with `*.yaml -text` scoped to `.secrets/**` to neutralize git's 3-way text merge on encrypted ciphertext per RESEARCH Pitfall 5. The exact pattern is `.secrets/**/*.yaml -text` so other YAMLs in the repo are unaffected.

    Modify `.gitignore` to add a single comment line near the existing `# ===== Секреты =====` block explaining that `.secrets/**/*.yaml` are committed encrypted (no functional change to ignore rules — `.secrets/` differs from the lowercase `secrets/` already-ignored path per PATTERNS.md §.gitignore VERIFY). The added comment is in Russian to match the existing block style per Pattern D (Russian docs + English code identifiers).
  </action>
  <verify>
    <automated>test -f .sops.yaml && grep -qE "age1[a-z0-9]{50,}" .sops.yaml && grep -q "creation_rules" .sops.yaml && grep -qE "\.secrets.*-text" .gitattributes && grep -q ".secrets/" .gitignore</automated>
  </verify>
  <done>`.sops.yaml` contains two age public keys (real `age1...` values, no placeholders), creation rule matches the expected path_regex, `.gitattributes` excludes `.secrets/**/*.yaml` from text-merge, `.gitignore` has the clarifying comment. Atomic commit: `feat(phase2-sec): add .sops.yaml + age recipients + merge-safety (SEC-02)`.</done>
</task>

<task type="auto">
  <name>Task 2: Create 9 encrypted .secrets/&lt;env&gt;/&lt;group&gt;.yaml files + README</name>
  <files>.secrets/dev/shared.yaml, .secrets/dev/mapbox.yaml, .secrets/dev/oauth.yaml, .secrets/staging/shared.yaml, .secrets/staging/mapbox.yaml, .secrets/staging/oauth.yaml, .secrets/prod/shared.yaml, .secrets/prod/mapbox.yaml, .secrets/prod/oauth.yaml, .secrets/README.md</files>
  <action>
    For each of the 9 `.secrets/<env>/<group>.yaml` files: open with `EDITOR=cat sops <path>` style or use `sops` non-interactively by writing a plaintext template then re-encrypting via `sops --encrypt --in-place <path>`. Key schemas come from the `<interfaces>` block above (canonical mapping from `docker-compose.prod.yml` `${VAR:?}` enforcement points per PATTERNS.md §docker-compose.prod.yml VERIFY).

    Per-env value strategy (Open Question Q2 → distinct per env):
    - **dev/shared.yaml**: dev-only weak values for local docker-compose-up sessions (e.g. `POSTGRES_PASSWORD: "re_dev"`, `JWT_SECRET: $(openssl rand -hex 32)` — 64 hex chars > 32 bytes, MinIO `minioadmin`/`minioadmin`, placeholder `EXPO_ACCESS_TOKEN: ""` per D-19 / PATTERNS.md notifications special-case, `CADDY_ACME_EMAIL: "dev@local"`).
    - **staging/shared.yaml**: fresh `openssl rand`-generated values distinct from dev; placeholder Expo token; staging Caddy email.
    - **prod/shared.yaml**: fresh `openssl rand`-generated values distinct from dev AND staging; placeholder Expo token; prod Caddy email (use `<owner-of-record>` until user supplies — leave as documented placeholder + flag in the commit message so 02-04 doc task addresses).
    - **{dev,staging,prod}/mapbox.yaml**: leave `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN: "pk.PLACEHOLDER_REPLACE_IN_02-04"` and `MAPBOX_DOWNLOADS_TOKEN: "sk.PLACEHOLDER_REPLACE_IN_02-04"`. Real values land via SOPS edit during 02-04 after Mapbox dashboard rotation.
    - **{dev,staging,prod}/oauth.yaml**: placeholders per PATTERNS.md §.secrets/dev/oauth.yaml — `STRAVA_CLIENT_ID/SECRET: "<deferred-phase-11-12>"`, `GOOGLE_OAUTH_CLIENT_SECRET: "<deferred-v1.1>"`, `APPLE_SIGN_IN_CLIENT_SECRET: "<deferred-v1.1>"`.

    Encryption command per file (preferred sequence — works without an interactive editor):
    ```bash
    cat > /tmp/sops-plaintext.yaml <<EOF
    # ... plaintext content ...
    EOF
    sops --encrypt --input-type yaml --output-type yaml /tmp/sops-plaintext.yaml > .secrets/<env>/<group>.yaml
    shred -u /tmp/sops-plaintext.yaml
    ```
    The `creation_rules` in `.sops.yaml` from Task 1 will be picked up automatically; no `--age` flag needed.

    Create `.secrets/README.md` per PATTERNS.md §`.secrets/README.md` — Russian header, short paragraph on directory contents, pointer to `docs/RUNBOOKS/sops-edit.md` (created in 02-04), warning that direct edits corrupt ciphertext.
  </action>
  <verify>
    <automated>for f in .secrets/dev/shared.yaml .secrets/dev/mapbox.yaml .secrets/dev/oauth.yaml .secrets/staging/shared.yaml .secrets/staging/mapbox.yaml .secrets/staging/oauth.yaml .secrets/prod/shared.yaml .secrets/prod/mapbox.yaml .secrets/prod/oauth.yaml; do test -f "$f" || { echo "MISSING: $f"; exit 1; }; head -1 "$f" | grep -qE '^(POSTGRES_PASSWORD|EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN|STRAVA_CLIENT_ID): ENC\[' || { echo "NOT ENCRYPTED: $f"; exit 1; }; sops -d "$f" >/dev/null || { echo "DECRYPT FAILS: $f"; exit 1; }; done; test -f .secrets/README.md</automated>
  </verify>
  <done>All 9 encrypted YAML files exist; each is encrypted at rest (first line begins with `KEY: ENC[`); each decrypts cleanly via `sops -d`; README.md present at `.secrets/README.md`. Atomic commit: `feat(phase2-sec): create .secrets/{dev,staging,prod}/{shared,mapbox,oauth}.yaml (SEC-02)`. Plaintext temp files MUST be shredded (`shred -u`) before commit — verify no plaintext value of `POSTGRES_PASSWORD` appears in `git status` output.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Write verify_sops_roundtrip.sh smoke script + run it</name>
  <files>services/backend/scripts/secrets/verify_sops_roundtrip.sh</files>
  <behavior>
    - Round-trip test 1: `sops -d --output-type=dotenv .secrets/dev/shared.yaml` produces ≥6 lines matching `^[A-Z_]+=.+$` (POSTGRES_PASSWORD, JWT_SECRET, MINIO_ROOT_USER, MINIO_ROOT_PASSWORD, EXPO_ACCESS_TOKEN, CADDY_ACME_EMAIL).
    - Round-trip test 2: same for `.secrets/dev/mapbox.yaml` — 2 lines (EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN, MAPBOX_DOWNLOADS_TOKEN).
    - Pitfall 1 regression guard: assert NO output line contains a literal space character (would indicate dotenv-mangled multi-line PEM — RESEARCH Pitfall 1 known sops bugs #724/#784/#1435/#1951). If a future P8 cert or PEM key needs to land, this assertion forces an explicit re-design (use `sops -d` YAML output + Go `os.ReadFile`, NOT `--output-type=dotenv`).
    - Pitfall 1 regression guard 2: assert NO output line contains a literal `$` followed by `{` (would indicate shell interpolation risk).
    - Cross-recipient test: assert `sops -d` works for both age recipients — defers actual cross-test to Wave 1 manual verification when both devs are on shift, but the script exits 0 if `SOPS_AGE_KEY_FILE` decrypts.
    - Exit 0 on all assertions passing; exit 1 with a clear `slog.Error`-style message on any failure.
  </behavior>
  <action>
    Write `services/backend/scripts/secrets/verify_sops_roundtrip.sh` per Pattern E (`set -euo pipefail` + `command -v` guard) and PATTERNS.md §`init-pre-commit.sh` analog. Use a temporary file under `$(mktemp -d)` for output capture; shred at end via `trap`. Script should accept an optional `--env dev|staging|prod` flag; default to `dev`. Reference behavior block above for the exact assertions. Per CLAUDE.md "не коммитить секреты": the script MUST NOT print secret values to stdout — only `KEY=` prefixes are logged (e.g. `Found: POSTGRES_PASSWORD=<redacted>` if logging needed).

    After writing, execute it: `bash services/backend/scripts/secrets/verify_sops_roundtrip.sh --env dev` and verify exit 0. The smoke test catches Pitfall 1 BEFORE 02-04 populates prod values (cheap early-fail per RESEARCH §Validation §SEC-02 Wave 0 Gaps).

    Set executable bit: `chmod +x services/backend/scripts/secrets/verify_sops_roundtrip.sh`.
  </action>
  <verify>
    <automated>test -x services/backend/scripts/secrets/verify_sops_roundtrip.sh && bash services/backend/scripts/secrets/verify_sops_roundtrip.sh --env dev && bash services/backend/scripts/secrets/verify_sops_roundtrip.sh --env staging && bash services/backend/scripts/secrets/verify_sops_roundtrip.sh --env prod</automated>
  </verify>
  <done>Script exists at `services/backend/scripts/secrets/verify_sops_roundtrip.sh`, executable, all three env smoke tests exit 0. Atomic commit: `feat(phase2-sec): add SOPS round-trip smoke test guarding Pitfall 1 (SEC-02)`.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| developer-workstation ↔ repo | Private age key never leaves workstation; only public keys committed |
| repo ↔ deploy-host (Phase 3) | Encrypted YAMLs in git history; private key delivered out-of-band to /etc/sops/age.key on VPS |
| repo ↔ third-party-AI/chat | SOPS-encrypted blobs are safe to share; plaintext values NEVER touch chat (CLAUDE.md hard rule "Не коммитить секреты" — extended to "не передавать в чат") |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-02-01 | Information Disclosure | `~/.config/sops/age/keys.txt` (master private key) | mitigate | mode 600 enforced by `age-keygen`; D-04 redundancy (1Password sealed entry + USB physical backup); never copy to email/chat/cloud-sync |
| T-02-02 | Tampering | `.sops.yaml` recipient list (an attacker with commit access could add their own age key as a recipient and gain decrypt rights on every subsequent `sops updatekeys`) | mitigate | recipient list reviewed in PR; Phase 4 will require code-review on `.sops.yaml` changes (branch protection); for v1.0 closed-beta with 2-dev team, social-trust gate is acceptable |
| T-02-03 | Information Disclosure | encrypted YAML in git history | accept | SOPS encrypts VALUES with X25519+ChaCha20 (age default); leaking the encrypted blob without the private key is computationally infeasible at current crypto strength (V6 ASVS) |
| T-02-04 | Denial of Service | master age key loss on both devs simultaneously (Pitfall 4) | mitigate | two-recipient invariant from day one (Task 1 enforces); 1Password sealed + USB per dev (D-04); recovery playbook documented in `docs/RUNBOOKS/sops-edit.md` (created in 02-04) |
| T-02-05 | Tampering | merge-conflict ciphertext corruption (Pitfall 5) | mitigate | `.gitattributes` marks `.secrets/**/*.yaml` as `-text` to prevent 3-way merge; resolution playbook in `docs/RUNBOOKS/sops-edit.md` |
| T-02-06 | Information Disclosure | plaintext values leaked via `sops --output-type=dotenv` shell-interpolation of `$VAR` or space-stripping multi-line PEM (Pitfall 1) | mitigate | `verify_sops_roundtrip.sh` asserts no spaces, no `${`; current v1.0 secret inventory is all single-line strings (verified RESEARCH A3); iOS P8 cert (Phase 10) explicitly excluded per RESEARCH Pitfall 1 §How-to-avoid |
| T-02-07 | Information Disclosure | plaintext temp files (`/tmp/sops-plaintext.yaml` during Task 2 bootstrap) surviving Task completion | mitigate | `shred -u` mandated in Task 2 action; verify step greps `git status` for plaintext leakage |
| T-02-08 | Repudiation | dev commits an encrypted file with their own recipient key but forgets to add the partner's key, locking partner out | accept | `creation_rules` in `.sops.yaml` enforces multi-recipient encryption automatically on every `sops <file>` invocation — accidental single-recipient encryption requires explicit `--age` flag override (not used in this plan); verification step decrypts with both keys (Wave 1 manual cross-test) |
</threat_model>

<verification>
- `gsd-sdk query verify.plan-structure` on this PLAN.md returns valid
- `sops --version` ≥ 3.13.0 on both dev workstations
- `age --version` ≥ v1.3.1 on both dev workstations
- All 9 `.secrets/<env>/<group>.yaml` files exist, encrypted at rest, decrypt cleanly
- `verify_sops_roundtrip.sh --env {dev,staging,prod}` all exit 0
- `.gitattributes` includes `.secrets/**/*.yaml -text` (or `binary`) rule
- `.sops.yaml` references two distinct `age1...` public keys (no placeholder strings remain)
- No plaintext secret value appears in `git diff --cached` at any commit boundary
</verification>

<success_criteria>
SEC-02 partial completion: SOPS encryption substrate in place. The 9-file `.secrets/` tree exists, encrypts via two age recipients, decrypts via either developer's private key, and survives the `--output-type=dotenv` round-trip without Pitfall 1 regressions. Values for `.secrets/prod/mapbox.yaml` remain placeholders pending 02-04's Mapbox dashboard rotation; values for `.secrets/{dev,staging,prod}/oauth.yaml` are intentional placeholders per CONTEXT D-02 (Strava populated in Phase 11/12; Google/Apple deferred indefinitely per Deferred Ideas).

Phase 2 SEC-02 is closed when 02-04 lands the rotated Mapbox tokens; this plan delivers the infrastructure that makes that step a single `EDITOR=vim sops .secrets/prod/mapbox.yaml` operation.
</success_criteria>

<output>
After completion, create `.planning/phases/02-secrets-and-config-hardening/02-01-SUMMARY.md` recording:
- The two age public keys committed to `.sops.yaml` (public keys only — they ARE shareable)
- Exact `sops`, `age`, `gitleaks`, `trufflehog`, `pre-commit` versions installed on each dev workstation
- Verification that `verify_sops_roundtrip.sh` exits 0 for all three envs
- Any deviation from PATTERNS.md §Shared Patterns (none expected; flag if encountered)
- Note that `.secrets/prod/mapbox.yaml` and `.secrets/prod/oauth.yaml` contain placeholders awaiting 02-04 / Phase 11-12 respectively
</output>
