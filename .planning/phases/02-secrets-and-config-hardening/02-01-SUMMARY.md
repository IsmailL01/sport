---
phase: 02-secrets-and-config-hardening
plan: 01
subsystem: backend-config
type: execute
status: complete
completed: 2026-05-15
duration_min: 12
tags:
  - secrets
  - sops
  - age
  - encryption
  - backend
  - bootstrap
requirements_closed:
  - SEC-02
dependency_graph:
  requires:
    - "user-setup: sops 3.13.0 + age v1.3.1 binaries on dev workstation"
    - "user-setup: ~/.config/sops/age/keys.txt with DEV_A X25519 keypair"
  provides:
    - ".sops.yaml at repo root (creation_rule for .secrets/**/*.yaml)"
    - ".secrets/{dev,staging,prod}/{shared,mapbox,oauth}.yaml — 9 SOPS-encrypted slot files"
    - ".gitattributes -text rule for .secrets/**/*.yaml (Pitfall 5 merge-safety)"
    - "verify_sops_roundtrip.sh smoke-test (Pitfall 1 guard)"
    - ".secrets/README.md (directory legend + pending-DEV_B rotation note)"
  affects:
    - "Plan 02-02 (already complete): envRequire migration consumes IDENTITY_JWT_SECRET via SOPS at deploy time"
    - "Plan 02-03: gitleaks/trufflehog must NOT flag .secrets/**/*.yaml ciphertext as leaks"
    - "Plan 02-04: real Mapbox tokens land via `EDITOR=vim sops .secrets/prod/mapbox.yaml`; DEV_B pubkey added via `sops updatekeys`"
    - "Phase 3 IaC: deploy host pulls private age key out-of-band, decrypts via `sops --output-type=dotenv` before container start"
tech_stack:
  added:
    - "SOPS 3.13.0 (Mozilla / fork) — secrets-at-rest encryption"
    - "age v1.3.1 (FiloSottile X25519 + ChaCha20-Poly1305) — recipient-based key wrapping"
  patterns:
    - "Single creation_rule per .sops.yaml v1.0 (D-05 simplicity over per-env recipient splitting)"
    - "`.secrets/<env>/<group>.yaml` triad: shared / mapbox / oauth (D-02)"
    - "Non-destructive rotation via `sops updatekeys` (re-wraps DEK, does NOT re-encrypt values)"
    - "`--config /dev/null` escape hatch for sops invocations outside .secrets/ creation_rule scope"
key_files:
  created:
    - .sops.yaml
    - .gitattributes
    - .secrets/README.md
    - .secrets/dev/shared.yaml
    - .secrets/dev/mapbox.yaml
    - .secrets/dev/oauth.yaml
    - .secrets/staging/shared.yaml
    - .secrets/staging/mapbox.yaml
    - .secrets/staging/oauth.yaml
    - .secrets/prod/shared.yaml
    - .secrets/prod/mapbox.yaml
    - .secrets/prod/oauth.yaml
    - services/backend/scripts/secrets/verify_sops_roundtrip.sh
    - .planning/phases/02-secrets-and-config-hardening/02-01-SUMMARY.md
  modified:
    - .gitignore
