# Phase 6 — Plan Check Report

**Checked:** 2026-05-20
**Plans verified:** `06-01-PLAN.md` (Android keystore, Wave 1) + `06-02-PLAN.md` (iOS Apple Dev, Wave 2)
**Methodology:** goal-backward against ROADMAP §"Phase 6" 9 success criteria + REQUIREMENTS.md §SIGN-01..02 + 06-CONTEXT.md 22 D-NN + 06-RESEARCH.md 15 pitfalls + 5 open questions + 3 Claude-discretion swaps + 06-VALIDATION.md per-task map + 06-PATTERNS.md analogs

---

## Verdict Summary

| Dim | Name | Verdict | Notes |
|-----|------|---------|-------|
| 1 | Goal coverage (9 ROADMAP + SIGN-01..02) | PASS | All 9 success criteria map to tasks; 4→06-01 / 5→06-02 split is clean; scope boundary respected (Phase 7/8 deferrals D-20/21/22 explicit) |
| 2 | Dependencies + ordering | PASS | `06-02 depends_on: [06-01]` (D-16); both `autonomous: false` (D-17); Wave 0 prereqs are real tasks (`06-01 Task 0` creates 7 stubs + `tool-versions.txt` + `recovery-card-template.md`); umbrella smoke explicitly pending until Wave 2 completes (exits 2 at end of 06-01, exits 0 only at 06-02 Task 6) |
| 3 | Task quality (anti-shallow) | PASS | Every task has `<read_first>` with line-anchored file refs; every `<verify>` has runnable `<automated>` command (no MISSING); `<action>` blocks contain concrete bash with identifiers (paths/aliases/flags); USER ACTION tasks have `<acceptance_criteria>` with regex format checks |
| 4 | RESEARCH swap application | PASS | All 4 swaps applied + documented in both plans' `<claude_discretion_swaps>` blocks: (1) PKCS12 not JKS (06-01 Task 2 `-storetype PKCS12`); (2) encrypted DMG via hdiutil not VeraCrypt (06-01 Task 5 + Task 4 doc forbids the word "VeraCrypt"); (3) `sops set --value-file` for ALL binary writes (06-01 Task 3, 06-02 Tasks 2/3/4); (4) RAM disk via `hdiutil ram://`, NOT `shred -u` (06-01 Task 2 + 06-02 Tasks 2/3/4) |
| 5 | Open questions resolution | PASS | Q1 deferred to Phase 7 (frontmatter `<deferrals>` in BOTH plans cite `D-14-CI-AGE-KEY`); Q2 same DMG password (06-01 Task 5 single openssl rand); Q3 USER ACTION resume-signal (06-01 Task 6 step 6); Q4 personal Apple ID (06-02 `<claude_discretion_swaps>` swap 4); Q5 full bash cheat-sheet (06-01 Task 0 step 4 recovery-card-template.md) |
| 6 | Apple SLA + USER ACTION encoding | PASS | `06-02 expected_pause_max: "7 weeks"` + `expected_pause_reason` block explicit; 06-01 Task 6 attestation pattern mirrors PATTERNS §5 Analog C (5-line resume-signal block); 06-02 Task 0 captures Team ID with `^[A-Z0-9]{10}$` regex check |
| 7 | Side-file + Mapbox unblock | PASS | 06-01 Task 2 produces `evidence/keystore-sha256.txt` in 2 bands (colon + bare hex) per PATTERNS §4; D-19 follow-up explicitly labeled `/gsd-fast mapbox-restrict` (NOT Phase 6 scope); no preemptive Mapbox dashboard mutation |
| 8 | Validation continuity (Nyquist) | PASS | 8e VALIDATION.md exists; 8a every task has `<automated>` (no MISSING — Wave 0 stubs explicitly exit 2 with reason); 8b commands run in <15s (per VALIDATION.md); 8c no 3 consecutive tasks without smoke (each task has its own smoke or commits to umbrella); 8d Wave 0 covers all 7 smoke stubs + tool-versions + recovery-card-template |
| 9 | Quality-gate completeness | PASS-WITH-NITS | 12 quality items satisfied; `must_haves` cover all 9 criteria (4 in 06-01 truths + 5 in 06-02 truths); commits use `feat(06-01):` / `feat(06-02):` / `docs(06-01):` / `chore(06-01):` style per PATTERNS §C — NIT: 06-01 Task 0 commit uses `chore(06-01):` which is correct for scaffolding but worth flagging that the umbrella scheme is consistent |
| 10 | RUNBOOK extension fidelity | PASS | 06-01 Task 4 follows PATTERNS §3 Russian-headed template; all 4 D-15 scenarios (a/b/c/d) present with `### Сценарий (a)` to `(d)` exact heading shape; `docs/SECRETS.md` inventory table extended (10→11 token types); 06-02 Task 5 §"iOS signing" cross-refs §"Mobile signing — recovery"; EAS-vs-fastlane decision documented per D-18 with 3-row alternatives table |

