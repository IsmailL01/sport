# Phase 8 — Plan Check Report

**Checked:** 2026-05-24
**Plans verified:** `08-01-PLAN.md` (Wave 1, 9 tasks: Task 0 Wave 0 + Tasks 1-8; 2 USER ACTION checkpoints at Task 2 + Task 7; `autonomous: false`)
**Methodology:** goal-backward against ROADMAP Phase 8 Android success criteria (1-4; criteria 5-7 DEFERRED per ADR-0011 Amendment 3) + REQUIREMENTS.md §DIST-01 + 08-CONTEXT.md 25 D-NN locked decisions + 08-RESEARCH.md 17 pitfalls + the newly-identified Pitfall 18 (Go omitempty + alphabetical struct field ordering)
**Provenance note:** Plan was INLINE-WRITTEN by the orchestrator after gsd-planner stalled (16 min + 15 tool uses → stream idle timeout — same reliability pattern as Phase 7 Plans 07-01 + 07-03). Scored against Phase 7 07-PLAN-CHECK PASS-WITH-NITS baseline.

---

## Verdict Summary

| Check | Name | Verdict | Notes |
|------:|------|---------|-------|
| 1 | Goal-backward (DIST-01 + 4 Android-only success criteria) | PASS | Tag push → testers get APK walks cleanly through Tasks 0→1→2→3→4→5→6→7→8 with no missing link; each Phase 8 criterion has a covering task; iOS criteria 5-7 explicitly deferred via `D-08-IOS-DIST` |
| 2 | Decision coverage (D-01..D-25) | PASS-WITH-NITS | 25/25 referenced; one minor substitution (D-11 "FeedScreen" → "JournalScreen" — see Findings §2.1) |
| 3 | Pitfall coverage (17 RESEARCH + Pitfall 18) | PASS | 18/18 mitigated or out-of-scope-acknowledged; Pitfall 18 documented inline by planner + caught by cross-language smoke |
| 4 | Dependency correctness | PASS | `depends_on: [07-01]` (NOT 07-03) per D-17; serial single-wave (no parallelism); cross-task ordering enforced (Task 2 USER ACTION blocks Task 3 via attestation file; Task 4 cherry-pick mirrors 07-01 `b461ea6`) |
| 5 | Reusable infrastructure (no duplication) | PASS | REUSES: REL-02 `useForceUpdateStore` + `ForceUpdateScreen` (Task 5 step 7 — "NO new ForceUpdate code authored"); Caddy MinIO reverse-proxy (no new Caddy config); SOPS pattern from `.secrets/prod/mobile-signing.yaml`; android-release.yml EXTENDED not rewritten (Task 4); AutostartDialog sibling-wiring pattern from Plan 07-03 (Task 6 step 2 `{/* Plan 07-03 Task 4 — sibling to UpdateBanner */}`) |
| 6 | Atomic commits | PASS | Each autonomous task ends with exactly one git commit; all messages follow `feat(08-01): <desc> (DIST-01)` / `chore(08-01):` / `docs(08-01):` / `evidence(08-01):` convention matching 06-01 + 07-01 baseline |
| 7 | USER ACTION gates | PASS-WITH-NITS | Task 2 + Task 7 both `type="checkpoint:human-action" gate="blocking"`; concrete commands provided; attestation files required; one NIT — Task 2 lacks an explicit `<resume-signal>` block in 07-01 style (Findings §7.1) |
| 8 | `verify_items` mapping | PASS | 6 frontmatter items each map to a specific task: DIST-01-manifest-fetchable→T3/T4; apk-signed-url-works→T7 step 6; tag-pipeline-fires→T7 step 2-3; mobile-check-on-launch→T5+T6; settings-check-button→T6; force-update-reuse→T5 step 7. Each carries a measurable acceptance criterion |
| 9 | Smoke scripts | PASS | 4 task-specific smokes (`smoke-wave0.sh` umbrella + `smoke-manifest-sign-roundtrip.sh` + `smoke-release-distribute.sh` + `smoke-mobile-update-flow.sh`); cross-language smoke (Task 3) catches the load-bearing canonical-JSON Go↔JS drift risk (RESEARCH §10 MEDIUM-confidence); shape smokes (Task 4) catch workflow-string regressions including `::add-mask::` presence |
| 10 | Credential discipline (ADR-0012) | PASS | Task 1 step 2 uses `printf '%s' \| shasum -a 256 \| cut -c1-12` fingerprint form (Rule 1); explicit "NEVER xxd / od / hexdump" comment (Rule 2); `SOPS_AGE_KEY_FILE` exported in pre-flight (Rule 5); round-trip via `sops -d \| yq` shape check only, not value-print (Rule 4); Task 4 `::add-mask::$MANIFEST_SIGNING_PRIVATE` fires BEFORE `$GITHUB_ENV` write (the load-bearing ADR-0012 rule); `find … -exec rm -P` wipes tempdir + `unset PRIV` clears shell |
| 11 | Cross-language canonical JSON | PASS-WITH-NITS | Task 3 sign-manifest.go uses alphabetical struct-field ordering (Pitfall 1); Task 5 manifestSigning.ts uses manual `Object.keys().sort()` (Pitfall 6); smoke-manifest-sign-roundtrip.sh exercises Go-sign → Node-verify on a known payload BEFORE any release fires; one NIT — the smoke script body has a self-aware bug (Findings §11.1) |
| 12 | Scope discipline | PASS | Stays within Phase 8 boundary; no Phase 9 tester-onboarding work; deferrals frontmatter explicitly enumerates 4 deferred items (iOS, multi-region, private invite gating, auto-install); Task 8 closeout chore (ROADMAP/REQUIREMENTS Hetzner→MinIO rewrite) is correctly scoped to Plan 08-01 per CONTEXT must_haves item 7 |

