---
phase: 06
slug: release-signing
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-20
---

# Phase 06 — Validation Strategy

> **Phase 6 is operational/secret-management, not code-shipping.** Traditional unit-test coverage does not apply. Validation = round-trip verification + RUNBOOK execution + side-file diff. See `06-RESEARCH.md §"Validation Architecture"` for the full rationale.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | bash smoke scripts + `sops`/`yq`/`keytool`/`openssl` CLI verifications (no pytest/jest — no Go/TS code shipped) |
| **Config file** | `.sops.yaml` (existing from Phase 2); no new test config |
| **Quick run command** | `bash .planning/phases/06-release-signing/evidence/smoke-roundtrip.sh` (Wave 0 creates this) |
| **Full suite command** | same as quick — Phase 6 has no separate full vs quick split (operational verification is monolithic) |
| **Estimated runtime** | ~5-15 seconds (SOPS decrypt + base64 round-trip + keytool list + openssl x509 inspect) |

---

## Sampling Rate

- **After every task commit:** Run `bash .planning/phases/06-release-signing/evidence/smoke-roundtrip.sh` — exits 0 only if `.secrets/prod/mobile-signing.yaml` decrypts cleanly + every claimed field round-trips through base64 + keystore extracts to a valid JKS/PKCS12.
- **After Wave 1 + Wave 2 complete:** Run the SUMMARY-time recovery drill — actually restore from one of the VeraCrypt USBs to a temp directory + verify recovered material matches committed SOPS encrypted form (D-15 scenario (a) test).
- **Before `/gsd-verify-work`:** Both Wave 1 + Wave 2 smoke-roundtrip green; both USB backups physically confirmed placed + readable at home + offsite location.
- **Max feedback latency:** ~15 seconds per task commit.

---

## Per-Task Verification Map

> Plans 06-01 + 06-02 do not exist yet. Planner populates this table during plan generation; each task gets a row mapping its acceptance criterion to a smoke command. Pattern:

| Task ID | Plan | Wave | Requirement | Smoke Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|----------------|-----------|-------------------|-------------|--------|
| 06-01-01 | 01 | 1 | SIGN-01 | `keytool -list -keystore /tmp/<keystore>.jks` returns 1 alias `runningecosystem-release` with RSA 4096 + validity ≥ 2125 | smoke | `bash evidence/smoke-keystore-generated.sh` | ❌ W0 | ⬜ pending |
| 06-01-02 | 01 | 1 | SIGN-01 | `sops -d .secrets/prod/mobile-signing.yaml \| yq -r .android.keystore_base64 \| base64 -d \| keytool -list -keystore /dev/stdin` round-trips clean | smoke | `bash evidence/smoke-sops-roundtrip.sh` | ❌ W0 | ⬜ pending |
| 06-01-03 | 01 | 1 | SIGN-01 | `keytool -list -v -keystore <recovered>.jks \| grep SHA256:` produces colon-separated 32-byte fingerprint + a copy in `evidence/keystore-sha256.txt` for downstream Mapbox/Phase 8 consumption | smoke | `bash evidence/smoke-sha256-captured.sh` | ❌ W0 | ⬜ pending |
| 06-01-N | 01 | 1 | SIGN-01 | USER ACTION — 2× USB backups placed at 2 separate physical locations, both VeraCrypt/encrypted-DMG volumes mounted successfully + reads back keystore field byte-for-byte identical to committed SOPS form | manual | (USER ATTESTATION recorded in 06-01-SUMMARY) | ❌ W0 | ⬜ pending |
| 06-02-00 | 02 | 2 | SIGN-02 | USER ACTION — Apple Developer Program enrollment complete (Individual, $99/yr); Apple Team ID captured (10-char alphanumeric) | manual | (USER ATTESTATION) | ❌ W0 | ⬜ pending |
| 06-02-01 | 02 | 2 | SIGN-02 | App ID registered at developer.apple.com for `com.runningecosystem.mobile`; distribution cert generated; `.p12` exported with explicit password; round-trips via `openssl pkcs12 -in <recovered>.p12 -info -password pass:<env>` | smoke | `bash evidence/smoke-ios-cert-roundtrip.sh` | ❌ W0 | ⬜ pending |
| 06-02-02 | 02 | 2 | SIGN-02 | App Store provisioning profile generated for bundle ID; `.mobileprovision` UUID matches the field captured in SOPS slot | smoke | `bash evidence/smoke-ios-provprofile.sh` | ❌ W0 | ⬜ pending |
| 06-02-03 | 02 | 2 | SIGN-02 | ASC API key created with **App Manager** role; `AuthKey_XXXXX.p8` + Key ID + Issuer ID captured in SOPS; round-trip extracts to valid `.p8` via base64 -d + `openssl ec -in <recovered>.p8 -text -noout` parses successfully | smoke | `bash evidence/smoke-asc-api-key.sh` | ❌ W0 | ⬜ pending |
| 06-02-04 | 02 | 2 | SIGN-02 | `docs/SECRETS.md §"Mobile signing — recovery"` section exists + covers 4 scenarios from CONTEXT D-15 (USB restore, catastrophic loss, corruption, iOS cert expiry) | smoke | `grep -c "Scenario" docs/SECRETS.md` ≥ 4 in the new section | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Wave 0 = environment prerequisites before Plan 06-01 / 06-02 tasks can execute. Per RESEARCH §0:

