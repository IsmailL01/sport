---
phase: 01-validate-close-territory-core
plan: 08
type: execute
wave: 1
depends_on: []
files_modified:
  - docs/SECRETS.md
  - apps/mobile-rn/.eslintrc.json
  - apps/mobile-rn/.eslintignore
  - apps/mobile-rn/src/__fixtures__/secret.lint-fixture.ts
  - apps/mobile-rn/.env.example
autonomous: false
requirements: [PHASE1-13]
maps_to_existing_plan: Security cross-cutting — supports closing Phase 1 per ROADMAP §Success Criteria #4

must_haves:
  truths:
    - "docs/SECRETS.md exists with the 4-step rotation playbook from D-32 (generate new sk., restrict bundle+SHA, store in ~/.netrc + ~/.gradle/gradle.properties, delete leaked pk.)"
    - "apps/mobile-rn/.eslintrc.json has a no-restricted-syntax rule rejecting any `process.env.EXPO_PUBLIC_*_SECRET` MemberExpression"
    - "Same eslintrc rule rejects any string literal matching `^sk\\.[A-Za-z0-9_-]{40,}` to catch hard-coded Mapbox sk. tokens"
    - "apps/mobile-rn/src/__fixtures__/secret.lint-fixture.ts contains both patterns and is excluded from the main lint run via .eslintignore"
    - "Running ESLint explicitly on the fixture file exits non-zero (proves the rules fire); running ESLint on the rest of the codebase exits zero (proves no false positives)"
    - "An audit `git grep` for `EXPO_PUBLIC_.*_SECRET` and `sk\\.[A-Za-z0-9_-]{40,}` over the entire repo returns empty (no historical leak)"
    - "apps/mobile-rn/.env.example documents EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN (pk., bundled — OK) and RNMAPBOX_MAPS_DOWNLOAD_TOKEN (sk., build-time, NOT bundled)"
  artifacts:
    - path: docs/SECRETS.md
      provides: "Rotation playbook (Russian, per CLAUDE.md convention) — 4 steps + incident response"
      min_lines: 60
    - path: apps/mobile-rn/src/__fixtures__/secret.lint-fixture.ts
      provides: "Intentional lint-failure fixture for CI guard verification"
      min_lines: 8
  key_links:
    - from: apps/mobile-rn/.eslintrc.json
      to: apps/mobile-rn/src/__fixtures__/secret.lint-fixture.ts
      via: no-restricted-syntax rule + .eslintignore exception during the dedicated fixture run
      pattern: "no-restricted-syntax|EXPO_PUBLIC_.*_SECRET"
---

<objective>
Per CONTEXT.md D-32..D-34 + RESEARCH.md §Security Domain + ROADMAP Phase 1 Success Criteria #4: (1) write/update `docs/SECRETS.md` with the 4-step Mapbox token rotation playbook; (2) add ESLint AST rules to `apps/mobile-rn/.eslintrc.json` that reject any `process.env.EXPO_PUBLIC_*_SECRET` member-access and any string literal matching `^sk\\.[A-Za-z0-9_-]{40,}` (mapbox secret token shape, length-bounded to avoid Pitfall 6 false-positives on UI strings like `'sk-button'`); (3) commit a deliberate lint-failure fixture so CI verifies the rules fire; (4) audit history for prior leaks.

**This plan is `autonomous: false`** because Step 1 of D-32 (generate new `sk.…` in Mapbox dashboard, restrict to Bundle ID + Android SHA-256, delete old leaked token) requires the human owner — Claude has no Mapbox dashboard access. The lint guard, docs, and fixture ARE autonomous; the rotation itself is human-only.

Purpose: ROADMAP Phase 1 cannot close without Mapbox token integrity confirmed. The pk-vs-sk classification was leaked in chat history per D-34 — must be treated as compromised and force-rotated. The ESLint guard prevents the regression from happening again.
Output: SECRETS.md playbook, ESLint config updated, lint fixture + .eslintignore, audit-grep evidence, env.example updated, and a checkpoint task documenting the human-only dashboard rotation step.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/01-validate-close-territory-core/01-CONTEXT.md
@.planning/phases/01-validate-close-territory-core/01-RESEARCH.md
@.planning/phases/01-validate-close-territory-core/01-PATTERNS.md
@.planning/codebase/CONCERNS.md
@CLAUDE.md