**Overall verdict:** **PASS-WITH-NITS** — proceed to `/gsd-execute-phase 8`.

5 nits identified; none block goal achievement. All nits are quality-of-life improvements the executor can absorb in-task without re-planning.

---

## Detailed Findings

### Goal-Backward Trace (Check 1)

**Phase goal (CONTEXT §Phase Boundary):** "Ship one command — `git tag v1.0.0-beta.N && git push origin v1.0.0-beta.N` — and have Android closed-beta testers receive the new APK without manual intervention beyond tapping 'Update' inside the app."

| Truth required for goal | Plan task(s) closing it | Verification |
|---|---|---|
| Ed25519 keypair exists in SOPS + pubkey hardcoded in mobile | T1 | `manifest-pubkey-fingerprint.txt` + tsc clean + SOPS round-trip |
| MinIO buckets exist + service account scoped + GH secrets present | T2 (USER) | `minio-provisioning-attestation.txt` + `gh secret list \| grep MINIO_RELEASES_*` |
| CI extracts APK from .aab, uploads, signs manifest, publishes | T3 + T4 | cross-language smoke + `actionlint` + workflow-shape smoke |
| Tag-trigger registered on `main` (workflow fires) | T4 step 4 (cherry-pick mirrors 07-01 `b461ea6`) | `git log --oneline -3 main \| grep 08-01` |
| Mobile fetches manifest + verifies signature + dispatches | T5 | tsc + jest update/__tests__ green |
| UI surfaces banner / settings entry / force-update reuse | T6 | smoke-mobile-update-flow.sh 7 grep assertions + tsc |
| End-to-end pipeline fires on a real tag + APK installs on device | T7 (USER) | `dist-pipeline-attestation.txt` with cert SHA-256 match |
| ROADMAP/REQUIREMENTS scrubbed of Hetzner Storage Box | T8 | `! grep "Hetzner Storage Box" ROADMAP.md` + `gsd-tools state validate` |

All 8 load-bearing truths trace to a Task + Verification pair. Goal coverage is complete.

### Decision Coverage Audit (Check 2)

D-01 through D-25 all surface in the plan body, frontmatter, or `read_first` blocks. Spot-check below:

| D | Where applied | OK |
|---|---|---|
| D-01 (MinIO storage) | T2 + T8 ROADMAP rewrite | ✓ |
| D-02 (two buckets) | T2 step 2 explicit `mc anonymous set` per bucket | ✓ |
| D-03 (manifest URL) | T5 const + `verify_items[0]` | ✓ |
| D-04 (Ed25519) | T1 + T3 | ✓ |
| D-05 (SOPS schema) | T1 step 4 + read_first | ✓ |
| D-06 (canonical JSON 7-field shape) | T3 struct + T5 manifestSchema.ts | ✓ |
| D-07 (sign flow) | T3 sign-manifest.go + release-distribute.sh sequence | ✓ |
| D-08 (AppState + 6h throttle) | T5 manifestCheck.ts + useUpdateCheckOnForeground | ✓ |
| D-09 (hardcoded pubkey) | T1 manifestSigning.ts MANIFEST_PUBKEY_BASE64 | ✓ |
| D-10 (@noble/ed25519) | T1 step 6 `npx expo install @noble/ed25519 @noble/hashes` | ✓ |
| D-11 (3-state UX) | T6 — see NIT §2.1 (Feed → Journal substitution) | ⚠ |
| D-12 (Settings entry) | T6 step 4 | ✓ |
| D-13 (silent failure) | T5 step 4 explicit | ✓ |
| D-14 (workflow extension) | T4 | ✓ |
| D-15 (new CI secrets) | T2 + T4 env wiring | ✓ |
| D-16 (bundletool 1.18.x pin) | T4 `BUNDLETOOL_VERSION=1.18.1` | ✓ |
| D-17 (NOT depend on 07-03) | `depends_on: [07-01]` | ✓ |
| D-18 (two new Zustand stores) | T5 updateBanner + updateCheck | ✓ |
| D-19 (module location `src/update/`) | T5 + T6 files | ✓ |
| D-20 (direct fetch) | T5 step 4 — manifestCheck.ts uses native fetch | ✓ |
| D-21 (idempotency + atomicity) | T3 sequence + T4 `BUNDLETOOL_VERSION` pin | ✓ |
| D-22 (Linking.openURL → installer) | T6 UpdateBanner.tsx | ✓ |
| D-23 (signature spoofing protection) | T1 — pubkey hardcoded, private in SOPS only | ✓ |
| D-24 (replay protection) | T5 step 4 + risk register | ✓ |
| D-25 (24h expiry) | T3 `--expire 24h` + T8 ROADMAP rewrite calls out CRON-refresh deferral | ✓ |

25/25 coverage. One nit on D-11 substitution.

### Pitfall Coverage Audit (Check 3)

| Pitfall | Mitigation | Where | Status |
|---|---|---|---|
| 1 — Go JSON struct-field order | Alphabetical struct fields | T3 sign-manifest.go | ✓ |
| 2 — Seed vs full private key | `ed25519.NewKeyFromSeed(seed)`; T1 step 2 length-check `[ ${#PRIV} -eq 44 ]` | T1 + T3 | ✓ |
| 3 — Byte-identical canonical JSON | Cross-language smoke (Go-sign → Node-verify) | T3 step 5 | ✓ |
| 4 — SHA-512 backend wiring | `ed25519.etc.sha512Sync = ...` at module load | T1 manifestSigning.ts L19 | ✓ |
| 5 — Buffer vs Uint8Array on RN | Pure-JS `atob` + `charCodeAt` loop, no Buffer | T1 manifestSigning.ts L35-40 | ✓ |
| 6 — JS canonical JSON sort | `Object.keys(rest).sort()` reduce pattern | T1 manifestSigning.ts L26 | ✓ |
| 7 — Node PKCS8 vs raw seed | Sidestepped: Go signer reads raw 32-byte seed directly from SOPS | T1 + T3 | ✓ |
| 8 — TLS verification on Caddy proxy | mc validates by default; commented | T3 L587 | ✓ |
| 9 — Bucket creation race | T2 step 4 sets policies via `mc anonymous set` BEFORE T3 first upload | T2 + T3 | ✓ |
| 10 — `mc share download` parsing | Robust regex + fallback note in risk register | T3 step 3 L607-609 | ✓ |
| 11 — Caddy + sslip.io subdomain wildcard | No new Caddy config (manifest-as-MinIO-object) | (no task; explicit in summary) | ✓ |
| 12 — bundletool re-signing | T7 step 6 `apksigner verify --print-certs` against keystore SHA-256 | T7 + risk register | ✓ |
| 13 — bundletool Java 11+ | Implicit reuse of Plan 07-01 setup-java@v4 | T4 (implicit) | ⚠ minor — see NIT §3.1 |
| 14 — zod absence | Hand-roll manifestSchema.ts | T5 step 2 | ✓ |
| 15 — semver in RN | Hand-roll semverLite.ts | T5 step 1 | ✓ |
| 16 — Drop --no-wait | T4 step 2 explicit + smoke `grep -vq no-wait` | T4 | ✓ |
| 17 — versionCode source | T4 reads `.versionCode` from EAS JSON | T4 step 2 | ✓ |
| 18 — Go omitempty + alphabetical struct (NEW) | Documented inline by planner; cross-language smoke catches drift | T3 inline + smoke-manifest-sign-roundtrip.sh | ✓ |