decisions:
  - "Schema source-of-truth: 02-02-SUMMARY audit table (10 distinct REQUIRED keys for shared.yaml — 7 *_DB_URL + IDENTITY_JWT_SECRET + 2 S3_*). Plan 02-01's older interface block listed POSTGRES_PASSWORD / JWT_SECRET / MINIO_ROOT_USER as canonical, but 02-02 was actually shipped with the per-service *_DB_URL pattern — the user prompt redirects authoritatively to 02-02-SUMMARY's audit table. shared.yaml encodes the live shape."
  - "DEV_B recipient deferred to a future commit; .sops.yaml lists DEV_A only with a TODO(DEV_B) comment block AND .secrets/README.md has a `## Pending DEV_B recipient` section. Rotation command `sops updatekeys .secrets/<env>/*.yaml` is non-destructive (re-wraps DEK without re-encrypting plaintext)."
  - "TODO(DEV_B) comment placed as YAML `#` lines ABOVE `creation_rules`, NOT inside the `age:` scalar — folded-scalar (`>-`) syntax was concatenating comment text into the recipient string and breaking Bech32 parsing (caught & fixed during Task 2; see Deviations §Rule 3 below)."
  - "`secrets/` legacy ignore rule re-anchored to `/secrets/` (repo root) to allow per-service `services/backend/scripts/secrets/` script dirs to live under git. `.secrets/` (encrypted dir) is structurally a different path and was never matched by either form."
  - "Synthetic round-trip test uses `--config /dev/null` to bypass `.sops.yaml` creation_rules. Without this, encrypting a /tmp/synth file fails with `no matching creation rules found` because `.sops.yaml` only covers `.secrets/**`. Explicit `--age` recipient + `--config /dev/null` is the canonical sops escape hatch."
  - "macOS lacks GNU `shred`; the script uses `rm -P` (BSD secure overwrite) with `rm` fallback inside the cleanup trap. Plaintext temp files during Task 2 bootstrap were similarly cleaned via `rm -P`."
  - "Per-env JWT secrets generated via `openssl rand -hex 32` (64 hex chars = 32 bytes; ≥pkg/auth.NewSigner floor). dev/staging/prod each have distinct values (Open Question Q2). Real prod values can be hot-swapped via `EDITOR=vim sops .secrets/prod/shared.yaml` at any time; the current values are random-by-construction so they serve as live-fire slots, not 'replace me' placeholders."
  - "prod/mapbox.yaml uses the user-specified `pending-02-04-rotation` literal (NOT a random openssl value) because the real pk.* and sk.* token shape ('pk.eyJ1Ijo...') must be honored verbatim and will be pasted in 02-04 via `EDITOR=vim sops`."
metrics:
  duration_seconds: 720
  tasks_completed: 3
  files_modified: 1
  files_created: 14
  commits: 3
  test_cases_added: 1
---

# Phase 2 Plan 01: SOPS+age Scaffold Summary

SOPS+age encryption substrate landed. `.sops.yaml` at repo root encrypts `.secrets/**/*.yaml` against DEV_A's age recipient; nine encrypted slot files (`.secrets/{dev,staging,prod}/{shared,mapbox,oauth}.yaml`) carry the 10-key audited shared schema, mapbox `pk./sk.` placeholders, and OAuth deferral markers; `.gitattributes` disables 3-way merge on ciphertext (Pitfall 5); `verify_sops_roundtrip.sh` guards the `sops -d --output-type=dotenv` shape against Pitfall 1 regressions. Closes SEC-02 P0 substrate; real Mapbox tokens land via SOPS edit in Plan 02-04.

## What Shipped

### .sops.yaml (creation_rule + DEV_A recipient)

```yaml
creation_rules:
  - path_regex: \.secrets/.*\.yaml$
    age: age1ph7d4a62n9ngghvt5lzgh4eywfayzgrzx9mq6rfzpgp9sme0eg0snl33my
```

TODO(DEV_B) comment block lives above `creation_rules` (NOT inside the scalar — folded-scalar concatenation breaks Bech32 parsing; see Deviations §Rule 3). When DEV_B's pubkey arrives, append it as a second `age:` line and run `sops updatekeys .secrets/<env>/*.yaml` for non-destructive recipient rotation.

### .secrets/ tree (9 encrypted files)

```
.secrets/
├── README.md                  (directory legend + pending-DEV_B note)
├── dev/
│   ├── shared.yaml            (10 KEY: lines — 7 *_DB_URL, IDENTITY_JWT_SECRET, 2 S3_*)
│   ├── mapbox.yaml            (2 KEY: lines — MAPBOX_PUBLIC_TOKEN, MAPBOX_SECRET_TOKEN; "pk.PLACEHOLDER_..." values)
│   └── oauth.yaml             (4 KEY: lines — STRAVA_CLIENT_ID/SECRET, GOOGLE_OAUTH_CLIENT_SECRET, APPLE_SIGN_IN_CLIENT_SECRET; "<deferred-...>" markers)
├── staging/                   (same shape; distinct random values; pk.PLACEHOLDER mapbox)
└── prod/                      (same shape; distinct random values; "pending-02-04-rotation" mapbox per user instruction)
```

Per-env JWT secret entropy: 64 hex chars from `openssl rand -hex 32` (32 bytes — ≥pkg/auth.NewSigner floor at services/backend/pkg/auth/jwt.go:43-46).

