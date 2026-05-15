---
phase: 01-validate-close-territory-core
plan: 08
subsystem: security / build-tooling
tags: [secrets, eslint, mapbox, audit, phase1-closure]
dependency_graph:
  requires:
    - .planning/phases/01-validate-close-territory-core/01-CONTEXT.md
    - .planning/phases/01-validate-close-territory-core/01-RESEARCH.md
    - docs/SECRETS.md (pre-existing partial state)
    - apps/mobile-rn/.eslintrc.json (pre-existing — replaced)
  provides:
    - docs/SECRETS.md (expanded with 4-step rotation playbook, classification rules, incident response, audit summary)
    - apps/mobile-rn/eslint.config.js (flat config — replaces legacy .eslintrc.json; adds no-restricted-syntax rules)
    - apps/mobile-rn/src/__fixtures__/secret.lint-fixture.ts (negative-test fixture for CI verification)
    - apps/mobile-rn/.env.example (clarified pk. vs sk. classification)
  affects:
    - "PHASE1-14 (Phase 1 closure docs) — STATUS.md must reflect PHASE1-13 done after user-action Task 4"
    - "ROADMAP.md Phase 1 Success Criteria #4 — code-side complete, awaiting user-side rotation"
tech-stack:
  added: []
  patterns:
    - "ESLint v9 flat-config with eslint-config-expo/flat"
    - "AST selectors via no-restricted-syntax for build-time secret detection"
    - "Length-bounded regex ({40,}) to prevent UI-string false positives (Pitfall 6)"
key-files:
  created:
    - apps/mobile-rn/eslint.config.js
    - apps/mobile-rn/src/__fixtures__/secret.lint-fixture.ts
  modified:
    - docs/SECRETS.md
    - apps/mobile-rn/.env.example
    - .planning/phases/01-validate-close-territory-core/deferred-items.md
  removed:
    - apps/mobile-rn/.eslintrc.json (replaced by flat config)
decisions:
  - "Migrated to ESLint v9 flat-config (eslint.config.js) because legacy .eslintrc.json could not run under installed eslint@^9.39 — plan-listed verification commands (`npm run lint`) would otherwise fail unconditionally. Rule 3 deviation. Preserves both pre-existing no-restricted-imports rule and adds new no-restricted-syntax rules."
  - "Extended `no-restricted-imports: off` override to include `src/__tests__/**` because pre-existing test files (offline.test.ts, offlineBoundsRegression.test.ts) import @rnmapbox/maps to mock the SDK — legitimate testing surface, analogous to src/map/ adapter quarantine."
  - "Did NOT rewrite git history for the single historical reference in docs/REVIEW_ROUNDS_1-3.md to `EXPO_PUBLIC_STRAVA_CLIENT_SECRET` — that's a documentation record of a past concern (R1), not an actual leak of a token. Documented in SECRETS.md §Аудит истории."
metrics:
  duration: ~40 minutes (Tasks 1-3 code side; Task 4 awaits user action)
  completed: 2026-05-14 (Tasks 1-3)
  tasks_completed: 3/4
---

# Phase 1 Plan 08: Token Rotation + ESLint Guard Summary

Mapbox token-rotation playbook (`docs/SECRETS.md`) and CI-enforced ESLint guards (`no-restricted-syntax` for `EXPO_PUBLIC_*_SECRET` and `sk.<long>` literals) shipped; user-side dashboard rotation remains as the only blocking step before PHASE1-13 closes.

## Completion State

- **Tasks 1-3:** Complete and committed.
- **Task 4 (user action):** Pending — requires Mapbox dashboard access, cannot be automated.

## Per-Task Outcome

### Task 1 — docs/SECRETS.md rotation playbook + .env.example clarification

Status: **Done.** Commit `79b5aa0` — `docs(phase1): SECRETS.md rotation playbook (PHASE1-13)`.

