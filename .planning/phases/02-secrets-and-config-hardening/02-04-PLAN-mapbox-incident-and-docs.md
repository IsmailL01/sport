---
phase: 02-secrets-and-config-hardening
plan: 04
type: execute
wave: 3
depends_on:
  - 02-01
  - 02-03
files_modified:
  - docs/DECISIONS/0006-mapbox-token-incident.md
  - docs/RUNBOOKS/sops-edit.md
  - docs/SECRETS.md
  - .secrets/dev/mapbox.yaml
  - .secrets/staging/mapbox.yaml
  - .secrets/prod/mapbox.yaml
autonomous: false
requirements:
  - SEC-03
  - SEC-04
  - SEC-07
tags:
  - secrets
  - mapbox
  - rotation
  - adr
  - runbook
  - documentation
user_setup:
  - service: Mapbox dashboard
    why: "Token rotation is dashboard-only (no public Tokens API for revoke); user must authenticate at account.mapbox.com"
    account: "iassd / dragon2015516@gmail.com (per pre-v1.0 Plan 08 — verify still current)"
    dashboard_config:
      - task: "Confirm Bundle ID + Android SHA-256 restriction UI is available (RESEARCH Pitfall 9 MEDIUM-confidence verification)"
        location: "Mapbox Dashboard > Account > Access tokens > Create a token > Restrictions"
        if_unavailable: "Document fallback in ADR-0006 Mitigations: scope minimization + URL restrictions + 6-month rotation schedule"
      - task: "Create new sk. (CI/build-time) token with name sport-mobile-build-sk-2026-05"
        location: "Mapbox Dashboard > Access tokens > Create a token > [✓] Secret access token"
        scopes: "DOWNLOADS:READ + STYLES:READ + FONTS:READ + TILES:READ + DATASETS:LIST + DATASETS:READ"
      - task: "Create new pk. (runtime) token with name sport-mobile-runtime-pk-2026-05"
        location: "same dialog without 'Secret access token' checkbox"
        scopes: "STYLES:READ + FONTS:READ + DATASETS:READ + VISION:READ (NO secret-scopes — Phase 0 lesson)"
        restrictions: "iOS Bundle ID com.runningecosystem.mobile + Android SHA-256 fingerprint (debug + production keystores) per RESEARCH Pitfall 9; if UI unavailable use URL fallback"
      - task: "Paste new sk. and pk. values into SOPS via Claude (Task 3); verify pod install + map render in dev build"
        location: "developer workstation"
      - task: "Revoke 3 old tokens: dev-public, prod-public, server-secret (per pre-v1.0 Plan 08 incident inventory)"
        location: "Mapbox Dashboard > Access tokens > [Delete] each"
        timing: "AFTER Step 4 verification confirms new tokens work — never delete before new ones proven"

must_haves:
  truths:
    - "ADR-0006 (`docs/DECISIONS/0006-mapbox-token-incident.md`) exists with Russian section headers per Pattern C: Контекст / Решение / Альтернативы / Обоснование / Последствия / Митигации / Сценарии пересмотра / Ссылки"
    - "ADR-0006 documents the treated-as-compromise full reset of all 3 prior Mapbox tokens (dev-public, prod-public, server-secret)"
    - "ADR-0006 §Митигации includes the Bundle ID + Android SHA-256 restriction status (confirmed available / fallback used) per RESEARCH Pitfall 9 MEDIUM-confidence verification result"
    - "`docs/RUNBOOKS/sops-edit.md` exists with 9 numbered sections per PATTERNS.md §docs/RUNBOOKS/sops-edit.md (Environment Setup / Edit / Create / Decrypt-stdout / Decrypt-dotenv / Rotate-recipients / Recovery / Merge-conflict / Deploy-sequence)"
    - "`docs/SECRETS.md` EXTENDED (not replaced per D-18) with 10 rotation playbook sections: Mapbox sk. (existing), Mapbox pk. (new), POSTGRES_PASSWORD, JWT_SECRET, MINIO_ROOT_USER+PASSWORD (paired), EXPO_ACCESS_TOKEN, CADDY_ACME_EMAIL, OAuth client secrets, SOPS_AGE_KEY, NATS auth (deferred v1.1 stub)"
    - "`.secrets/{dev,staging,prod}/mapbox.yaml` populated with REAL new pk./sk. token values (replacing the 02-01 placeholders); old token revocation in dashboard COMPLETED by user"
    - "Mapbox `curl` smoke test against `https://api.mapbox.com/styles/v1/mapbox/outdoors-v12?access_token=<new-pk>` returns HTTP 200"
    - "`docs/SECRETS.md` §Incident Log (from 02-03) updated with rotation completion entry + ADR-0006 cross-reference"
  artifacts:
    - path: docs/DECISIONS/0006-mapbox-token-incident.md
      provides: "ADR documenting Mapbox token incident reset (SEC-04)"
      contains: "ADR-0006"
    - path: docs/RUNBOOKS/sops-edit.md
      provides: "SOPS edit/decrypt/rotate workflow reference (D-19 supporting SEC-07)"
      contains: "Environment Setup"
    - path: docs/SECRETS.md
      provides: "EXTENDED rotation playbooks for all 10 secret types (D-18 supporting SEC-07)"
      contains: "Rotation Playbook"
    - path: .secrets/prod/mapbox.yaml
      provides: "SOPS-encrypted prod Mapbox tokens — REAL values post-rotation (SEC-03)"
    - path: .secrets/staging/mapbox.yaml
      provides: "SOPS-encrypted staging Mapbox tokens"
    - path: .secrets/dev/mapbox.yaml
      provides: "SOPS-encrypted dev Mapbox tokens"
  key_links:
    - from: docs/DECISIONS/0006-mapbox-token-incident.md
      to: docs/SECRETS.md
      via: "§Ссылки cross-reference to §Mapbox rotation playbook + §Incident Log"
      pattern: "docs/SECRETS\\.md"
    - from: docs/SECRETS.md
      to: docs/RUNBOOKS/sops-edit.md
      via: "Rotation playbook §Шаг 2 'Обновить SOPS' instructs reader to run sops edit per RUNBOOK"
      pattern: "RUNBOOKS/sops-edit"
    - from: .secrets/prod/mapbox.yaml
      to: ADR-0006 §Решение section
      via: "ADR documents SOPS as the single canonical store"
      pattern: "\\.secrets/prod/mapbox\\.yaml"
    - from: docs/SECRETS.md §Incident Log
      to: docs/DECISIONS/0006-mapbox-token-incident.md
      via: "rotation completion entry cross-references ADR-0006"
      pattern: "0006-mapbox-token-incident"