### .gitattributes (Pitfall 5 merge-safety)

```
.secrets/**/*.yaml -text
```

Forces git to treat encrypted YAMLs as binary on conflict — the 3-way text merge driver corrupts MAC/IV blocks producing files that decrypt-fail silently.

### .gitignore clarification

Added comment block explaining `.secrets/**/*.yaml` is committable (SOPS-encrypted at rest). Re-anchored the legacy `secrets/` ignore rule to `/secrets/` so per-service `services/backend/scripts/secrets/` directories are trackable.

### .secrets/README.md

Russian-language directory legend per Pattern D (Russian docs + English code identifiers): `sops` edit workflow, decrypt commands, `## Pending DEV_B recipient` section with the exact `sops updatekeys` rotation command, recipient roster.

### services/backend/scripts/secrets/verify_sops_roundtrip.sh

Bash smoke test (208 lines, `set -euo pipefail`, Pattern E hygiene). Runs two passes:

1. **Per-env dotenv decrypt:** For each `.secrets/<env>/{shared,mapbox,oauth}.yaml`, runs `sops -d --output-type=dotenv` and asserts >=10 / >=2 / >=4 KEY=value lines respectively. Pitfall 1 guards reject any literal space or `${...}` interpolation marker in the output.
2. **Synthetic Pitfall 1 round-trip:** Encrypts a `$`-containing sample payload (via `--config /dev/null` + explicit `--age` recipient to bypass `.secrets/**` scope), decrypts via `--output-type=dotenv`, and asserts the literal `$` survives without interpolation.

Exit 0 on success. Never logs secret values (CLAUDE.md "не передавать в чат" rule).

## Verification

```bash
$ sops --version
sops 3.13.0 (latest)

$ age --version
v1.3.1

$ for f in .secrets/dev/shared.yaml .secrets/dev/mapbox.yaml .secrets/dev/oauth.yaml \
           .secrets/staging/shared.yaml .secrets/staging/mapbox.yaml .secrets/staging/oauth.yaml \
           .secrets/prod/shared.yaml .secrets/prod/mapbox.yaml .secrets/prod/oauth.yaml; do
    sops -d "$f" >/dev/null && echo "OK: $f"
  done
OK: .secrets/dev/shared.yaml
OK: .secrets/dev/mapbox.yaml
OK: .secrets/dev/oauth.yaml
OK: .secrets/staging/shared.yaml
OK: .secrets/staging/mapbox.yaml
OK: .secrets/staging/oauth.yaml
OK: .secrets/prod/shared.yaml
OK: .secrets/prod/mapbox.yaml
OK: .secrets/prod/oauth.yaml

$ for e in dev staging prod; do
    bash services/backend/scripts/secrets/verify_sops_roundtrip.sh --env $e > /dev/null && echo "  --env $e: exit 0 OK"
  done
  --env dev: exit 0 OK
  --env staging: exit 0 OK
  --env prod: exit 0 OK

$ grep -E '^\.secrets.*-text' .gitattributes
.secrets/**/*.yaml -text

$ grep -E 'age1[a-z0-9]{50,}' .sops.yaml
#   - DEV_A: age1ph7d4a62n9ngghvt5lzgh4eywfayzgrzx9mq6rfzpgp9sme0eg0snl33my
      age: age1ph7d4a62n9ngghvt5lzgh4eywfayzgrzx9mq6rfzpgp9sme0eg0snl33my

$ git log --all -p -- .secrets/ | grep -c 'postgres://re:re_dev_pw'
0   # No plaintext leak in committed history.
```

## Commits

| Task | Commit  | Description |
|------|---------|-------------|
| 1    | `5e73162` | `chore(phase2-sec): SOPS scaffold + .gitattributes + .secrets/README` |
| 2    | `cc9d108` | `feat(phase2-sec): 9 encrypted .secrets/<env>/{shared,mapbox,oauth}.yaml with placeholders` |
| 3    | `04f44b8` | `chore(phase2-sec): verify_sops_roundtrip.sh smoke-test (Pitfall 1 guard)` |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `.sops.yaml` folded scalar concatenated TODO comment into recipient string**