`docs/SECRETS.md` expanded from 139 → 365 lines. New sections added (Russian per CLAUDE.md convention):
- **Инвентарь токенов** — pk./sk. inventory table.
- **Классификация** — strict rules: pk. bundle-safe with restrictions, sk. build-time only.
- **Rotation Playbook** — 4 steps (generate new sk., delete old, store in ~/.netrc + ~/.gradle/gradle.properties, rebuild + verify).
- **Storage Rules** — file modes, never-in-repo paths.
- **Incident Response** — triggers, what to do, what NOT to do (don't rewrite history).
- **Guard Rails** — references the ESLint rule from Task 2.
- **Аудит истории на утечки** — embedded results of git grep audit.
- **Rotation Log** — table for tracking dates; pre-seeded with 2026-05-06 (`dev-public-v2` creation) and a `_pending_` row for Task 4.

`apps/mobile-rn/.env.example` updated to explicitly mark `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN` as PUBLIC/bundled and `RNMAPBOX_MAPS_DOWNLOAD_TOKEN` as SECRET/build-time (with explicit "do NOT add EXPO_PUBLIC_ prefix" warning).

### Task 2 — ESLint guard + fixture + audit grep

Status: **Done.** Files committed as part of commit `a7da532` (see deviation note below).

**Lint config** (`apps/mobile-rn/eslint.config.js`, NEW — replaces `.eslintrc.json`):
- Migrated to ESLint v9 flat-config format because the installed `eslint@^9.39.4` does NOT load `.eslintrc.json` (verified empirically: legacy file produced `"ESLint couldn't find an eslint.config.(js|mjs|cjs) file"` error and exit 2). The plan's verification command `npm run lint` could not have produced exit 0 without this migration.
- Preserves the existing `no-restricted-imports` rule (Mapbox SDK quarantine).
- Adds the two `no-restricted-syntax` rules from the plan, verbatim per RESEARCH.md Code Examples:
  - `MemberExpression[object.object.name='process'][object.property.name='env'][property.name=/^EXPO_PUBLIC_.*_SECRET$/]` → error "Secrets must NOT be exposed via EXPO_PUBLIC_* …"
  - `Literal[value=/^sk\\.[A-Za-z0-9._-]{40,}/]` → error "Hard-coded Mapbox sk. secret detected. …"
- Ignores `src/__fixtures__/**` (replaces legacy `.eslintignore` which flat-config doesn't support).

**Fixture** (`apps/mobile-rn/src/__fixtures__/secret.lint-fixture.ts`, NEW):
- Contains both anti-patterns: `process.env.EXPO_PUBLIC_MAPBOX_SECRET` and a fake long `sk.eyJ1IjoiZmFrZSIsImEi…fake-suffix-for-fixture` literal.
- 22 lines (≥8 min per must_haves).
- Verified to fail lint with exit 1 and both error messages visible (see Verification below).

**Verification (executed):**
```
cd apps/mobile-rn
npm run lint                                                                  # exit 0, 0 errors, 55 warnings (pre-existing)
npx eslint --no-ignore -- src/__fixtures__/secret.lint-fixture.ts             # exit 1, 2 errors (both rule messages)
```

**False-positive sanity check (executed):**
Inserted a probe file with `'sk-button'`, `'sk.short'`, `'sk-card-class-name'` — all under 40 chars; ESLint passes with exit 0. The `{40,}` length quantifier successfully suppresses UI-string false positives per RESEARCH.md Pitfall 6.

### Task 3 — Audit-grep for historical leaks

Status: **Done.** Findings documented in `docs/SECRETS.md` §"Аудит истории на утечки" and reproduced here for traceability:

```
git grep -nE 'EXPO_PUBLIC_.*_SECRET' -- apps/mobile-rn/src/
→ EMPTY (no runtime source matches)

git grep -nE 'sk\.[A-Za-z0-9_-]{40,}' -- apps/mobile-rn/ docs/
→ apps/mobile-rn/.env.example:22  (placeholder "sk.replace-via-netrc-or-gradle-do-not-commit" — not a real token)
   apps/mobile-rn/src/__fixtures__/secret.lint-fixture.ts  (intentional fake sk. for the lint guard fixture)

git log --all --oneline -- apps/mobile-rn/.env
→ EMPTY (.env was never committed; protected by .gitignore from project start)
```

**One historical reference in repo:** `docs/REVIEW_ROUNDS_1-3.md:22` cites a *past* concern (R1) where `EXPO_PUBLIC_STRAVA_CLIENT_SECRET` would have been bundled if added to a real StravaAdapter. Investigation:
- Verified via `git log -p` that no actual `process.env.EXPO_PUBLIC_*_SECRET` reference ever existed in production source (`apps/mobile-rn/src/`).
- The StravaAdapter is documented as `isAvailable() === false` stub; the review-record describes the *architectural risk* discovered during code review, not an executed leak.
- Per Incident Response §"Не делать," do **not** rewrite git history for this — it's a documentation record, the lint rule now catches the pattern at PR time if anyone re-introduces it.

**Net verdict:** No real Mapbox `sk.` token in git history. The only known leak vector (chat-with-AI-assistant — documented in pre-existing SECRETS.md §Известные проблемы #4) is closed by Task 4 dashboard rotation.

### Task 4 — Owner-only Mapbox dashboard rotation

Status: **PENDING — USER ACTION REQUIRED.** See checkpoint section below.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] ESLint v9 flat-config migration (was: `.eslintrc.json`)**
- **Found during:** Task 2 baseline `npm run lint` (pre-existing on branch).
- **Issue:** Installed `eslint@^9.39.4` requires `eslint.config.(js|mjs|cjs)` per the ESLint v9 migration; the legacy `.eslintrc.json` produces `"ESLint couldn't find an eslint.config.(js|mjs|cjs) file"` and exit 2. The plan's `verify` block — `npm run lint` (exit 0) and `npx eslint --no-ignore -- src/__fixtures__/secret.lint-fixture.ts` — would fail unconditionally.
- **Fix:** Authored `apps/mobile-rn/eslint.config.js` using `eslint-config-expo/flat` (verified the package ships a `flat.js` entry at version 55.0.0). All plan-required rules (`no-restricted-imports` for `@rnmapbox/maps`, both `no-restricted-syntax` selectors) preserved. Legacy `.eslintrc.json` removed (was already absent from working tree at the time of Task 2 due to a concurrent sibling-agent's PHASE1-10 commit `40251a6` which had cleaned it up).
- **Files modified:** `apps/mobile-rn/eslint.config.js` (NEW).
- **Commit:** Content landed via `a7da532` (sibling-agent staging race — see "Commit attribution note" below).

**2. [Rule 3 — Blocking] Extended `no-restricted-imports: off` to `src/__tests__/**`**
- **Found during:** Task 2 lint verification after migration.
- **Issue:** Pre-existing test files `src/__tests__/offline.test.ts` and `src/__tests__/offlineBoundsRegression.test.ts` (committed by sibling-agent PHASE1-10 commit `40251a6`) import `@rnmapbox/maps` directly to mock the SDK. The original `no-restricted-imports` override only covered `src/map/**`, so these tests erred out under the now-functional lint — preventing `npm run lint` from achieving exit 0.
- **Fix:** Extended the override file glob to `['src/map/**/*.{ts,tsx}', 'src/__tests__/**/*.{ts,tsx}']`. This is analogous to the existing pattern: tests of SDK-dependent code legitimately need to import the SDK to mock it; the `no-restricted-syntax` token-secret rules still apply globally.
- **Files modified:** `apps/mobile-rn/eslint.config.js`.
- **Commit:** Same as above (`a7da532`).

### Commit attribution note (multi-active race)

The branch `feat/cursona-redesign` had parallel agent sessions running concurrently on plans 06, 07, 08, 10 of Phase 1. Timeline reconstructed from `git log`:

| Order | Commit  | Plan | Author intent |
|-------|---------|------|---------------|
| 1     | `79b5aa0` | 01-08 | docs(phase1): SECRETS.md rotation playbook (PHASE1-13) — **mine** |
| 2     | `40251a6` | 01-10 | fix(phase1): offline.ts bounds order (PHASE1-10) — sibling agent; also deleted `.eslintrc.json` |
| 3     | `dfa0753` | 01-07 | feat(phase1): probe expo-sqlite under jest (PHASE1-07) — sibling, staging clobbered |
| 4     | `db02e0f` | 01-06 | feat(phase1): extract TrackerLive hooks (PHASE1-06) — sibling |
| 5     | `a7da532` | 01-07 (fix) | feat(phase1): add expo-sqlite probe + better-sqlite3 shim (PHASE1-07, fix) — sibling re-stage; **swept in my `eslint.config.js` and `secret.lint-fixture.ts`** alongside their PHASE1-07 fixup files |

The Task 2 ESLint guard files (`eslint.config.js`, `src/__fixtures__/secret.lint-fixture.ts`, plus the `.env.example` change committed cleanly in `79b5aa0`) are correctly persisted on HEAD but the Task 2 commit message intent ("feat(phase1): ESLint token-secret guard (PHASE1-13)") was **not** preserved — those files landed under `a7da532`'s PHASE1-07 message.

Per `destructive_git_prohibition`, no history rewrite was attempted. The work is verifiable on disk and on HEAD (see Self-Check). Future references to PHASE1-13 lint-guard provenance should cite this SUMMARY and the file list above rather than a single commit hash.

## Threat Model Disposition (carried over from plan)

| Threat ID | Status |
|-----------|--------|
| T-01-08-01 IS — sk. token in JS bundle | **mitigated** by ESLint rule (Task 2); CI will block any regression |
| T-01-08-02 IS — pk. token abuse | **deferred to Task 4** — Bundle ID + SHA-256 restrictions must be set in Mapbox dashboard (user action) |
| T-01-08-03 Tampering — rotation rollback | **mitigated** in playbook (Task 1) — old token deleted only AFTER new token verified |
| T-01-08-04 IS — `--no-verify` bypass | **accepted** — single-developer team, PR review is the gate |
| T-01-08-05 Repudiation — rotation event not recorded | **mitigated** by `## История ротаций` table in SECRETS.md (Task 1) |
| T-01-08-06 Spoofing — adversarial PR with new sk. | **accepted** — PR review is the gate |
| T-01-08-07 IS — false positives on `sk-button` | **mitigated** by `{40,}` length quantifier; empirically verified |
| T-01-08-08 IS — sk. in `apps/mobile-rn/android/gradle.properties` | **mitigated** by explicit `~/.gradle/gradle.properties` (in $HOME, not repo) directive in playbook |

All threat dispositions actionable in code are complete; T-01-08-02 awaits Task 4.

## False-Positive Testing for ESLint Rule

Per plan's `<output>` requirement — confirm `'sk-button'`, `'sk-card'`, etc. do NOT trigger the rule on the codebase.

Empirical test (Task 2 verification):
```
echo "const x = 'sk-button'; const y = 'sk.short'; const z = 'sk-card-class-name';" > probe.ts
npx eslint --no-ignore -- probe.ts
# exit=0, no errors
```

Production source survey: `grep -rn "'sk-\|\"sk-" apps/mobile-rn/src/` returns only the fixture comment (which references the pattern but doesn't contain a real token). No production code presently uses `sk-*` UI strings, but the regex is safe even if such strings are introduced in the future (Pitfall 6 protection).

## Cross-links

- **Closes:** PHASE1-13 (Mapbox token rotation playbook + ESLint guard) — code side complete; user-side awaits Task 4.
- **Supports:** ROADMAP.md Phase 1 Success Criteria #4 — "Mapbox `server-secret` is a real `sk.…` token … no secret token strings remain … ESLint guard rejects `EXPO_PUBLIC_*_SECRET`."
- **Unblocks:** PHASE1-14 (Phase 1 closure docs) — after Task 4 completes.

---

## CHECKPOINT REQUIRED — Task 4 (USER ACTION)

The Mapbox dashboard rotation is the **only** remaining step. Claude cannot perform it (no dashboard credentials or session). Follow `docs/SECRETS.md` §"Rotation Playbook" (4 шага):

### Steps (~10 minutes)

1. **Log in to Mapbox dashboard:**
   - URL: https://account.mapbox.com/access-tokens
   - Account: `iassd` (email: `dragon2015516@gmail.com`) — per pre-existing `docs/SECRETS.md` ownership record.

2. **Create new secret token:**
   - Click **"Create a token"**.
   - **Name:** `sport-mobile-build-sk` (or with date: `sport-mobile-build-sk-2026-05`).
   - **Check the "Secret access token" checkbox** ← without this, you get `pk.` not `sk.` (this was the original mistake with `server-secret`).
   - **Scopes:** `DOWNLOADS:READ` (required for SDK download), `STYLES:READ`, `FONTS:READ`, `TILES:READ`, `DATASETS:LIST`, `DATASETS:READ`.
   - **URL restrictions:** leave empty (mobile uses Bundle ID, not URL).
   - **Create token** → **copy the `sk.…` immediately** (Mapbox shows it once).

3. **Verify the public `pk.` token has restrictions:**
   - Find `dev-public-v2` (or the active runtime pk. token) in the same dashboard.
   - Confirm restrictions list contains:
     - iOS Bundle ID: `com.runningecosystem.mobile`
     - Android SHA-256: `B3:63:9A:C1:B7:D4:53:74:BF:A6:26:3C:C4:F5:99:6E:BA:C2:87:3E:DC:CA:9E:FB:27:A0:5D:7F:1F:C5:3D:24` (debug keystore, owner machine; see `docs/SECRETS.md` TODO list for getting fresh fingerprint via `keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android` if needed)
   - If missing — add them now via "Add URL/Bundle restriction" in the token settings.

4. **Store the new `sk.` locally (DO NOT do this for Claude — do it on your dev machine):**
   ```bash
   # iOS — ~/.netrc:
   nano ~/.netrc
   # Add or update:
   #   machine api.mapbox.com
   #     login mapbox
   #     password sk.<paste-here>
   chmod 600 ~/.netrc

   # Android — ~/.gradle/gradle.properties (NOT the repo file!):
   mkdir -p ~/.gradle
   nano ~/.gradle/gradle.properties
   # Add or update:
   #   MAPBOX_DOWNLOADS_TOKEN=sk.<paste-here>
   chmod 600 ~/.gradle/gradle.properties
   ```

5. **Rebuild and verify (smoke test):**
   ```bash
   cd apps/mobile-rn/ios && pod deintegrate && pod install   # should succeed without 401 from api.mapbox.com
   cd apps/mobile-rn/android && ./gradlew :app:clean :app:assembleDebug   # should succeed
   ```
   Then run dev build on device, open map screen, confirm tiles render.

6. **Delete the old leaked tokens (ONLY after step 5 succeeds):**
   - In Mapbox dashboard, delete:
     - The mis-classified `server-secret` (it was `pk.` — see SECRETS.md §"Известные проблемы" #2).
     - The old broken `dev-public` (with `OFFLINE:READ` scope — SECRETS.md §"Известные проблемы" #1).
     - Any other token whose value ever appeared in chat history (per the chat-leak concern documented in SECRETS.md §"Известные проблемы" #4).

7. **Record the rotation:**
   - Append a row to `docs/SECRETS.md` §"История ротаций":
     ```
     | 2026-05-XX | Ismail | Rotated server-secret → real sk.; verified restrictions on dev-public-v2; deleted old leaked tokens (chat-history mitigation). |
     ```
   - Commit: `git commit -m "docs(phase1): rotation log entry (PHASE1-13)"`.

### Resume signal

After Task 4: re-run `/gsd-execute-plan 01-08` to verify the rotation log entry, OR proceed directly to PHASE1-14 (Phase 1 closure docs) which will record PHASE1-13 as fully done.

## Self-Check: PASSED

**Files exist:**
- ✓ `/Users/ismail/Desktop/projects/sport/docs/SECRETS.md` (365 lines)
- ✓ `/Users/ismail/Desktop/projects/sport/apps/mobile-rn/.env.example` (24 lines)
- ✓ `/Users/ismail/Desktop/projects/sport/apps/mobile-rn/eslint.config.js` (72 lines)
- ✓ `/Users/ismail/Desktop/projects/sport/apps/mobile-rn/src/__fixtures__/secret.lint-fixture.ts` (22 lines)
- ✓ `.planning/phases/01-validate-close-territory-core/deferred-items.md` (extended)

**Commits exist:**
- ✓ `79b5aa0` — Task 1 (SECRETS.md + .env.example) — confirmed via `git log --oneline -- docs/SECRETS.md`
- ✓ `a7da532` — Task 2 files (eslint.config.js + fixture) landed via sibling-agent's PHASE1-07 fix commit (multi-active race, documented above)

**Verification commands re-run before writing SUMMARY:**
- ✓ `npm run lint` → exit 0 (0 errors, 55 pre-existing warnings)
- ✓ `npx eslint --no-ignore -- src/__fixtures__/secret.lint-fixture.ts` → exit 1, both rule messages present.