- [ ] `yq` installed (`brew install yq` — 4.x for SOPS-decoded YAML extraction)
- [ ] `sops` version ≥ 3.11 (`sops --version` — `set --value-file` syntax requires this; current local is `3.13.1` per researcher, confirms ≥ 3.11)
- [ ] `keytool` available (JDK 17+ — comes with Apple silicon Java; `keytool -help` succeeds)
- [ ] `openssl` ≥ 3.0 (`openssl version` — for `.p12` + `.p8` round-trip verification)
- [ ] `hdiutil` available (macOS-native; `hdiutil help` succeeds — for RAM-disk pattern replacing broken `shred -u` per RESEARCH Pitfall 11)
- [ ] `.planning/phases/06-release-signing/evidence/` directory created
- [ ] 2× empty USB sticks (or 2× exFAT-formatted partitions on existing drives) prepared for encrypted-DMG copy; physical locations TBD by USER ACTION at Plan 06-01 final task
- [ ] Stub smoke scripts created in `evidence/` so the per-task verification map above resolves at planner time

*If none of the smoke scripts exist yet at planner-spawn time, the planner is expected to add Wave 0 tasks creating them as the first action in each plan.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 2× USB physical backups placed in 2 separate physical locations | SIGN-01 | Cannot be automated — agent cannot drive to your parents' house | User confirms each location in 06-01-SUMMARY §"Backup placement attestation"; agent does NOT proceed to Wave 2 until both attestations recorded |
| Apple Developer Program enrollment complete | SIGN-02 | Apple verification can take 2-7+ weeks per RESEARCH §1 (degraded SLA 2026); requires Apple ID + government ID + 2FA + Apple Developer app on physical iPhone for biometric attestation | User updates STATE.md `stopped_at` with enrollment completion date + Team ID; Plan 06-02 Tasks 1-4 are blocked until then |
| ASC API key creation (the `.p8` download is one-time-only — Apple never re-shows it) | SIGN-02 | Manual download from `appstoreconnect.apple.com/access/api`; missed download = create new key + redo SOPS write | User confirms `AuthKey_<keyid>.p8` downloaded + base64-encoded into SOPS before closing the ASC tab |
| iOS distribution cert .p12 export from Keychain Access | SIGN-02 | macOS Keychain doesn't accept `--password` CLI flag for export; export password is set via UI dialog | User runs Keychain Access → Distribution cert right-click → Export → set explicit password (NOT default) → save .p12; capture password into SOPS field `ios.distribution_cert_password` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify (smoke command) or Wave 0 dependency (script not-yet-created)
- [ ] Sampling continuity: no 3 consecutive tasks without smoke verify (Phase 6 has ~9 tasks total across 2 plans — should be easy)
- [ ] Wave 0 covers all MISSING references (`yq`, smoke scripts, evidence/ dir)
- [ ] No watch-mode flags (no test runner watch — this is operational)
- [ ] Feedback latency < 15s per smoke command
- [ ] `nyquist_compliant: true` set in frontmatter — flipped by planner once plans are written + smoke scripts exist

**Approval:** pending (planner writes plans → fills in remaining smoke commands → flips compliant flag)