---

<objective>
Land the Mapbox token incident reset (SEC-03 + SEC-04) AND the documentation extensions that close out Phase 2 (SEC-07): user performs Mapbox dashboard rotation; Claude generates ADR-0006 + the SOPS edit RUNBOOK + the 10-playbook extension of `docs/SECRETS.md`; new sk./pk. values flow into `.secrets/{dev,staging,prod}/mapbox.yaml` via SOPS edit; old tokens revoked by user; Incident Log updated.

Purpose: Per CONTEXT D-15 — all 3 prior Mapbox tokens (dev-public, prod-public, server-secret — per pre-v1.0 Plan 08 SUMMARY §known issue #4) "однажды передавались в чат с AI" and are treated-as-compromise. The full reset is the highest-stakes user action in Phase 2 — it requires Mapbox dashboard authentication that Claude cannot perform (per D-16). RESEARCH Pitfall 9 flags MEDIUM confidence on the Bundle ID + Android SHA-256 restriction UI being currently exposed in the dashboard; this plan adds a verify-before-rotate task so the user knows what to expect before clicking "Delete" on the old tokens.

Output: 1 new ADR, 1 new RUNBOOK, 1 EXTENDED rotation playbook doc, 3 modified encrypted YAMLs (real values replacing placeholders).
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
@.planning/phases/02-secrets-and-config-hardening/02-03-PLAN-scanners-and-precommit.md
@CLAUDE.md
@docs/SECRETS.md
@docs/DECISIONS/0001-framework-react-native.md
@docs/DECISIONS/0007-v1.0-release-contract.md

<interfaces>
ADR-0006 section structure (Pattern C — RU headings + numbered alternatives, mirrors ADR-0001 + ADR-0007):

```
# ADR-0006: Mapbox Token Incident & Full Reset

**Дата:** 2026-05-{day}
**Статус:** Accepted
**Контекст:** Phase 2 / SEC-03..04 (Milestone v1.0 Production Readiness)
**Решение:** Полный reset всех Mapbox-токенов как treated-as-compromise incident. Новые `sk.` (CI/build-time) + `pk.` (runtime) с {Bundle ID + SHA-256 / URL+scope-minimization} restrictions.

## Контекст
## Решение
## Альтернативы
## Обоснование
## Последствия
  ### Положительные
  ### Отрицательные / Риски
## Митигации
## Сценарии пересмотра
## Ссылки
```

`docs/RUNBOOKS/sops-edit.md` section structure (PATTERNS.md §docs/RUNBOOKS/sops-edit.md):

```
# SOPS Edit / Decrypt / Rotate Workflow

## Environment Setup
## Edit existing encrypted file
## Create new encrypted file
## Decrypt to stdout (read-only)
## Decrypt to dotenv
## Rotate recipients (after .sops.yaml edited)
## Recovery — Lost age key
## Merge conflicts on encrypted YAML
## Deploy sequence (Phase 3 Ansible target)
```

`docs/SECRETS.md` 10-playbook extension (PATTERNS.md §docs/SECRETS.md MOD-extend §Sections to add):

1. Mapbox `sk.` (EXISTING — keep verbatim)
2. Mapbox `pk.` (NEW — same 4-shape: Generate / Revoke-old / Update-SOPS / Validate; Restrictions step per RESEARCH Pitfall 9)
3. POSTGRES_PASSWORD (NEW — SQL `ALTER USER ... WITH PASSWORD`; update SOPS; deploy)
4. JWT_SECRET (NEW — `openssl rand -hex 32` ≥32 bytes; update SOPS; deploy; note that all signed JWTs invalidated → all users re-login)
5. MINIO_ROOT_USER+PASSWORD (NEW — paired rotation; MinIO admin API or container restart with new creds)
6. EXPO_ACCESS_TOKEN (NEW — expo.dev dashboard regenerate; update SOPS; notifications service picks up on restart)
7. CADDY_ACME_EMAIL (NEW — Caddy reloads ACME account on email change; lower-stakes — annotate "deploy config, not a secret per se" per RESEARCH Open Q1)
8. OAuth client secrets (NEW — Strava placeholder for Phase 11/12; Google/Apple stub for v1.1+)
9. SOPS_AGE_KEY (NEW — recipient rotation via `sops updatekeys` per Pitfall 8; full-data-key rotation only on insider-threat scenario)
10. NATS auth (NEW — deferred v1.1 stub per D-20; document current state: NATS open on Docker network)

Mapbox rotation playbook (existing structure in docs/SECRETS.md lines 40-100+ — REUSE shape):
- Шаг 1: Generate new token in dashboard
- Шаг 2: Revoke old (AFTER new proven)
- Шаг 3: Save locally — for v1.0 Phase 2 this step is MODIFIED: instead of writing to `~/.netrc` + `~/.gradle/gradle.properties` directly, the value goes into SOPS at `.secrets/prod/mapbox.yaml`. Local workstation copies still needed for `pod install` / `gradle build` per RESEARCH Pitfall 10 — but they sync FROM SOPS, not into it.
- Шаг 4: Validation

Verification commands (RESEARCH §Validation §SEC-03):
```bash
# pk. validation — Mapbox style API
curl -sS -o /dev/null -w "%{http_code}\n" "https://api.mapbox.com/styles/v1/mapbox/outdoors-v12?access_token=<NEW_PK>"
# Expected: 200

# sk. validation — Mapbox account/downloads
curl -sS -o /dev/null -w "%{http_code}\n" "https://api.mapbox.com/downloads/v2/mapbox-maps-ios/releases/ios/latest.json?access_token=<NEW_SK>"
# Expected: 200 (404 means token works but artifact path may have changed — still a valid auth)
```

Pre-v1.0 Plan 08 chat-leak inventory (per CONTEXT §scout_findings #4 — three tokens that ever touched chat):
- dev-public (`pk.…`) — used in dev workstation `.env` for local map render
- prod-public (`pk.…`) — bundled into production EAS builds for runtime map render
- server-secret (mistakenly created as `pk.…` instead of `sk.…`) — used for SDK download from CocoaPods/Maven

All 3 are revoked in Step 7 of the user-action checkpoint. New tokens replace them: new `sk.` for downloads (SDK at build), new `pk.` for runtime (map render).
</interfaces>
</context>

<tasks>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 1: USER ACTION — Verify Mapbox Bundle ID restriction UI availability (verify-before-rotate)</name>
  <what-built>
    Claude has prepared ADR-0006 skeleton (Task 2) and the rotation playbooks. Before the user proceeds to revoke the 3 prior Mapbox tokens (a destructive, irreversible operation), this checkpoint confirms RESEARCH Pitfall 9's MEDIUM-confidence assumption: that the Mapbox dashboard still exposes a Bundle ID + Android SHA-256 restriction UI distinct from URL restrictions. If the UI is unavailable, the fallback (scope minimization + URL restrictions + 6-month rotation schedule) gets baked into ADR-0006 §Митигации before revocation rather than after.
  </what-built>
  <how-to-verify>
    1. Open https://account.mapbox.com/access-tokens in a browser. Sign in with account `iassd` / `dragon2015516@gmail.com` (per pre-v1.0 Plan 08 SUMMARY — confirm credentials still current; if changed, update ADR-0006 §Контекст before continuing).
    2. Click **Create a token** (do NOT yet check "Secret access token" — exploring UI first).
    3. Look for a **Restrictions** section in the create-token dialog. Specifically: is there a field for **iOS Bundle ID** (expecting `com.runningecosystem.mobile`) and **Android Application Restrictions** (expecting an SHA-256 fingerprint)?
    4. Capture screenshots (or paste UI text) of the restrictions section for the SUMMARY artifact.
    5. **Cancel** the dialog without creating a token. Real token creation happens in Task 3.
    6. Report back to Claude which of the following is true:
       - **(A) Available as documented** — Bundle ID + SHA-256 UI exists; we will use it on the new pk. token in Task 3. ADR-0006 §Митигации references the restriction.
       - **(B) Partial** — only iOS Bundle ID OR only Android SHA-256, not both. Document which is missing.
       - **(C) Unavailable** — only URL restrictions exposed. Apply RESEARCH Pitfall 9 fallback: scope minimization (only STYLES:READ / FONTS:READ / DATASETS:READ / VISION:READ on pk.; only DOWNLOADS:READ on sk.) + 6-month rotation in calendar. ADR-0006 §Митигации documents this fallback explicitly.
  </how-to-verify>
  <resume-signal>Type "A" / "B (missing: ios|android)" / "C" to indicate restriction UI status. Claude updates ADR-0006 §Митигации accordingly before Task 3 begins the rotation.</resume-signal>
</task>

<task type="auto">
  <name>Task 2: Write ADR-0006 + docs/RUNBOOKS/sops-edit.md + extend docs/SECRETS.md with 10 playbooks</name>
  <files>docs/DECISIONS/0006-mapbox-token-incident.md, docs/RUNBOOKS/sops-edit.md, docs/SECRETS.md</files>
  <action>
    **ADR-0006:** Create `docs/DECISIONS/0006-mapbox-token-incident.md` following Pattern C (RU headings, mirror ADR-0001 + ADR-0007 shape per PATTERNS.md §0006-mapbox-token-incident.md). Use the section structure in the `<interfaces>` block.

    Content per section:
    - **§Контекст**: enumerate the 3 prior tokens (dev-public, prod-public, server-secret per pre-v1.0 Plan 08), document the chat-leak event (CONTEXT D-32 carry-over: "однажды передавались в чат с AI" — irreversible chain-of-custody compromise), reference `docs/SECRETS.md` §Mapbox known issue #4 from pre-v1.0 Plan 08.
    - **§Решение**: full reset; new `sk.` (CI/build-time, DOWNLOADS:READ + style/font/tiles scopes per existing playbook) + new `pk.` (runtime, STYLES:READ + FONTS:READ + DATASETS:READ + VISION:READ); revoke old 3; SOPS `.secrets/prod/mapbox.yaml` as single canonical store.
    - **§Альтернативы**: (1) Partial rotation only `server-secret` — REJECTED (all 3 touched chat); (2) No-op + monitoring — REJECTED (Mapbox API quotas measure usage, not abuse; quota anomaly is lagging indicator); (3) Full reset (accepted).
    - **§Обоснование**: chain-of-custody through chat with AI is non-revocable; the recipient (any AI vendor + their training data ingestion + their incident history) is outside our control. Treat-as-compromise is the only response that doesn't require trust assumptions about the AI vendor.
    - **§Последствия**: split per ADR-0001 style (Положительные / Отрицательные/риски). Положительные: clean slate; SOPS-only storage; ESLint + gitleaks + CI scanning prevents recurrence. Отрицательные: brief CI build downtime during rotation (~10 min while sk. propagates to ~/.netrc + ~/.gradle/gradle.properties + future EAS env); operator awareness burden.
    - **§Митигации**: apply Task 1's resume-signal result. If (A): document "iOS Bundle ID com.runningecosystem.mobile + Android SHA-256 fingerprint applied to new pk."; if (B): document the partial state and remediation (e.g., add URL fallback for the missing platform); if (C): document fallback — "Bundle ID/SHA-256 UI not currently exposed by Mapbox dashboard; relying on scope minimization (only public scopes on pk.; only DOWNLOADS:READ on sk.) + 6-month rotation schedule + Phase 4 CI gitleaks + this phase's pre-commit hook".  Also list: Phase 4 gitleaks + trufflehog CI; existing ESLint v9 token-secret guard; this phase's repo-wide pre-commit hook.
    - **§Сценарии пересмотра**: public launch (v1.5 GDPR audit), Mapbox tier change, any future leak detection.
    - **§Ссылки**: `docs/SECRETS.md §Mapbox`, `docs/SECRETS.md §Incident Log`, `.planning/phases/_archive/pre-v1.0-territory-refactors/01-08-SUMMARY.md`, ADR-0007 (sibling phase REL-04).

    **docs/RUNBOOKS/sops-edit.md:** Create `docs/RUNBOOKS/` directory if missing (Claude will via mkdir-equivalent), then write the file per PATTERNS.md §docs/RUNBOOKS/sops-edit.md with the 9-section structure in `<interfaces>` block. Each section: RU heading (Pattern D), numbered steps with verified-from-RESEARCH commands (RESEARCH §sops-edit + §deploy-decrypt are [VERIFIED 2026-05-15] — copy verbatim). Include the Pitfall 1 multi-line gotcha note in §Decrypt to dotenv (current inventory is safe; flag for iOS P8 in Phase 10). Include the Pitfall 5 merge-conflict workaround in §Merge conflicts (refer to .gitattributes binary marking from 02-01). Include the Pitfall 4 recovery flow in §Recovery — Lost age key (1Password sealed → USB → partner dev).

    **docs/SECRETS.md extension:** EDIT existing file (do NOT replace per D-18). Strategy: keep all current content intact (header, lead paragraph, `## Инвентарь токенов`, `### Mapbox` subsection, existing `## Rotation Playbook — Mapbox sk. token (4 шага)`, and the 02-03 `## Incident Log` skeleton). ADD the following sections in this order:
    - After the existing Mapbox sk. playbook: new `## Rotation Playbook — Mapbox pk. token` (mirror the sk. shape; 4 numbered steps; restrictions step per Task 1 result).
    - Then add 8 more playbooks (POSTGRES_PASSWORD, JWT_SECRET, MINIO_ROOT_USER+PASSWORD paired, EXPO_ACCESS_TOKEN, CADDY_ACME_EMAIL, OAuth client secrets, SOPS_AGE_KEY, NATS auth — list from `<interfaces>` block). Each playbook follows the canonical 4-step shape:
      ```
      ## Rotation Playbook — <Secret Name> (4 шага)

      Запускается при подозрении на утечку **или** по плановому графику (раз в N месяцев).

      ### Шаг 1. <Generate / Revoke / Update>
      ...
      ### Шаг 2. Обновить SOPS
      EDITOR=vim sops .secrets/<env>/<group>.yaml
      Под ключом <KEY>: вставить новое значение, save (:wq)
      ### Шаг 3. Deploy
      См. docs/RUNBOOKS/sops-edit.md §«Deploy sequence».
      ### Шаг 4. Validation
      ...
      ```
    - Update the existing `## Инвентарь токенов` table at the top of the file to include all 10 secret types (the table currently lists only Mapbox; extend with rows for POSTGRES_PASSWORD, JWT_SECRET, MINIO_ROOT_USER/PASSWORD, EXPO_ACCESS_TOKEN, CADDY_ACME_EMAIL, OAuth client secrets, SOPS_AGE_KEY, NATS — each row: env var name, type, where it lives in SOPS, bundle? Y/N, purpose).
    - The NATS auth playbook entry (#10) is a v1.1-deferred stub per D-20: "NATS auth открыт на Docker-сети без AuthN. Внутренняя-only доступность через Docker network принята для v1.0 closed-beta. v1.1: добавить NATS auth + token rotation при multi-region или при выводе сервиса с единого VPS."

    Per CLAUDE.md "Не коммитить секреты": all docs MUST reference placeholder/example values only — no real token values, no real passwords. Example: `JWT_SECRET=<openssl rand -hex 32>` is OK; `JWT_SECRET=abc123...` (a real-looking value) is NOT OK.
  </action>
  <verify>
    <automated>test -f docs/DECISIONS/0006-mapbox-token-incident.md && grep -q "## Контекст" docs/DECISIONS/0006-mapbox-token-incident.md && grep -q "## Решение" docs/DECISIONS/0006-mapbox-token-incident.md && grep -q "## Митигации" docs/DECISIONS/0006-mapbox-token-incident.md && test -f docs/RUNBOOKS/sops-edit.md && grep -q "## Environment Setup" docs/RUNBOOKS/sops-edit.md && grep -q "## Recovery" docs/RUNBOOKS/sops-edit.md && [ "$(grep -c '## Rotation Playbook' docs/SECRETS.md)" -ge 10 ] && grep -q "NATS" docs/SECRETS.md && grep -v '^#' docs/SECRETS.md | grep -cE '(sk|pk)\.[A-Za-z0-9_-]{20,}' | grep -q '^0$'</automated>
  </verify>
  <done>ADR-0006 exists with all 8 RU sections; sops-edit.md exists with 9 numbered sections; docs/SECRETS.md has ≥10 `## Rotation Playbook` sections including the new pk. + 8 non-Mapbox + NATS deferred stub; no real `sk.…`/`pk.…` token values appear in any documentation. Atomic commits (2): `docs(phase2-sec): ADR-0006 Mapbox token incident + sops-edit RUNBOOK (SEC-04/07)` and `docs(phase2-sec): extend SECRETS.md with 10 rotation playbooks (SEC-07)`.</done>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 3: USER ACTION — Mapbox dashboard rotation (create new sk./pk., delete old 3)</name>
  <what-built>
    Claude has authored ADR-0006 reflecting Task 1's restriction-UI verdict (A/B/C) and the rotation playbooks in `docs/SECRETS.md`. The actual dashboard work — creating new tokens and revoking old ones — requires user authentication that Claude cannot perform per CONTEXT D-16.

    After this checkpoint completes with new token values pasted into the resume signal, Claude (Task 4) writes them into SOPS via `EDITOR=cat`-style invocation (no values printed back) and runs the curl validation smoke tests.
  </what-built>
  <how-to-verify>
    Follow the rotation playbook in `docs/SECRETS.md §Rotation Playbook — Mapbox sk.` (existing) and the new §Rotation Playbook — Mapbox pk.:

    1. **Create new sk.** at https://account.mapbox.com/access-tokens (account `iassd`):
       - Name: `sport-mobile-build-sk-2026-05`
       - **[✓] Secret access token** checkbox
       - Scopes: `DOWNLOADS:READ`, `STYLES:READ`, `FONTS:READ`, `TILES:READ`, `DATASETS:LIST`, `DATASETS:READ`
       - Skip URL restrictions (sk. is build-time, no URL)
       - Create → copy `sk.…` value (shown ONCE)

    2. **Create new pk. for runtime** in the same dashboard:
       - Name: `sport-mobile-runtime-pk-2026-05`
       - Do NOT check "Secret access token"
       - Scopes: `STYLES:READ`, `FONTS:READ`, `DATASETS:READ`, `VISION:READ` — NO secret-scopes per Phase 0 lesson (per pre-v1.0 Plan 08 `docs/SECRETS.md`)
       - Restrictions per Task 1 result:
         - (A) Bundle ID `com.runningecosystem.mobile` + Android SHA-256 (debug + production keystores)
         - (B) whichever subset is available
         - (C) URL restrictions skipped (no domain yet); rely on scope minimization
       - Create → copy `pk.…` value

    3. **Create new pk. for staging** (separate from prod runtime) — same shape, name `sport-mobile-runtime-pk-staging-2026-05`, same scopes; restrictions as per (A)/(B)/(C). This separates staging from prod quota and lets staging-token leakage be contained.

    4. **Create new pk. for dev** — name `sport-mobile-runtime-pk-dev-2026-05`, weak/no restrictions (local dev only); same minimum scopes.

    5. **DO NOT YET delete old tokens.** Verify new pk. and sk. work first. Run on your workstation:
       ```bash
       curl -sS -o /dev/null -w "%{http_code}\n" "https://api.mapbox.com/styles/v1/mapbox/outdoors-v12?access_token=<NEW_PK_PROD>"
       # Expect: 200
       ```
       If 200 → continue. If anything else → debug (Bundle ID restriction mismatch is the most common failure when running from `curl` rather than the app; expected — the prod token may only work from the bundled app context).

    6. After Task 4 has populated SOPS and Task 5 has propagated to dev/staging/prod deploy paths (Phase 3 will automate; for v1.0 you'll do manual SCP per existing pre-v1.0 deploy approach), **then** delete the 3 prior tokens in the dashboard:
       - `dev-public` → Delete
       - `prod-public` → Delete
       - `server-secret` → Delete
       (Per pre-v1.0 Plan 08 SUMMARY §known issue #4 — these are the canonical 3 that touched chat.)

    7. Paste the **4 new token values** (1 sk. + 3 pk.) here. Claude (Task 4) inserts them into the encrypted SOPS YAMLs via `EDITOR=cat` or programmatic update — values will NOT be echoed back in any output (per CLAUDE.md "Не коммитить секреты" — extended to "не возвращать значение в response").
  </how-to-verify>
  <resume-signal>Paste the 4 new tokens, labeled as follows (one per line; Claude reads and immediately writes-only to SOPS):

    MAPBOX_SK_BUILD: sk.eyJ...
    MAPBOX_PK_PROD: pk.eyJ...
    MAPBOX_PK_STAGING: pk.eyJ...
    MAPBOX_PK_DEV: pk.eyJ...

  Also indicate whether old tokens are revoked yet (recommended: revoke AFTER Task 4 confirms SOPS write + smoke). Type "old-revoked" or "old-still-active" so Claude updates the Incident Log accordingly.</resume-signal>
</task>

<task type="auto">
  <name>Task 4: SOPS-write the 4 new tokens + curl smoke + Incident Log update</name>
  <files>.secrets/dev/mapbox.yaml, .secrets/staging/mapbox.yaml, .secrets/prod/mapbox.yaml, docs/SECRETS.md</files>
  <action>
    Take the 4 token values from Task 3's resume signal. Open each `.secrets/<env>/mapbox.yaml` via SOPS and replace placeholders:

    For prod:
    ```bash
    # Programmatic SOPS update (avoids interactive editor):
    sops --set '["EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN"] "<MAPBOX_PK_PROD>"' .secrets/prod/mapbox.yaml
    sops --set '["MAPBOX_DOWNLOADS_TOKEN"] "<MAPBOX_SK_BUILD>"' .secrets/prod/mapbox.yaml
    ```
    (Note: `sops --set` syntax verified against sops v3.13.0 — if the exact flag form differs, fall back to `EDITOR=ed sops ...` with a printf-driven `ed` script. The goal is non-interactive write without ever printing the value to stdout.)

    For staging:
    ```bash
    sops --set '["EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN"] "<MAPBOX_PK_STAGING>"' .secrets/staging/mapbox.yaml
    sops --set '["MAPBOX_DOWNLOADS_TOKEN"] "<MAPBOX_SK_BUILD>"' .secrets/staging/mapbox.yaml
    ```
    Per RESEARCH Pitfall 10: the `sk.` value is intentionally identical across staging and prod for v1.0 — Mapbox SDK download is the same artifact regardless of environment; per-env sk. separation is a v1.1 ergonomics improvement. The pk. values DIFFER per env to contain blast radius.

    For dev:
    ```bash
    sops --set '["EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN"] "<MAPBOX_PK_DEV>"' .secrets/dev/mapbox.yaml
    sops --set '["MAPBOX_DOWNLOADS_TOKEN"] "<MAPBOX_SK_BUILD>"' .secrets/dev/mapbox.yaml
    ```

    **Curl smoke validation** (RESEARCH §Validation §SEC-03 — uses pk., does NOT print sk. anywhere):
    ```bash
    PK_PROD=$(sops -d --extract '["EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN"]' .secrets/prod/mapbox.yaml)
    HTTP_CODE=$(curl -sS -o /dev/null -w "%{http_code}" "https://api.mapbox.com/styles/v1/mapbox/outdoors-v12?access_token=$PK_PROD")
    if [ "$HTTP_CODE" != "200" ]; then
        echo "FAIL: prod pk. validation returned $HTTP_CODE (expected 200)"
        # If 401: token wrong or restricted; if 403: restrictions blocking curl (acceptable — token works in app context)
        # 403 from a curl from non-allowlisted source IS expected when Bundle ID restriction (A) applies
        exit 1
    fi
    unset PK_PROD HTTP_CODE
    ```
    Repeat for staging and dev. Per Task 1 result:
    - (A) Bundle ID restriction applied: expect 403 from curl (because curl is not the bundled app) — this is SUCCESS, not failure. Update the smoke to accept 200 OR 403 per branch.
    - (B) Partial restriction: behavior depends on which platform is restricted.
    - (C) No restriction: expect strict 200.

    **Incident Log update** (per Task 3 "old-revoked" / "old-still-active" status): Edit `docs/SECRETS.md` §Incident Log table (added in 02-03 Task 3) to add a row:
    ```
    | 2026-05-{day} | Mapbox sk./pk. (×4 new tokens) | Full reset per ADR-0006: created sport-mobile-build-sk-2026-05 + sport-mobile-runtime-pk-{prod,staging,dev}-2026-05 | New tokens in SOPS .secrets/<env>/mapbox.yaml; old dev-public/prod-public/server-secret {revoked / pending revocation} | {Closed / Awaiting old-token revocation} | docs/DECISIONS/0006-mapbox-token-incident.md |
    ```

    Final post-task verification: `grep -r '<PLACEHOLDER_REPLACE_IN_02-04>' .secrets/` should return no matches (all placeholders replaced); `sops -d .secrets/prod/mapbox.yaml | grep -E '^(EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN|MAPBOX_DOWNLOADS_TOKEN):' | wc -l` should be 2.

    Per CLAUDE.md "Не коммитить секреты": at no point in this task's bash output should a `sk.…` or `pk.…` literal appear. The `sops -d --extract` value is captured into a shell var, used in a single curl, then unset. Verify by running `set | grep -E '(sk|pk)\.' || echo "OK no leak"` at end.
  </action>
  <verify>
    <automated>! grep -r 'PLACEHOLDER_REPLACE_IN_02-04' .secrets/ 2>/dev/null && [ "$(sops -d .secrets/prod/mapbox.yaml 2>/dev/null | grep -cE '^(EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN|MAPBOX_DOWNLOADS_TOKEN): (pk|sk)\.[A-Za-z0-9_-]+')" -eq 2 ] && [ "$(sops -d .secrets/staging/mapbox.yaml 2>/dev/null | grep -cE '^(EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN|MAPBOX_DOWNLOADS_TOKEN): (pk|sk)\.[A-Za-z0-9_-]+')" -eq 2 ] && [ "$(sops -d .secrets/dev/mapbox.yaml 2>/dev/null | grep -cE '^(EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN|MAPBOX_DOWNLOADS_TOKEN): (pk|sk)\.[A-Za-z0-9_-]+')" -eq 2 ] && grep -q 'Mapbox sk./pk' docs/SECRETS.md && grep -q '0006-mapbox-token-incident' docs/SECRETS.md</automated>
  </verify>
  <done>3 mapbox.yaml files contain real new pk./sk. values (all 4 distinct tokens accounted for: 1 sk. shared across envs, 3 pk. per env); curl smoke against new pk. returns 200 or 403 (Bundle-restriction-expected per Task 1); placeholders gone; Incident Log updated with rotation entry referencing ADR-0006. Atomic commit: `feat(phase2-sec): populate .secrets/*/mapbox.yaml with rotated tokens + Incident Log close-out (SEC-03)`.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| user-browser ↔ Mapbox dashboard | Dashboard authentication is the only authority for token creation/revocation; no public Tokens API for revoke per RESEARCH |
| user-clipboard ↔ Claude conversation | New tokens flow from dashboard (shown-once on creation) → clipboard → resume-signal → SOPS encrypt. The brief plaintext window in the conversation IS a risk; mitigated by immediate SOPS-write and never echoing back |
| SOPS-encrypted YAML ↔ git commit | Committed encrypted is safe per V6 ASVS; the curl smoke uses `sops -d --extract` to a shell var that is `unset` after use |
| new-tokens ↔ Bundle ID + SHA-256 restriction | (A) Branch: dashboard enforces; (B)/(C) Branches: scope minimization + rotation are the only defenses |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-02-25 | Information Disclosure | new `sk.` / `pk.` token values entering Claude conversation history during Task 3 resume signal | mitigate | Task 3 explicitly instructs paste-once; Task 4 writes to SOPS without echoing; final verify step asserts no `sk\.|pk\.` literal in shell env. Residual: the chat transcript itself holds the values briefly. Per CLAUDE.md hard rule, the conversation transcript IS the leak vector if it's later shared (e.g., quoted in a bug report). User instructed to scrub chat after Task 4 confirms write. Phase 4 CI gitleaks scans every PR — if a future commit inadvertently embeds the value, it's caught. |
| T-02-26 | Spoofing | the new `pk.` runtime token, without Bundle ID restriction (Task 1 branch C), can be used by any app to consume our Mapbox quota | mitigate | Branch C fallback: scope minimization (only public-tier scopes); 6-month rotation calendar; Phase 4 CI gitleaks + this phase's pre-commit hook prevent recurrence; Mapbox dashboard usage anomaly alerting (operator subscribes if available). |
| T-02-27 | Repudiation | old tokens (dev-public, prod-public, server-secret) remain active after Task 4 completes if user defers Step 6 of Task 3 — leaving compromised tokens valid | mitigate | Task 3 resume-signal explicitly captures "old-revoked" vs "old-still-active"; Incident Log status reflects this. SUMMARY artifact at end of Phase 2 names the explicit owner + due date for revocation if deferred. ROADMAP §Hard Rules: closing Phase 2 SUMMARY without old-token revocation blocks Phase 3 strict-gate. |
| T-02-28 | Information Disclosure | curl smoke test inadvertently captures or logs the pk. value (e.g., via shell history) | mitigate | Task 4 uses `set +x` and unsets vars after use; bash `HISTFILE=/dev/null` for the smoke session per RUNBOOK best practice; curl `-sS` (silent + show-errors) prevents URL logging in stderr by default. |
| T-02-29 | Tampering | a future PR weakens ADR-0006's §Митигации to retroactively claim the rotation was sufficient without the restriction (covering an oversight) | accept | Git history of `docs/DECISIONS/` preserves the original ADR; PR review on ADR changes (Phase 4 branch protection) is the gate. For v1.0 two-dev team, residual risk accepted. |
| T-02-30 | Denial of Service | new sk. token gets rate-limited / banned by Mapbox if curl smoke + actual CI build hammer the downloads endpoint simultaneously | accept | Mapbox download endpoint handles standard CocoaPods/Gradle traffic patterns; smoke test makes a single curl call. Phase 11/12 EAS builds are low-cadence. Residual risk accepted. |
| T-02-31 | Information Disclosure | ADR-0006 §Контекст names the leak vector ("chat with AI") — a future attacker reading the public-ish repo's ADRs learns the same vector existed | accept | The information is already public via the planning artifacts in `.planning/phases/_archive/pre-v1.0-territory-refactors/` and existing `docs/SECRETS.md` §known issue #4. Documenting it openly is the documented decision per ADR pattern. |
| T-02-32 | Spoofing | the Mapbox account credentials (`iassd` / `dragon2015516@gmail.com`) themselves are out of scope of SOPS — if the dashboard account is compromised, attacker can issue new tokens at will | mitigate | Mapbox account 2FA recommended in ADR-0006 §Митигации; the credentials are stored in 1Password per the user's broader credential hygiene (out of scope for this phase but cross-referenced). |
</threat_model>

<verification>
- `gsd-sdk query verify.plan-structure` returns valid
- `test -f docs/DECISIONS/0006-mapbox-token-incident.md` and all 8 RU sections present
- `test -f docs/RUNBOOKS/sops-edit.md` and all 9 sections present
- `docs/SECRETS.md` has ≥10 `## Rotation Playbook` sections; `## Incident Log` has the rotation row
- All 3 `.secrets/<env>/mapbox.yaml` decrypt to 2 keys each (EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN with `pk.` prefix, MAPBOX_DOWNLOADS_TOKEN with `sk.` prefix); no placeholder strings remain
- curl smoke against new pk. (prod, staging, dev) returns 200 or 403 (Bundle-restriction expected per Task 1 branch A)
- `pre-commit run --all-files` exits 0 (no new leaks introduced by Task 4)
- gitleaks `--source .` exits 0 (history + working tree clean — new tokens never landed as plaintext in any file)
- No `sk.…` or `pk.…` literal appears in `git log -p` for any commit landed by this plan
</verification>

<success_criteria>
SEC-03 closed: All 3 prior Mapbox tokens revoked; 4 new tokens (1 sk. + 3 pk. per env) created with restrictions per Task 1 verdict; new values in SOPS; curl smoke passes.
SEC-04 closed: ADR-0006 documents the rotation as treated-as-compromise; mitigations reflect the actual restriction state.
SEC-07 closed: `docs/SECRETS.md` extended (not replaced) with 10 rotation playbooks; `docs/RUNBOOKS/sops-edit.md` provides the SOPS workflow reference.

Phase 2 closure check: all 9 SEC-* IDs distributed across the 4 plans, every plan has its `requirements:` field populated, and every `must_have` truth has a verification command in the corresponding `<verify>` block. Phase 3 strict-gate per user redline can clear once 02-04 SUMMARY lands.
</success_criteria>

<output>
After completion, create `.planning/phases/02-secrets-and-config-hardening/02-04-SUMMARY.md` recording:
- Task 1 resume-signal result (A/B/C — Bundle ID restriction UI status)
- ADR-0006 file path + section count
- `docs/SECRETS.md` total `## Rotation Playbook` section count (must be ≥10)
- 4 new Mapbox tokens labels (NOT values): sport-mobile-build-sk-2026-05, sport-mobile-runtime-pk-{prod,staging,dev}-2026-05
- Revocation status of 3 prior tokens (dev-public / prod-public / server-secret) — Closed/Pending with due date
- curl smoke test HTTP codes (200 expected from non-restricted; 403 expected if Bundle ID restriction applied)
- Cross-reference summary: ADR-0006 ↔ docs/SECRETS.md ↔ docs/RUNBOOKS/sops-edit.md ↔ .secrets/prod/mapbox.yaml form a closed loop
- Phase 2 closure declaration: "All 9 SEC-* IDs delivered; Phase 3 strict-gate unblocked" if Wave 1+2+3 all clean; OR list of residual items (e.g., "old tokens not yet revoked — blocking until 2026-05-{date}")
</output>