@apps/mobile-rn/.eslintrc.json
@apps/mobile-rn/.env.example
@docs/INTEGRATIONS.md
@docs/DECISIONS/0004-feed-backend-cleanup.md

<interfaces>
<!-- ESLint rule additions (EXTEND). -->

```json
// apps/mobile-rn/.eslintrc.json (EXTEND — add to "rules")
{
  "no-restricted-syntax": [
    "error",
    {
      "selector": "MemberExpression[object.object.name='process'][object.property.name='env'][property.name=/^EXPO_PUBLIC_.*_SECRET$/]",
      "message": "Secrets must NOT be exposed via EXPO_PUBLIC_* — they ship in the bundle. Use ~/.netrc / ~/.gradle/gradle.properties at build time."
    },
    {
      "selector": "Literal[value=/^sk\\.[A-Za-z0-9_-]{40,}/]",
      "message": "Hard-coded Mapbox sk. secret detected. Move to ~/.netrc / ~/.gradle/gradle.properties."
    }
  ]
}
```

<!-- New documentation file (NEW). -->

```markdown
# docs/SECRETS.md (NEW)
- Token inventory (pk + sk, with classification rules)
- 4-step rotation playbook (Mapbox specifically)
- Storage rules: ~/.netrc mode 600 (iOS Pods), ~/.gradle/gradle.properties (Android Gradle, outside repo)
- Incident response on leak detection
- ESLint guard reference
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Write docs/SECRETS.md rotation playbook + env.example clarification</name>
  <files>docs/SECRETS.md, apps/mobile-rn/.env.example</files>
  <action>
    Per CONTEXT.md D-32 + RESEARCH.md §Security Domain + PATTERNS.md §docs/SECRETS.md (lines 706-714):

    Step 1a — Create or extend `docs/SECRETS.md`. Russian-language narrative per CLAUDE.md convention. Required sections (in order):

    1. **Inventory (Инвентарь токенов)** — describe the two Mapbox tokens:
       - `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN` — public `pk.…` token, bundled with the app, restricted to Bundle ID `com.runningecosystem.mobile` + Android SHA-256 fingerprint in the Mapbox dashboard. Safe to ship.
       - `RNMAPBOX_MAPS_DOWNLOAD_TOKEN` — secret `sk.…` token, build-time only (CocoaPods + Gradle download SDK binaries). NEVER bundled. Lives in `~/.netrc` (iOS) + `~/.gradle/gradle.properties` (Android).

    2. **Классификация (Classification rules)** — `pk.…` (public, bundle-safe), `sk.…` (secret, build-time only). Any token misclassified (e.g., a `pk.…` labeled "server-secret" or an `sk.…` mistakenly placed in `EXPO_PUBLIC_*`) is to be treated as compromised and rotated immediately.

    3. **Rotation Playbook (4 steps per D-32)** — paste literally:
       1. Generate new `sk.<…>` in Mapbox dashboard (https://account.mapbox.com/access-tokens) → restrict to Bundle ID `com.runningecosystem.mobile` + Android SHA-256 fingerprint. Generate new `pk.<…>` if the existing one is also suspected.
       2. Delete the previous (possibly leaked) `pk.<…>` mistakenly named `server-secret`.
       3. Store the new `sk.<…>` in `~/.netrc` (iOS Pods install — file mode 600) AND `~/.gradle/gradle.properties` (Android Gradle build — outside the repo, mode 600). NEVER in `.env` checked into git, NEVER in `process.env.EXPO_PUBLIC_*`.
       4. Rebuild iOS Pods + Android with the new token; verify tile fetch works in dev build; only then revoke the old token in dashboard.

    4. **Storage Rules** —
       - `~/.netrc` file mode 600 (chmod 600 ~/.netrc).
       - `~/.gradle/gradle.properties` mode 600. ENSURE the file is outside the repo (e.g., `~/.gradle/`, not `apps/mobile-rn/android/gradle.properties` which IS in repo).
       - .env files: only `EXPO_PUBLIC_*` and other public vars. NEVER `*_SECRET` keys.

    5. **Incident Response (Что делать при обнаружении утечки)** —
       - If a token is leaked via chat / issue / git history: treat as compromised; rotate immediately (steps 1-4); audit logs in Mapbox dashboard for unauthorized traffic spikes; document in an ADR if the leak was a process failure.

    6. **Guard rails (ESLint)** —
       - Reference the `no-restricted-syntax` rule added in Task 2: rejects `process.env.EXPO_PUBLIC_*_SECRET` and string literals matching `^sk\\.[A-Za-z0-9_-]{40,}`.
       - CI runs `npm run lint` on every PR; any regression is blocked at PR-time.

    Step 1b — Update `apps/mobile-rn/.env.example`. Read the current file. Ensure it has BOTH variables documented with explicit comments:
    ```
    # PUBLIC — bundled with app. Restrict to bundle ID + SHA-256 in Mapbox dashboard.
    EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN=pk.your-public-token-here

    # SECRET — build-time only. NEVER commit a real value.
    # iOS: lives in ~/.netrc.   Android: lives in ~/.gradle/gradle.properties.
    # This line in .env.example is a documentation stub — do NOT add `EXPO_PUBLIC_` prefix.
    RNMAPBOX_MAPS_DOWNLOAD_TOKEN=sk.replace-via-netrc-or-gradle-do-not-commit
    ```
    If `.env.example` has any other `*_SECRET` keys, list them with the same warning comment.

    NEVER write a real token into either file. NEVER mark the public token `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN` as `_SECRET` (that triggers the future ESLint rule). NEVER add an `EXPO_PUBLIC_` prefix to `RNMAPBOX_MAPS_DOWNLOAD_TOKEN` (per CONCERNS.md security § + RESEARCH.md §Pitfall 6).

    Implements PHASE1-13 docs layer (D-32).
  </action>
  <verify>
    <automated>test -f docs/SECRETS.md && grep -c "sk\\." docs/SECRETS.md && grep -c "RNMAPBOX_MAPS_DOWNLOAD_TOKEN" apps/mobile-rn/.env.example</automated>
  </verify>
  <done>docs/SECRETS.md exists with all 6 sections. .env.example has both variables documented. No real tokens written anywhere.</done>
</task>

<task type="auto">
  <name>Task 2: Add ESLint no-restricted-syntax rules + lint fixture + audit grep</name>
  <files>apps/mobile-rn/.eslintrc.json, apps/mobile-rn/src/__fixtures__/secret.lint-fixture.ts, apps/mobile-rn/.eslintignore</files>
  <action>
    Per CONTEXT.md D-33 + RESEARCH.md Code Examples lines 581-598 + PATTERNS.md §.eslintrc.json (lines 481-505):

    Step 2a — Read `apps/mobile-rn/.eslintrc.json`. Identify the existing `"rules"` block (which already has `no-restricted-imports` for `@rnmapbox/maps` outside `src/map/`). Add a sibling `no-restricted-syntax` rule with the two AST selectors from the <interfaces> block + RESEARCH.md Code Examples:
    ```
    "no-restricted-syntax": [
      "error",
      {
        "selector": "MemberExpression[object.object.name='process'][object.property.name='env'][property.name=/^EXPO_PUBLIC_.*_SECRET$/]",
        "message": "Secrets must NOT be exposed via EXPO_PUBLIC_* — they ship in the bundle. Use ~/.netrc / ~/.gradle/gradle.properties at build time."
      },
      {
        "selector": "Literal[value=/^sk\\.[A-Za-z0-9_-]{40,}/]",
        "message": "Hard-coded Mapbox sk. secret detected. Move to ~/.netrc / ~/.gradle/gradle.properties."
      }
    ]
    ```
    The `{40,}` length quantifier prevents false-positives on short strings like `'sk-button'` per RESEARCH.md §Pitfall 6.

    Step 2b — Create `apps/mobile-rn/src/__fixtures__/secret.lint-fixture.ts`. Content (per PATTERNS.md lines 684-691):
    ```
    // Intentional lint-failure fixture for PHASE1-13 token-secret guard.
    // CI verifies that running ESLint on this file exits non-zero.

    const leakedSecret = process.env.EXPO_PUBLIC_MAPBOX_SECRET; // ← should trigger no-restricted-syntax (MemberExpression)
    const hardCoded = 'sk.eyJ1IjoiZmFrZSIsImEiOiJja3FxcWFhYWEwMDFhMm9wbHBpZXh4eHh4eHgifQ.fake-suffix-for-fixture'; // ← should trigger Literal selector

    export { leakedSecret, hardCoded };
    ```

    Verify the hard-coded string is >40 chars after the `sk.` prefix (count visually — the fake JWT-like body is long enough).

    Step 2c — Create or extend `apps/mobile-rn/.eslintignore`. Add `src/__fixtures__/` so the standard `npm run lint` does NOT trip over the fixture file:
    ```
    # Intentional lint-failure fixtures (verified via dedicated `lint --no-ignore -- src/__fixtures__/`).
    src/__fixtures__/
    ```

    Step 2d — Verify the rules fire on the fixture and DON'T fire elsewhere:
    ```
    cd apps/mobile-rn
    npm run lint                                                                          # MUST exit 0 — fixture excluded
    npx eslint --no-ignore -- src/__fixtures__/secret.lint-fixture.ts 2>&1 | tail -10     # MUST exit non-zero with both messages
    ```
    Capture the second command's output and confirm both messages appear: "Secrets must NOT be exposed via EXPO_PUBLIC_*" and "Hard-coded Mapbox sk. secret detected".

    Step 2e — Audit-grep for prior leaks. Per D-34:
    ```
    git grep -nE 'EXPO_PUBLIC_.*_SECRET' -- apps/mobile-rn/  # must return only .env.example documentation + fixture; no production code matches
    git grep -nE 'sk\\.[A-Za-z0-9_-]{40,}' -- apps/mobile-rn/ docs/  # must return only the fixture's fake token
    git log -p -- apps/mobile-rn/.env 2>/dev/null | head -50    # check that .env was never committed (file shouldn't exist in history)
    ```
    Record the outcome of each command in the SUMMARY for traceability. If a real leak is found (a token in git history that matches the regex), STOP and surface to the user — that escalates this plan to a security incident requiring `git filter-branch` / BFG remediation (out of scope for this plan).

    NEVER bypass the `{40,}` length quantifier — short `sk-*` strings (CSS class names, prop names) would generate false positives and erode trust in the rule. NEVER add the fixture file's content to git without `.eslintignore` first (would block CI). NEVER omit the `MemberExpression[object.object.name='process']` constraint — without it, the rule matches any `.EXPO_PUBLIC_X_SECRET` property access on any object, generating false positives in tests / dev tools.

    Implements PHASE1-13 lint + audit layer (D-33, D-34).
  </action>
  <verify>
    <automated>cd apps/mobile-rn && npm run lint && npx eslint --no-ignore -- src/__fixtures__/secret.lint-fixture.ts 2>&1 | grep -E "Secrets must|Hard-coded Mapbox"</automated>
  </verify>
  <done>npm run lint exits 0 over the codebase. `npx eslint --no-ignore -- src/__fixtures__/secret.lint-fixture.ts` exits non-zero AND both rule messages appear in the output. `git grep` audits return only the fixture + docs (no production leaks).</done>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 3: Owner-only Mapbox dashboard rotation</name>
  <what-built>
    docs/SECRETS.md playbook + ESLint guard + audit grep are in place. The CODE side of PHASE1-13 is done.
    What REMAINS is a human-only step: rotating the actual `sk.…` token in the Mapbox dashboard. Claude cannot do this.
  </what-built>
  <how-to-verify>
    Follow `docs/SECRETS.md` §Rotation Playbook (steps 1-4):

    1. Open https://account.mapbox.com/access-tokens (sign in as project owner).
    2. CREATE a new secret token: click "Create a token". Name: `sport-mobile-build-sk`. Scopes: `STYLES:READ`, `FONTS:READ`, `TILES:READ`, `DATASETS:LIST`, `DATASETS:READ`, `DOWNLOADS:READ`. URL restrictions: skip (mobile bundle-ID restriction handled separately). Click "Create token". Copy the resulting `sk.…` (you only see it once).
    3. Open `~/.netrc` in your editor. Add or update the entry:
       ```
       machine api.mapbox.com
         login mapbox
         password sk.<paste-the-new-token>
       ```
       Save. Run `chmod 600 ~/.netrc`.
    4. Open `~/.gradle/gradle.properties` (NOT the repo's `apps/mobile-rn/android/gradle.properties` — the user-level one). Add or update:
       ```
       MAPBOX_DOWNLOADS_TOKEN=sk.<paste-the-new-token>
       ```
       Save. Run `chmod 600 ~/.gradle/gradle.properties`.
    5. Verify the public `pk.…` token: confirm it is restricted to Bundle ID `com.runningecosystem.mobile` AND Android SHA-256 fingerprint in the Mapbox dashboard. If unrestricted, ADD the restrictions now (Mapbox dashboard → token settings → Add URL/Bundle restriction).
    6. Test a clean iOS pod install: `cd apps/mobile-rn/ios && pod deintegrate && pod install` — should succeed without 401 from Mapbox download endpoint.
    7. Test a clean Android build: `cd apps/mobile-rn/android && ./gradlew :app:clean :app:assembleDebug` — should succeed.
    8. Open the dev build on an actual device; verify the map renders and tiles fetch without error.
    9. Only AFTER 6-8 succeed: DELETE the old leaked `pk.…` (or `sk.…`) in the Mapbox dashboard. Confirm deletion.

    Document the rotation in `docs/SECRETS.md` under a new "Rotation Log" section at the bottom with the date and a one-line note (no token values).
  </how-to-verify>
  <resume-signal>Type "rotated" when the new `sk.…` is in place AND iOS + Android dev builds succeed; OR type "blocked" with the specific failure if any step fails (e.g., "iOS pod install 401 from api.mapbox.com")</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Developer machine (`~/.netrc`, `~/.gradle/gradle.properties`) → Mapbox API | Build-time secret. The `sk.…` token MUST never leave the developer's machine: never in `process.env.EXPO_PUBLIC_*`, never in `.env` checked into git, never in chat/issue logs. |
| Mobile app bundle (`pk.…` public token) → Mapbox tile API | Public token shipped with the app. Mitigated by Bundle ID + Android SHA-256 restrictions in Mapbox dashboard. |
| ESLint AST rules → Source code | Build-time security gate. Cannot prevent a developer who edits `.eslintrc.json` to disable the rule, but creates a visible diff in PR review (trust the review process). |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-01-08-01 | Information Disclosure | `sk.…` token in JS bundle | mitigate | ESLint rule (Task 2) rejects `EXPO_PUBLIC_*_SECRET` member access AND any string literal matching `^sk\\.[A-Za-z0-9_-]{40,}` at lint time. CI blocks the regression. |
| T-01-08-02 | Information Disclosure | `pk.…` token abused for traffic outside our app | mitigate | Bundle ID + Android SHA-256 fingerprint restrictions on the public token in Mapbox dashboard (Task 3 step 5). Confirmed via dashboard inspection. |
| T-01-08-03 | Tampering | Token rotation rollback (re-enabling old leaked `pk.…`) | mitigate | Playbook (Task 1) instructs to DELETE old token AFTER dev builds confirm with new token — never both active. Treat any historical leak as compromised. |
| T-01-08-04 | Information Disclosure | Pre-commit hooks bypass via `--no-verify` | accept | Single developer team; convention enforced. If a precommit secret scanner is added later, ESLint rule is the second line of defense. |
| T-01-08-05 | Repudiation | Rotation event not recorded → cannot prove when leak was closed | mitigate | Task 3 instructs to append a "Rotation Log" entry in `docs/SECRETS.md` with date (no token value). |
| T-01-08-06 | Spoofing | Attacker generates their own `sk.…` and submits via PR — passes lint because it matches no specific account | accept | PR review catches obvious additions; ESLint rule is about preventing accidental commits, not adversarial PRs from team members. |
| T-01-08-07 | Information Disclosure | False positives on `'sk-button'` etc. cause developers to disable the rule | mitigate | `{40,}` length quantifier in the regex prevents short strings from matching (RESEARCH.md §Pitfall 6). Verified via the fixture-passes-lint negative test in Task 2. |
| T-01-08-08 | Information Disclosure | `RNMAPBOX_MAPS_DOWNLOAD_TOKEN` accidentally committed to `apps/mobile-rn/android/gradle.properties` | mitigate | `docs/SECRETS.md` (Task 1) explicitly directs to `~/.gradle/gradle.properties` (user-level), NOT the repo file. Audit grep (Task 2 step 2e) confirms no historical commit. |

ASVS V6 (Cryptography) and V14 (Configuration) apply. See RESEARCH.md §Security Domain for the full ASVS mapping table.
</threat_model>

<verification>
- `test -f docs/SECRETS.md && wc -l docs/SECRETS.md` — file exists, ≥60 lines.
- `cd apps/mobile-rn && npm run lint` — exit 0 (fixture excluded via .eslintignore).
- `cd apps/mobile-rn && npx eslint --no-ignore -- src/__fixtures__/secret.lint-fixture.ts; echo "exit=$?"` — exit non-zero; output contains "Secrets must NOT be exposed" + "Hard-coded Mapbox sk. secret".
- `git grep -nE 'EXPO_PUBLIC_.*_SECRET' -- apps/mobile-rn/src/` — empty.
- `git grep -nE 'sk\\.[A-Za-z0-9_-]{40,}' -- apps/mobile-rn/src/` — empty OR only the fixture (and only if it's grep'd separately).
- Human-only verification (Task 3): owner confirms `~/.netrc` + `~/.gradle/gradle.properties` updated; iOS + Android dev builds succeed; old token deleted in Mapbox dashboard.
</verification>

<success_criteria>
- All must_haves.truths above are TRUE.
- Code side complete: docs + lint guard + fixture + audit clean.
- Human side complete: token rotated, restrictions verified, dev builds succeed. (Captured via Task 3 checkpoint.)
- ROADMAP Phase 1 Success Criteria #4 unblocks: "Mapbox `server-secret` is a real `sk.…` token with Android SHA-256 fingerprint restriction; no secret token strings remain in chat history or `.env` checked into git; ESLint guard rejects `EXPO_PUBLIC_*_SECRET`."
- Atomic commits per task: Task 1 `docs(phase1): SECRETS.md rotation playbook (PHASE1-13)`, Task 2 `feat(phase1): ESLint guard for token secrets (PHASE1-13)`. Task 3 produces no git commit but updates docs/SECRETS.md "Rotation Log" — commit message `docs(phase1): rotation log entry (PHASE1-13)`.
</success_criteria>

<output>
After completion, create `.planning/phases/01-validate-close-territory-core/01-08-SUMMARY.md` capturing:
- Whether the audit-grep found any historical leaks (and if so, the remediation taken)
- Outcome of Task 3 checkpoint (rotated, blocked, or partially complete)
- ESLint rule false-positive testing — confirm `'sk-button'`, `'sk-card'`, etc. do NOT trigger the rule on the codebase
- Cross-link: closes PHASE1-13 + supports ROADMAP Phase 1 Success Criteria #4
</output>
