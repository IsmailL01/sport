---
phase: 02-secrets-and-config-hardening
plan: 04
subsystem: security/mapbox-rotation
tags:
  - secrets
  - mapbox
  - rotation
  - adr
  - runbook
  - documentation
  - sops

requires:
  - 02-01  # .sops.yaml + age recipient + .secrets/<env>/mapbox.yaml placeholders
  - 02-03  # docs/SECRETS.md ## Incident Log skeleton (we append the rotation-closeout row here)

provides:
  - adr-0006-mapbox-incident       # docs/DECISIONS/0006-mapbox-token-incident.md
  - sops-edit-runbook              # docs/RUNBOOKS/sops-edit.md (9-section workflow reference)
  - secrets-extended-playbooks     # docs/SECRETS.md extended to 10 rotation playbooks
  - mapbox-tokens-rotated          # .secrets/{dev,staging,prod}/mapbox.yaml — real new pk./sk. via SOPS
  - incident-log-closeout          # (b)-class Mapbox chat-leak row flipped from "pending" → "complete"

affects:
  - apps/mobile-rn (runtime pk. now sourced from SOPS via EAS env injection — wiring lands in Phase 3 deploy automation)
  - services/backend/* (sk. for SDK download stays CI-only — no runtime read by Go services)

tech-stack:
  added: []
  patterns:
    - "sops --set non-interactive write (avoids EDITOR plaintext window per CONTEXT D-19)"
    - "Round-trip decrypt verification via sops -d --extract → shell var → prefix check → unset"
    - "Single-token strategy for v1.0 closed-beta (1 sk. + 1 pk. shared across prod/staging/dev) — per-env split is v1.1 tech debt per ADR-0006 §Сценарии пересмотра"

key-files:
  created:
    - docs/DECISIONS/0006-mapbox-token-incident.md
    - docs/RUNBOOKS/sops-edit.md
    - .planning/phases/02-secrets-and-config-hardening/02-04-SUMMARY.md
  modified:
    - docs/SECRETS.md                  # extended to 10 rotation playbooks (Task 2); Incident Log row added then flipped to complete (Tasks 3-4)
    - .secrets/prod/mapbox.yaml        # EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN + MAPBOX_DOWNLOADS_TOKEN keys (orphan MAPBOX_PUBLIC_TOKEN/MAPBOX_SECRET_TOKEN placeholders left in place — small follow-up cleanup)
    - .secrets/staging/mapbox.yaml     # same shape
    - .secrets/dev/mapbox.yaml         # same shape

requirements-closed:
  - SEC-03   # Mapbox token rotation completed (new tokens in SOPS, smoke green, old tokens revoked in dashboard)
  - SEC-04   # Treated-as-compromise incident response documented in ADR-0006
  - SEC-07   # Operational documentation (SOPS edit RUNBOOK + 10-playbook SECRETS.md)

verification:
  - sops_set_calls: 6  # 3 envs × 2 keys
  - sops_decrypt_roundtrip: PASS  # all 3 envs, both keys present, correct prefixes (pk./sk.), len 86
  - mapbox_curl_smoke_styles_api: HTTP 200
  - pre_commit_gitleaks_on_encrypted_yaml: PASS  # .secrets/** allowlist working
  - dashboard_revoke_old_tokens: USER-CONFIRMED 2026-05-16 (old dev-public / prod-public / server-secret deleted)

commits:
  - a67beb0: "docs(phase2-sec): ADR-0006 Mapbox token incident reset" (Task 2)
  - dffe2cd: "docs(phase2-sec): RUNBOOK for SOPS edit/decrypt/rotate workflows" (Task 2)
  - ccc39c1: "docs(phase2-sec): extend SECRETS.md with 10 rotation playbooks" (Task 2)
  - 58b15eb: "docs(phase2-sec): ADR-0006 §Митигации Phase B verdict (A) confirmed" (Task 1 closeout into ADR)
  - 881f912: "feat(phase2-sec): rotate Mapbox tokens via SOPS + Incident Log row (SEC-03/04)" (Tasks 3-4 SOPS-write side)
  - (this commit): "docs(phase2-sec): 02-04-SUMMARY + Incident Log complete (SEC-03/04/07)"

duration-min: ~95  # spread across 2 sessions: Task 2 docs in prior session (≈25 min); Task 1 verdict + Tasks 3-4 SOPS-write + closeout in this session (≈70 min including the prefix-mismatch halt + SOPS_AGE_KEY_FILE diagnosis)

---

# Plan 02-04 — Mapbox Token Incident & Docs (SUMMARY)

## What shipped

### Task 1 — Verify-before-rotate (USER)
- User opened `https://account.mapbox.com/access-tokens` (account `iassd` / `dragon2015516@gmail.com`)
- Verdict: **(A) Available as documented** — Bundle ID + Android SHA-256 restriction UI both present in the token creation dialog
- RESEARCH Pitfall 9 confidence: **MEDIUM → HIGH** (the assumed-but-uncertain restriction UI is real)
- Recorded in ADR-0006 §Митигации (Phase B section flipped from PENDING to VERIFIED in commit `58b15eb`)

### Task 2 — Documentation (CLAUDE)
- **`docs/DECISIONS/0006-mapbox-token-incident.md`** — full Pattern C ADR (RU headings): Контекст / Решение / Альтернативы / Обоснование / Последствия / Митигации / Сценарии пересмотра / Ссылки
- **`docs/RUNBOOKS/sops-edit.md`** — 9-section SOPS workflow reference (Environment Setup / Edit / Create / Decrypt-stdout / Decrypt-dotenv / Rotate-recipients / Recovery / Merge-conflicts / Deploy-sequence)
- **`docs/SECRETS.md`** extended (per CONTEXT D-18 — extend, do not replace) with 10 rotation playbooks: Mapbox sk. (existing) + Mapbox pk. (new) + POSTGRES_PASSWORD + JWT_SECRET + MINIO_ROOT_USER/PASSWORD (paired) + EXPO_ACCESS_TOKEN + CADDY_ACME_EMAIL + OAuth client secrets + SOPS_AGE_KEY + NATS auth (v1.1-deferred stub)
- 10-row §Полный реестр (v1.0) table added at top of §Инвентарь токенов indexing every secret type
- All values are placeholders (`<openssl rand -hex 32>` style) — no real tokens in any documentation per CLAUDE.md hard rule

### Task 3 — Dashboard rotation (USER)
- 1 new `sk.` created — `sport-mobile-build-sk-2026-05` — scopes `DOWNLOADS:READ` + `STYLES:READ` + `FONTS:READ` + `TILES:READ` + `DATASETS:LIST` + `DATASETS:READ`; no restrictions (sk. lives in CI/build only)
- 1 new `pk.` created — single-token strategy for v1.0 (shared across prod/staging/dev) — scopes `STYLES:READ` + `FONTS:READ` + `DATASETS:READ` + `VISION:READ`; iOS Bundle ID + Android SHA-256 restrictions applied per verdict A
- (Plan-as-written specified 3 per-env pk. tokens; user chose single-token strategy as v1.0 simplification — see "Deviations" below)
- 3 old tokens deleted in dashboard after Task 4 confirmed SOPS round-trip + smoke: `dev-public`, `prod-public`, `server-secret`

### Task 4 — SOPS write + smoke + Incident Log (CLAUDE)
- **6 sops --set calls** (3 envs × 2 keys) via `sops --set '[KEY] "value"' .secrets/<env>/mapbox.yaml`
  - First attempt failed with "no identity matched any of the recipients" — on macOS sops searches `~/Library/Application Support/sops/age/keys.txt` by default, but the key file lives at `~/.config/sops/age/keys.txt` (XDG path). Fix: `export SOPS_AGE_KEY_FILE=$HOME/.config/sops/age/keys.txt` before sops invocations. Files were not modified on the first failure (working tree stayed clean).
  - Pubkey derived from private key file matches `.sops.yaml` recipient `age1ph7d4a62n9ngghvt5lzgh4eywfayzgrzx9mq6rfzpgp9sme0eg0snl33my` (DEV_A)
- **Round-trip verified** in all 3 envs: `sops -d --extract '[KEY]'` → shell var → prefix check (`pk.*` / `sk.*`) → captured `${VAR: -4}` → `unset`. Both keys present, both prefixes correct, len 86 each, identical values across envs (single-token strategy).
- **Curl smoke** against `https://api.mapbox.com/styles/v1/mapbox/outdoors-v12` with decrypted pk. → **HTTP 200**. (No Bundle ID restriction enforcement on styles endpoint server-side — expected; restriction enforces on tile/download requests, not metadata endpoints.)
- **`docs/SECRETS.md` §Incident Log** — appended rotation row (status: `rotated, old-tokens: pending-revoke`), then flipped to `complete` after user signaled `old-revoked`; also flipped the original (b)-class Mapbox chat-leak row from `Pending rotation` → `complete`.

## Verification matrix

| Check                                                                                          | Result      |
| ---------------------------------------------------------------------------------------------- | ----------- |
| `.gitleaks.toml` allowlists `.secrets/**` (no false-positive on encrypted yaml commit)         | PASS        |
| `sops --set` non-interactive write (no EDITOR plaintext window)                                | PASS × 6    |
| `sops -d --extract` round-trip yields correct prefix + len 86 in all 3 envs                    | PASS × 3    |
| Mapbox styles API curl smoke with decrypted pk.                                                | HTTP 200    |
| Pre-commit gitleaks hook scan on the SOPS commit                                               | PASS        |
| ADR-0006 has all 8 RU sections (Контекст / Решение / Альтернативы / Обоснование / Последствия / Митигации / Сценарии пересмотра / Ссылки) | PASS |
| `docs/RUNBOOKS/sops-edit.md` 9-section structure complete                                      | PASS        |
| `docs/SECRETS.md` ≥10 `## Rotation Playbook` sections                                          | PASS (10)   |
| No real `sk.…` / `pk.…` literal anywhere in documentation                                      | PASS (grep clean) |
| Dashboard revoke of 3 old tokens                                                               | USER-CONFIRMED |

## Deviations from plan

1. **Schema name mismatch between 02-01 placeholders and 02-04 spec.** 02-01 created `.secrets/<env>/mapbox.yaml` with placeholder keys `MAPBOX_PUBLIC_TOKEN` / `MAPBOX_SECRET_TOKEN`. The actual canonical names (verified via code grep — `apps/mobile-rn/App.tsx`, `apps/mobile-rn/src/map/MapboxView.tsx`, `apps/mobile-rn/eas.json`, `apps/mobile-rn/.env.example`, `apps/mobile-rn/android/build.gradle`) are `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN` and `MAPBOX_DOWNLOADS_TOKEN`. Task 4 wrote the canonical names; the old placeholders remain in the encrypted YAMLs as harmless cruft. **Follow-up:** small cleanup commit to `sops` the orphan keys out (low priority — nothing reads them).

2. **Single-token strategy vs per-env split.** Plan Task 3 specified creating 4 distinct tokens (1 sk. shared + 3 pk. — one per env: `sport-mobile-runtime-pk-prod-2026-05`, `sport-mobile-runtime-pk-staging-2026-05`, `sport-mobile-runtime-pk-dev-2026-05`). User chose single-token strategy for v1.0 closed-beta: 1 sk. (shared) + 1 pk. (shared across all envs). Rationale: 2-dev closed-beta does not stress per-env blast-radius containment; the simplification is acceptable. **Recorded as v1.1 tech debt** in ADR-0006 §Сценарии пересмотра ("per-env pk. split when MAU > N or first leak post-launch").

3. **First-attempt input had two `sk.` values** mislabeled as 1 sk. + 1 pk. (Task 3 first paste). HALT triggered before any SOPS write; user re-pasted with correct `pk.` + `sk.` pair (`…vJdg` + `…_uow`). Detected via prefix-prefix-mismatch guard before any persistence. **Lesson:** the prefix assert (`[[ "$MAPBOX_PK" == pk.* ]]`) is the only thing that prevented a bundled-sk. failure mode identical to the pre-v1.0 `server-secret` incident this whole ADR is about. Worth keeping that assert in the canonical rotation playbook (`docs/SECRETS.md §Rotation Playbook — Mapbox pk.`).

4. **macOS sops age-key path** is `~/Library/Application Support/sops/age/keys.txt` by default; the key file on this workstation lives at the Linux/XDG path `~/.config/sops/age/keys.txt`. Without `SOPS_AGE_KEY_FILE` env var, sops failed silently to find the key. Fix: set the env var (or symlink to the macOS-native path). **Follow-up:** add a `direnv` `.envrc` (or shell rc snippet) to the repo so future SOPS calls don't trip over this. Note the issue in `docs/RUNBOOKS/sops-edit.md §Environment Setup`.

5. **Tokens in chat-history (Task 3 paste):** plan §Threat Model T-02-25 explicitly accepted this risk; the conversation transcript briefly held the new `pk.` + `sk.` values. The pre-v1.0 chat-leak pattern (`dev-public` / `prod-public` / `server-secret`) is technically being repeated by this rotation. Mitigation: chat scrub recommended; first-attempt mislabeled values (token-ids `…meb6` and `…v4g4`) should be **deleted at the Mapbox dashboard if they were ever real tokens** — flagged as a Phase 2 cleanup follow-up.

## Pending follow-ups (not blocking Phase 2 close)

- [ ] **SECRETS.md schema cleanup** — sops-out the orphan `MAPBOX_PUBLIC_TOKEN` / `MAPBOX_SECRET_TOKEN` keys from `.secrets/<env>/mapbox.yaml` (low priority — nothing reads them; pure hygiene).
- [ ] **Verify first-pair tokens** — token-ids `…meb6` and `…v4g4` from the Task 3 first-paste attempt. If real, delete at `https://account.mapbox.com/access-tokens` along with the 3 documented old tokens.
- [ ] **`~/.envrc` for SOPS_AGE_KEY_FILE** — add to dev setup so sops "just works" without env-var hint. Document in `docs/RUNBOOKS/sops-edit.md §Environment Setup` (note: the runbook may already cover macOS path discovery — verify on next docs pass).
- [ ] **EAS env-var wiring for prod/staging builds** — `eas.json` references `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN` but the actual injection path from SOPS → EAS Cloud is a Phase 3 (Deploy Automation) task. For v1.0 closed-beta, manual `eas secret:create --scope project --name EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN --value $(sops -d --extract '["EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN"]' .secrets/prod/mapbox.yaml)` works.
- [ ] **DEV_B age pubkey** — `.sops.yaml` still has the TODO for DEV_B; once provided, run `sops updatekeys .secrets/*.yaml` per RUNBOOK §Rotate recipients.
- [ ] **OPEN ISSUE — single-token v1.0 tech debt** — when v1.1 brings additional envs (e.g., per-region staging) or first leak post-launch, split into per-env pk. tokens per the original Task 3 plan.

## Phase 2 (Secrets & Config Hardening) — DONE

| Plan  | Status   | Closes                                                                     |
| ----- | -------- | -------------------------------------------------------------------------- |
| 02-01 | DONE     | SEC-02 substrate (SOPS+age scaffold + 9 encrypted slot files)              |
| 02-02 | DONE     | SEC-05 + SEC-06 + SEC-09 (envRequire fail-fast across 8 Go services + DEV_MODE prod-guard) |
| 02-03 | DONE     | SEC-01 partial (configs + clean full-history scan; CI invocation deferred to Phase 4 / CICD-01) + SEC-08 (pre-commit hook with custom Mapbox rules) |
| 02-04 | **DONE** | SEC-03 + SEC-04 + SEC-07 (Mapbox rotation + ADR-0006 + SOPS edit RUNBOOK + 10-playbook SECRETS.md extension) |

**Phase 2 closes the secrets/config hardening substrate.** Phase 3 (next, strict no-parallelization gate now lifts) can begin: per ROADMAP, Phase 3 is "Deploy Automation" (Ansible target consuming SOPS-decrypted env files on dev/staging/prod hosts).