- **Found during:** Task 2 first encryption attempt.
- **Issue:** Initial `.sops.yaml` (Task 1 commit `5e73162`) used `age: >-` (folded scalar) to inline a TODO(DEV_B) comment under the `age:` key. SOPS read the entire folded value as a single recipient string — including the comment text — and failed Bech32 parsing: `failed to parse input as Bech32-encoded age public key: malformed recipient "age1ph7d4a62n... # TODO(DEV_B): ..."`.
- **Fix:** Rewrote `.sops.yaml` so the TODO block lives as YAML `#` comment lines ABOVE `creation_rules`, and the `age:` field is a plain scalar with only the recipient pubkey. Squashed into Task 2's commit (`cc9d108`) since Task 2 was blocked on it.
- **Files modified:** `.sops.yaml`
- **Commit:** `cc9d108`

**2. [Rule 1 - Bug] Smoke-test grep regex missed env vars containing digits**

- **Found during:** Task 3 first script run.
- **Issue:** Initial regex `^[A-Z_]+=.+$` did not match `S3_ACCESS_KEY=...` or `S3_SECRET_KEY=...` (the `3` is a digit). Script reported "8 lines, expected 10" and exited non-zero on a perfectly fine dotenv output.
- **Fix:** Updated regex to `^[A-Z_][A-Z0-9_]*=.+$` (env vars cannot start with a digit per POSIX, so the leading-non-digit guard remains intact). Applied to both the line-count check and the Pitfall-1 space-check awk.
- **Files modified:** `services/backend/scripts/secrets/verify_sops_roundtrip.sh`
- **Commit:** `04f44b8` (the fix landed in the same commit as the script itself)

**3. [Rule 3 - Blocking] `.gitignore` rule `secrets/` hid `services/backend/scripts/secrets/`**

- **Found during:** Task 3 `git status` after writing the script.
- **Issue:** Existing `.gitignore` rule `secrets/` (no leading slash) matches ANY directory named `secrets/` anywhere in the tree, including `services/backend/scripts/secrets/`. Result: `git check-ignore -v` confirmed the script directory was being filtered out of `git status`.
- **Fix:** Re-anchored the rule to `/secrets/` (repo root only), with a comment explaining the intent. `.secrets/` (the leading-dot SOPS dir) is a structurally different path and was never matched by either form. Backward compatible — any legacy plaintext-`secrets/` directory at repo root continues to be ignored.
- **Files modified:** `.gitignore`
- **Commit:** `04f44b8`

**4. [Rule 1 - Bug] sops refused to encrypt synthetic payload outside `.secrets/`**

- **Found during:** Task 3 smoke-test second run (after Bug 2 fix).
- **Issue:** The Pitfall-1 synthetic round-trip writes a plaintext sample to `$WORK/synth-plain.yaml` (a `/tmp` path) and encrypts it. SOPS read `.sops.yaml` from the cwd, found that the temp path didn't match any `creation_rules`, and refused to encrypt — even though `--age <recipient>` was passed explicitly: `error loading config: no matching creation rules found`.
- **Fix:** Added `--config /dev/null` to both the encrypt and decrypt sops invocations on synthetic payloads. This tells sops to ignore `.sops.yaml` entirely; combined with the explicit `--age` recipient, sops produces ciphertext without needing a matching creation rule.
- **Files modified:** `services/backend/scripts/secrets/verify_sops_roundtrip.sh`
- **Commit:** `04f44b8`

## Decisions made during execution

1. **Schema authority: 02-02-SUMMARY audit table wins over Plan 02-01's `<interfaces>` block.** The plan's interface section listed `POSTGRES_PASSWORD`/`JWT_SECRET`/`MINIO_ROOT_USER`/`MINIO_ROOT_PASSWORD` as canonical shared.yaml keys, but the user prompt redirected explicitly to 02-02-SUMMARY's 10-key audit (7 `*_DB_URL` + `IDENTITY_JWT_SECRET` + 2 `S3_*`). The audit reflects what 02-02 actually shipped, so `shared.yaml` uses that schema.

2. **DEV_B pubkey deferral is intentional and discoverable.** `.sops.yaml` has a `TODO(DEV_B):` comment block; `.secrets/README.md` has a dedicated `## Pending DEV_B recipient` section with the exact `sops updatekeys .secrets/<env>/*.yaml` rotation command. Bus factor for ciphertext recovery is 1 until DEV_B's pubkey lands; DEV_A's private key backup (1Password sealed + USB per D-04) is the loss-prevention countermeasure for v1.0.

