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
| 06-01-05 | 01 | 1 | SIGN-01 | **DEFERRED per ADR-0011 Amendment 4 (keystore backup deferred entirely).** Task 5 (cloud-sync SOPS bundle + RECOVERY-CARD.md) not executed in v1.0; promotion gated on v1.0.1 `KEYSTORE-CLOUD-BACKUP` triggers (Play Store / >50 users / explicit production-asset decision). | manual | (no execution this milestone) | n/a | 🛑 deferred |
| 06-01-06 | 01 | 1 | SIGN-01 | **DEFERRED per ADR-0011 Amendment 4.** Task 6 USER ACTION (cross-device sync verify + place RECOVERY-CARD) not executed in v1.0. | manual | (no execution this milestone) | n/a | 🛑 deferred |
| 06-02-* | 02 | 2 | SIGN-02 | **DEFERRED per ADR-0011 Amendment 3 (Android-first launch).** All Plan 06-02 tasks (Apple Dev enrollment + App ID + cert + provisioning profile + ASC API key) remain on disk but not executed in this milestone. Re-trigger: Android beta stabilizes OR explicit user decision to start iOS. | manual | (no execution this milestone) | n/a | 🛑 deferred |

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
| Cloud-sync second-device verification + RECOVERY-CARD.md printed + placed at home | SIGN-01 | Cannot be automated — agent cannot open phone, print paper, or place documents | User confirms via 5-line attestation block in resume-signal at Plan 06-01 Task 6; agent records into `evidence/cloud-backup-log.txt` + `06-01-SUMMARY.md`. Phase 6 closes on Plan 06-01 only (Plan 06-02 deferred per ADR-0011 Amendment 3). |
| ~~Apple Developer Program enrollment~~ | ~~SIGN-02~~ | **DEFERRED per ADR-0011 Amendment 3 (Android-first launch).** Re-trigger: Android beta stabilizes OR explicit user decision. | n/a (deferred) |
| ~~ASC API key creation~~ | ~~SIGN-02~~ | **DEFERRED per ADR-0011 Amendment 3.** | n/a (deferred) |
| ~~iOS distribution cert .p12 export from Keychain Access~~ | ~~SIGN-02~~ | **DEFERRED per ADR-0011 Amendment 3.** | n/a (deferred) |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify (smoke command) or Wave 0 dependency (script not-yet-created)
- [ ] Sampling continuity: no 3 consecutive tasks without smoke verify (Phase 6 has ~9 tasks total across 2 plans — should be easy)
- [ ] Wave 0 covers all MISSING references (`yq`, smoke scripts, evidence/ dir)
- [ ] No watch-mode flags (no test runner watch — this is operational)
- [ ] Feedback latency < 15s per smoke command
- [ ] `nyquist_compliant: true` set in frontmatter — flipped by planner once plans are written + smoke scripts exist

**Approval:** pending (planner writes plans → fills in remaining smoke commands → flips compliant flag)