**Overall verdict:** **PASS-WITH-NITS** — proceed to `/gsd-execute-phase 6`.

---

## Detailed Findings

### Goal Coverage Table (Dim 1)

| ROADMAP §6 criterion | Covered by | Smoke |
|---|---|---|
| 1. Keystore generated offline (single workstation, deleted from disk after encryption) | 06-01 Task 2 (RAM-disk = "offline" wrt SSD) + Task 3 (RAM-disk teardown step 8) | `smoke-keystore-generated.sh` |
| 2. Encrypted in `.secrets/...` + git history clean | 06-01 Task 1 (skeleton) + Task 3 (SOPS write); plaintext NEVER outside RAM disk per threat T-06-04 | `smoke-sops-roundtrip.sh` |
| 3. Two offline physical backups, separate locations | 06-01 Task 5 (DMG creation) + Task 6 (physical placement USER ACTION) | manual attestation (`backup-prep-log.txt`) |
| 4. Recovery playbook in `docs/SECRETS.md` §"Mobile signing — recovery" | 06-01 Task 4 (4 scenarios per D-15) | `grep -c '## Mobile signing — recovery'` |
| 5. Apple Developer Program enrolled | 06-02 Task 0 (USER ACTION, 7-week SLA) | `apple-team-id.txt` (manual) |
| 6. Distribution cert generated; private key in SOPS | 06-02 Task 2 (.p12 + RAM disk + set --value-file) | `smoke-ios-cert-roundtrip.sh` |
| 7. App Store provisioning profile for bundle ID | 06-02 Task 3 (App Store type per D-13) | `smoke-ios-provprofile.sh` (asserts absence of `ProvisionedDevices` = App Store) |
| 8. ASC API key (P8) in SOPS for unattended TestFlight | 06-02 Task 4 (App Manager role per D-11) | `smoke-asc-api-key.sh` |
| 9. EAS-managed vs fastlane-Match decision in `docs/SECRETS.md §iOS signing` | 06-02 Task 5 (3-row alternatives table; D-10 + D-18) | `grep -c 'Fastlane Match'` + `'EAS Cloud-managed'` |

All 9 criteria have explicit task + smoke (or manual attestation for the 2 USER ACTIONS).

### Pitfall Application Audit (Dim 4 + Threat Model)

| Pitfall | Where applied | Status |
|---|---|---|
| #4 .p12 export password discipline | 06-02 Task 2 step 3 — generates explicit 32-byte BEFORE Keychain prompt | OK |
| #11 macOS shred ineffective on APFS | 06-01 swap 4 (RAM disk for keystore) + 06-02 Tasks 2/3/4 (RAM disk for each binary write) + 06-01 Task 4 doc note "shred ineffective" | OK |
| #12 CI age-key carry-over | Both plans `<deferrals>` block reference `D-14-CI-AGE-KEY` + scope=Phase 7 explicitly | OK |
| #14 App Manager API-key vs user-role distinction | 06-02 Task 4 prompt cites Pitfall 14 + D-11 explicitly | OK |
| #15 .p8 one-shot download | 06-02 Task 4 step 1 sequence: capture IDs → RAM disk → SOPS write → round-trip → THEN tell user safe to Trash; threat T-06-13 mitigation | OK |
| #1 Apple SLA degradation | 06-02 frontmatter `expected_pause_max: "7 weeks"` | OK |
| #9 USB 3-year refresh | 06-01 Task 7 SUMMARY pending follow-up + 06-02 Task 6 pending follow-up | OK |
| #10 Apple ID ownership stability | 06-02 Task 0 step 1 acceptance: "Long-term controlled (NOT throwaway)" | OK |