18/18 pitfalls applied or out-of-scope-acknowledged. Pitfall 18 was identified by the planner during inline-write (load-bearing because the canonical payload is `Signature=""` omitted, final output re-marshalled with signature populated; mobile verifier strips signature again; whole chain validated only by cross-language smoke).

### Reusable Infrastructure Audit (Check 5)

| Component | Reused (vs reimplemented) | Evidence in plan |
|---|---|---|
| REL-02 `useForceUpdateStore` | REUSED | T5 step 7 `<done>` explicit "Force-update path REUSES useForceUpdateStore from REL-02 untouched. NO new ForceUpdate code authored." |
| REL-02 `ForceUpdateScreen` | REUSED | `verify_items[5]` "existing REL-02 ForceUpdateScreen renders blocking Modal" + risk register |
| Caddy MinIO reverse-proxy | REUSED | Plan summary L102 "no new Caddy config"; CONTEXT D-03 |
| SOPS multi-recipient pattern | REUSED | T1 step 4 `sops -e --age "$(awk … .sops.yaml ...)"` reuses Plan 07-01 `dd0dce5` recipient list |
| `android-release.yml` workflow | EXTENDED | T4 step 2 "Insert NEW steps AFTER 'Trigger EAS build'" not rewrite |
| AutostartDialog sibling-wiring pattern | REUSED | T6 step 2 `{/* Plan 07-03 Task 4 — sibling to UpdateBanner */}` |
| Plan 07-01 cherry-pick to `main` | REUSED | T4 step 4 references `b461ea6` precedent |
| MMKV+Zustand store pattern | REUSED | T5 read_first `state/featureflags.ts` |
| Plan 06/07 evidence/tool-versions.txt format | REUSED | T0 step 2 "copy value" for sops/yq/openssl/etc. |

No duplication detected. Existing infrastructure is consistently extended, not rewritten.

### Credential Discipline Audit (Check 10, ADR-0012)

| Rule | Compliance | Where |
|---|---|---|
| Rule 1 — only `printf '%s' \| shasum -a 256 \| cut -c1-12` fingerprint form | Applied | T1 step 2 `PRIV_FP=$(printf '%s' "$PRIV" \| shasum -a 256 \| cut -c1-12)` |
| Rule 2 — NEVER xxd/od/hexdump on secret bytes | Applied | T1 step 2 inline comment "NEVER xxd / od / hexdump on $PRIV per ADR-0012 amendment Rule 2." |
| Rule 4 — round-trip = shape check, not value inspection | Applied | T1 step 4 `[ "$VERIFY_PUB" = "$PUB" ]` equality check (pubkey is non-secret; PRIV not echoed) |
| Rule 5 — explicit `SOPS_AGE_KEY_FILE` | Applied | T1 step 1 + T7 step 7 explicit export |
| `::add-mask::` BEFORE `$GITHUB_ENV` write | Applied | T4 step 2 line ordering: mask line precedes env-write line |
| Tempdir wipe + variable unset | Applied | T1 step 4 `find "$TMP" -type f -exec rm -P {} \;` + `unset PRIV` |

All 6 ADR-0012 discipline rules are mechanically present in the plan body. The plan also adds a pre-flight check (T1 step 1) verifying `SOPS_AGE_KEY_FILE` is set + age recipients present in `.sops.yaml` before any keypair generation runs — defensive layering above the rules.

### USER ACTION Gate Boundary Audit (Check 7)

| Task | Gate boundary | Resume signal | Verifiable? |
|---|---|---|---|
| T2 | `type="checkpoint:human-action" gate="blocking"` + `<verify><automated>` checks attestation file existence + `gh secret list \| grep MINIO_RELEASES_*` | `<user-attests>` block present + attestation file path; NO explicit `<resume-signal>` block matching 07-01 Task 6 style | YES (functional) — NIT §7.1 |
| T7 | `type="checkpoint:human-action" gate="blocking"` + `<verify><user-attests>` + `<automated>` attestation-file + git-log grep | `<user-attests>` block present + 10-step procedure with explicit shell commands + attestation EOF template | YES |