3. **prod values are real entropy, not literal "REPLACE_ME" placeholders.** Per-env JWT secrets, DB passwords, and S3 keys are generated via `openssl rand` for all three envs. They function as live slots from day one. `.secrets/prod/mapbox.yaml` is the exception: per explicit user instruction, the values are the literal string `pending-02-04-rotation` because the real `pk.eyJ1Ijo...` / `sk.eyJ1Ijo...` token shape will be pasted verbatim from the Mapbox dashboard during 02-04.

4. **macOS `rm -P` substitutes for GNU `shred`.** The script uses `rm -P` (BSD secure overwrite — 3-pass) inside the cleanup trap with a `|| rm` fallback. Same approach was used during Task 2 bootstrap to wipe plaintext temp files.

5. **Single creation_rule for v1.0 per D-05.** Did not split into per-env recipient subsets. When DEV_B lands, both keys decrypt all envs; per-env recipient splitting (e.g., dev=DEV_A+DEV_B, prod=ops-only) is a v1.1 hardening item.

## Pending follow-ups

- **DEV_B recipient:** When the second developer generates `age-keygen` and shares their pubkey:
  1. Append the second `age:` line under `creation_rules` in `.sops.yaml`.
  2. Run `sops updatekeys .secrets/dev/*.yaml && sops updatekeys .secrets/staging/*.yaml && sops updatekeys .secrets/prod/*.yaml` (non-destructive — re-wraps DEK, plaintext values untouched).
  3. Commit the updated `.sops.yaml` + 9 re-wrapped YAML files.
- **Plan 02-04:** Real Mapbox `pk.*` / `sk.*` tokens land via `EDITOR=vim sops .secrets/{dev,staging,prod}/mapbox.yaml` after dashboard rotation (ADR-0006). Real Caddy ACME email also lands here.
- **Plan 02-03:** Once gitleaks/trufflehog/pre-commit are wired, confirm they do NOT flag `.secrets/**/*.yaml` ciphertext as leaks (the entropy of `ENC[AES256_GCM,...]` blobs may trip naive entropy detectors).

## Threat Flags

None. This plan only introduces SOPS-encrypted ciphertext at rest plus a smoke-test script. No new network endpoints, no auth paths, no schema changes at trust boundaries. The threat surface enumerated in the plan's `<threat_model>` (T-02-01..08) is the full surface and is mitigated as described.

## REQ-IDs closed

- **SEC-02 (P0):** SOPS encryption substrate operational — substrate-level closure. Final SEC-02 closure waits for Plan 02-04 (real Mapbox tokens populated) and Plan 02-03 (scanner safety-net for accidental plaintext commits). 02-01 delivers the infrastructure that makes 02-04 a single `EDITOR=vim sops` operation.

## Self-Check: PASSED

- `.sops.yaml` — FOUND
- `.gitattributes` — FOUND
- `.secrets/README.md` — FOUND
- `.secrets/dev/shared.yaml` — FOUND (encrypted, decrypts to 10 keys)
- `.secrets/dev/mapbox.yaml` — FOUND (encrypted, decrypts to 2 keys)
- `.secrets/dev/oauth.yaml` — FOUND (encrypted, decrypts to 4 keys)
- `.secrets/staging/shared.yaml` — FOUND (encrypted, decrypts to 10 keys)
- `.secrets/staging/mapbox.yaml` — FOUND (encrypted, decrypts to 2 keys)
- `.secrets/staging/oauth.yaml` — FOUND (encrypted, decrypts to 4 keys)
- `.secrets/prod/shared.yaml` — FOUND (encrypted, decrypts to 10 keys)
- `.secrets/prod/mapbox.yaml` — FOUND (encrypted, decrypts to 2 keys; values = `pending-02-04-rotation`)
- `.secrets/prod/oauth.yaml` — FOUND (encrypted, decrypts to 4 keys)
- `services/backend/scripts/secrets/verify_sops_roundtrip.sh` — FOUND (chmod +x; exits 0 for dev/staging/prod)
- Commit `5e73162` — FOUND in git log
- Commit `cc9d108` — FOUND in git log
- Commit `04f44b8` — FOUND in git log