### Critical Concerns (Nits, Non-Blocking)

**NIT-1 — 06-01 Task 2 step 4 default `-dname` placeholders.** Step 4 default is `L=Unknown, ST=Unknown, C=US` if user not prompted. This is a 100-year-locked field — if user wants a real city/state/country, it must be set BEFORE keytool runs (cannot edit after, only re-issue keystore which is fatal). Recommendation: planner adds a tiny pre-Task-2 inline confirmation prompt for the 3 `-dname` placeholder values. Non-blocking because the keystore still functions with `Unknown/Unknown/US`, but cosmetically odd if Google Play Store later asks (unlikely for closed beta).

**NIT-2 — 06-01 Task 5 USB-A/USB-B mount auto-detection.** Step 1 falls back to env var `USB_A_PATH=/Volumes/USB-A` or pauses. The "or pauses" is loosely specified — executor may not know how to surface that prompt in autonomous mode. Recommendation: clarify in <action> step 1 that if `USB_A_PATH` is unset, executor prints `MOUNT USB-A NOW + paste mount path:` and reads from stdin. Non-blocking because Task 5 is already implicitly a USER ACTION (the <action> opens by saying "Pre-req: User has inserted USB-A").

**NIT-3 — 06-02 Task 1 step 4 App ID registration step is embedded in an `auto` task.** The registration is GUI-driven ("Open developer.apple.com/account/resources/identifiers/list, click +, ...") and the task waits for user input "registered" before proceeding. This is OK per PATTERNS §5 Analog B (multi-USER-ACTION sandwich) but blurs the `<task type="auto">` vs `<task type="checkpoint:human-action">` distinction. Recommendation: leave as-is (the inline-confirmation pattern is precedented in 02-04 Task 4), but note that 06-02 has effectively 3-4 USER ACTION-style pauses inside `auto` tasks (Tasks 1/2/3/4 each have at least one "Type X to continue" gate). The total wall-clock for Plan 06-02 (excluding Apple's 7-week SLA) is dominated by user-portal clicks, not automation.

**NIT-4 — Phase 6 produces 7 atomic commits per plan; 06-01 says "6 atomic commits 0/1/2/3/4/5 + this closeout = 7" in `<success_criteria>` but `<output>` says "Atomic per-task commits: 7 commits total" (matches). 06-02 says 6 commits (Tasks 1-5 + closeout; Task 0 is USER ACTION no-commit). Both internally consistent. Cross-checked the per-task `<done>` commit messages — all 7 (06-01) + 6 (06-02) commit messages spelled out verbatim. OK.

**NIT-5 — Plan filename convention.** PATTERNS §D recommends `06-01-PLAN-android-keystore.md` + `06-02-PLAN-ios-cert-and-asc.md` (descriptor form per Phase 2). Actual files are `06-01-PLAN.md` + `06-02-PLAN.md` (Phase 5 short form). Both forms are accepted per PATTERNS §D ("planner choice — both forms accepted"). Non-issue.

### Anti-Pattern Checks (None Found)

- ✗ No `shred -u` in primary action paths (only in Task 4 RUNBOOK as a "fallback only" note explicitly labeled ineffective)
- ✗ No `-storetype JKS` anywhere (PKCS12 used uniformly)
- ✗ No `VeraCrypt` mention in `docs/SECRETS.md` extension (Task 4 step 1 explicitly forbids the word; verified by `<automated>` grep -ci 'veracrypt' ≤ 0)
- ✗ No EAS Cloud-managed credentials used (D-10 self-managed; EAS Cloud labeled "v1.0.1 escape hatch only" in Task 5 alternatives table)
- ✗ No premature Mapbox dashboard mutation (D-19 follow-up explicitly labeled `/gsd-fast mapbox-restrict`)
- ✗ No CI age-key added in Phase 6 (D-14 deferred to Phase 7 per `<deferrals>` block in both plans)

### Dependency Graph

```
06-01 (Wave 1, depends_on: [])
  ├─ Task 0: Wave 0 evidence/ scaffolding (auto)
  ├─ Task 1: SOPS skeleton (auto)
  ├─ Task 2: keystore-generate on RAM disk (auto)
  ├─ Task 3: SOPS write + round-trip (auto)
  ├─ Task 4: docs/SECRETS.md recovery section (auto)
  ├─ Task 5: 2× encrypted-DMG USB creation (auto, soft USER ACTION for USB mounting)
  ├─ Task 6: USER ACTION physical placement (checkpoint:human-action, blocking)
  └─ Task 7: 06-01-SUMMARY.md + ROADMAP closeout (auto)

06-02 (Wave 2, depends_on: [06-01])
  ├─ Task 0: USER ACTION Apple enrollment + Team ID (checkpoint:human-action, blocking, ~7-week pause)
  ├─ Task 1: SOPS team_id + App ID register (auto)
  ├─ Task 2: Apple Distribution cert + .p12 → SOPS (auto)
  ├─ Task 3: Provisioning profile → SOPS (auto)
  ├─ Task 4: ASC API key → SOPS (auto)
  ├─ Task 5: docs/SECRETS.md §"iOS signing" (auto)
  └─ Task 6: umbrella smoke + 06-02-SUMMARY + Phase 6 closeout (auto)
```

Linear, acyclic, no forward references. Strict serial 06-01→06-02 per D-16.

### Files Modified (Cross-Plan)

| File | 06-01 | 06-02 | Conflict risk |
|---|---|---|---|
| `.secrets/prod/mobile-signing.yaml` | Tasks 1/3 (android.* + ios.* placeholders) | Tasks 1/2/3/4 (ios.* fields filled) | NONE — 06-01 writes only `android.*` + `TBD-plan-06-02` placeholders; 06-02 overwrites only `ios.*` fields. Strict serial guarantees no race. |
| `docs/SECRETS.md` | Task 4 (§"Mobile signing — recovery" + inventory row 11) | Task 5 (§"iOS signing") | NONE — distinct sections appended; inventory row 11 updated once in 06-01, cross-referenced in 06-02. |
| `evidence/smoke-*.sh` | Tasks 0/2/3 (3 Android scripts) | Tasks 2/3/4 (3 iOS scripts) | NONE — disjoint file set; umbrella `smoke-roundtrip.sh` written by 06-01 Task 3, exits 2 until 06-02 Task 6. |

### Manual-Only Verifications (Per 06-VALIDATION.md)

| Verification | Encoded as | Acceptance |
|---|---|---|
| 2× USB physical placement | 06-01 Task 6 USER ACTION resume-signal | 2 distinct "placed at:" lines + 1Password sealed entry confirmation |
| Apple Developer enrollment | 06-02 Task 0 USER ACTION resume-signal | Team ID matches `^[A-Z0-9]{10}$` + date parses |
| ASC API key one-shot download | 06-02 Task 4 inline (Pitfall 15 sequence: capture IDs → SOPS write → THEN safe-to-Trash signal) | Round-trip smoke green BEFORE user told to delete |
| .p12 Keychain export with explicit password | 06-02 Task 2 step 3 (generates pass first, then prompts) | Round-trip `openssl pkcs12 -info` MAC verified OK |

All 4 manual verifications encoded with appropriate gate type.

---

## Recommendation

Proceed to `/gsd-execute-phase 6`.

**Pre-execution checklist for the executor:**

1. Verify `which yq sops keytool openssl hdiutil base64 security plutil` returns paths for all 8 tools (Wave 0 will fail-fast if not — 06-01 Task 0 step 2 has the inline guard).
2. Have 2 physical USB sticks ready (≥1 GB each, exFAT or unformatted) before Plan 06-01 starts.
3. Be prepared for ~7-week wall-clock pause between 06-01 close + 06-02 Task 1 resume (Apple's actual 2026 enrollment SLA per RESEARCH §1).
4. Confirm 1Password (or equivalent password manager) is available — Plan creates 3 sealed entries during execution:
   - "Sport mobile signing — USB DMG password" (06-01 Task 5)
   - "Sport mobile signing — iOS .p12 export password" (06-02 Task 2)
   - "Sport Apple ID — dev account" (06-02 Task 0)
5. Have a printer + laminator ready (or planned visit to FedEx Office) for 2 recovery cards (06-01 Task 6).

**NITs are non-blocking** — execution can proceed. Planner may optionally address NIT-1 (`-dname` placeholders) by adding 1 inline prompt before 06-01 Task 2 step 4, but the plan is shippable as-is.