Both gates are clean — executor cannot accidentally bypass because (a) attestation files are required artifacts, (b) `<verify><automated>` checks would fail otherwise. T7 procedure is concrete (10 numbered steps with shell commands; no ambiguous "verify it works" wording). One structural NIT on T2.

---

## Nits (Non-Blocking Recommendations)

### NIT 2.1 — D-11 "FeedScreen" → "JournalScreen" substitution

CONTEXT D-11 specifies banner location as "top of TrackerStartScreen + top of FeedScreen". Plan T6 substitutes `apps/mobile-rn/src/navigation/screens/journal/JournalScreen.tsx` — there is no `FeedScreen.tsx` in the codebase (verified: `find apps/mobile-rn -name "FeedScreen*"` returns empty). This is a reasonable interpretation (journal = activity feed for runners), but the substitution is not called out as a planner-resolved open question. Recommendation: SUMMARY (Task 8) should document "D-11 wording 'FeedScreen' interpreted as JournalScreen (no FeedScreen file in repo)" under "Deviations from plan". Not blocking — the wiring is correct against the real file structure.

### NIT 3.1 — Pitfall 13 (Java 11+) inheritance not explicit

T4 implicitly inherits Plan 07-01's `setup-java@v4` step (which sets JDK 17). T4 step 2 inserts NEW steps AFTER "Trigger EAS build", which sits after the setup-java step in the existing workflow. The inheritance works mechanically but the plan doesn't call out the dependency. Recommendation: T4 read_first could add a line "Plan 07-01 setup-java@v4 step already sets JDK 17; bundletool 1.18.1 needs Java 11+ which is satisfied — see RESEARCH §3 Pitfall 13". Not blocking — the workflow shape is correct.

### NIT 7.1 — T2 lacks explicit `<resume-signal>` block

Phase 6 06-01 Task 6 + Phase 7 07-01 Task 6 + 07-03 Tasks 5/6 all use a `<resume-signal>` block with a structured PASS/FAIL matrix that the user types verbatim to resume. T2 in this plan uses only `<user-attests>` (the long-form text confirmation) + an attestation file existence check. This works but is structurally inconsistent with the 07-01 baseline. Recommendation: T2 could add `<resume-signal>Type "MinIO provisioned" to continue</resume-signal>` for consistency. T7 already has this implicitly via `<user-attests>`. Not blocking — the functional gate is enforced by the attestation file requirement.

### NIT 11.1 — smoke-manifest-sign-roundtrip.sh has a self-aware keypair-mismatch bug

T3 step 5 smoke script lines 664-669:
```bash
PRIV=$(go run "$TMP/gen.go" | head -1)
PUB=$(go run "$TMP/gen.go" | tail -1)
# NOTE: PRIV and PUB came from DIFFERENT runs — won't match. Fix:
OUT=$(go run "$TMP/gen.go")
PRIV=$(echo "$OUT" | head -1)
PUB=$(echo  "$OUT" | tail -1)
```

The planner caught its own bug mid-write and patched it inline. The patched version is correct (single `go run` captured into `OUT`, then head/tail extract pair). But the dead-code first attempt (lines 664-665) is still present in the smoke body — it will execute, produce mismatched PRIV/PUB, then be overwritten. Functionally correct but leaves dead lines in the script. Recommendation: T3 step 5 action should produce only the second (correct) form when populating the smoke. The executor should silently fix this when writing the file. Not blocking — the final assignments to `PRIV` + `PUB` are correct and the smoke would pass.

Also: the smoke generates a fresh `gen.go` inside `$TMP/` and runs it; the `gen.go` body outputs the keypair using `priv.Seed()` for private — that matches the Pitfall 2 raw-seed convention. OK.

### NIT 12.1 — Scope check: Task 8 STATE update may overstate progress

T8 step 4 writes `progress.completed_plans: 2 → 3` to `.planning/STATE.md`. The current STATE has 2 completed plans (06-01 + 07-01 closed); Plan 07-03 is mid-flight (device-blocked). Bumping to 3 after Plan 08-01 closure is correct — 06-01 + 07-01 + 08-01 = 3. The plan correctly notes "Next: Phase 9 (LAUNCH-01..02) OR Plan 07-03 Tasks 5+6 if Pixel acquired in parallel" — correctly captures the parallel-track Phase 7 finishing tail. Not blocking — confirmation of correctness, not a flaw.

---

## Comparison Against Phase 7 07-PLAN-CHECK Baseline (PASS-WITH-NITS)

| Dimension | Phase 7 verdict | Phase 8 verdict | Materially thinner? |
|---|---|---|---|
| Frontmatter completeness (must_haves + verify_items + deferrals + tags) | All present | All present (`verify_items` + `deferrals` + `tags` + `requirements` + `expected_pause_max` + `files_modified`) | NO |
| Task XML shape (`read_first` + `action` + `verify` + `done` + USER-ACTION attestation) | All compliant | All compliant; every task has `<read_first>` with explicit § refs + every `<verify>` has `<automated>` | NO |
| Pitfall coverage | 12/12 | 18/18 (including newly-identified Pitfall 18) | NO — thicker (planner self-identified an additional risk) |
| USER ACTION resume-signal structure | 4 USER ACTIONS all with attestation blocks | 2 USER ACTIONS, both attested; T2 lacks `<resume-signal>` block (NIT 7.1) | Slightly thinner on T2 structure |
| Smoke script population pattern | 5 smoke scripts populated in-task | 4 smoke scripts (1 umbrella + 3 task-specific) populated in-task; cross-language smoke is novel | NO — comparable |
| Credential discipline (ADR-0012) | Applied throughout | Applied throughout + explicit pre-flight check (T1 step 1) BEFORE any keypair generation | NO — thicker (defensive pre-flight is new) |
| Reusable infrastructure honored | REL-02 + Caddy + SOPS + workflow extension | Same 4 + Plan 07-03 AutostartDialog sibling pattern reused | NO |
| Scope discipline | Strict Phase 7 boundary | Strict Phase 8 boundary; 4 deferrals enumerated in frontmatter | NO |

Phase 8 plan is structurally on par with Phase 7. The inline-write provenance has NOT degraded plan quality; the planner identified an additional pitfall (Pitfall 18) and added a defensive pre-flight check that Phase 7 did not have. **PASS-WITH-NITS is the correct verdict.**

---

## Risk Register Sanity Check

The plan's embedded risk register (L1325-1335) covers 7 risks. Cross-check against load-bearing failure modes:

| Risk | Mitigation correct? |
|---|---|
| Cross-language canonical-JSON drift | YES — cross-language smoke fires BEFORE any release tag |
| bundletool re-signs APK | YES — T7 step 6 apksigner verify against keystore SHA-256 |
| `mc share download` parsing fragility | YES — robust regex + Go S3 SDK fallback documented |
| Caddy serves stale manifest | YES — Caddy pass-through (Phase 3 confirmed); 6h client throttle bounds staleness |
| `::add-mask::` regression | YES — pattern matches ADR-0012 fix exactly |
| Tag-trigger not registered on main | YES — cherry-pick step (T4 step 4) mirrors 07-01 `b461ea6` |
| Replay attack | YES — T5 stores `installed_released_at` per CONTEXT D-24 |

All 7 risks have concrete mitigations + are pinned to specific tasks. No missing risk identified during goal-backward walk.

---

## Recommendation

**Proceed to `/gsd-execute-phase 8`.**

The 5 nits above are non-blocking quality-of-life improvements. None block goal achievement. The plan is executable as-written.

Load-bearing gates:
1. **T1 SOPS keypair generation** — must not leak private bytes via shell history or process listing. ADR-0012 discipline rules mechanically present.
2. **T3 cross-language smoke** — Go alphabetical-struct canonical JSON must byte-match JS manual-sort canonical JSON. Smoke catches drift before any release fires.
3. **T4 workflow cherry-pick to main** — tag triggers must fire from `main` registration. Mirrors known-good 07-01 `b461ea6` pattern.
4. **T7 end-to-end pipeline + cert SHA-256 preservation** — apksigner verify must show C6:33:47:6C...:30:D7:BB after bundletool extract. If this fails, Plan 08-01 stays open until cause investigated.

If the executor surfaces any drift during Task 7 (e.g., manifest signature fails on-device, or apksigner shows a different cert), the documented iteration discipline (Plan 07-01 Stage A' precedent) handles the divergence in-plan via beta.6/7/8/... re-tags without re-planning.

---

*Phase: 8-closed-beta-distribution*
*Plan check completed: 2026-05-24 (verdict PASS-WITH-NITS; proceed to execute-phase)*
