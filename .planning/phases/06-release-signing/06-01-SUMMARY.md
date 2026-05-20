# Plan 06-01 — SUMMARY (closeout)

**Plan:** 06-01 (Android keystore + SOPS + recovery RUNBOOK)
**Phase:** 06 — Release signing
**Requirements:** SIGN-01
**Status:** ✅ Complete — Tasks 0-4 done; Tasks 5-6 DEFERRED per ADR-0011 Amendment 4 PM (keystore backup deferred entirely); Task 7 = this closeout
**Commits:** `7f43069`, `9aa5cab`, `0824c9b`, `8201aa2`, `27d4954` (Tasks 0-4 shipped 2026-05-20 in a prior session)

---

## What landed (Tasks 0-4)

### Task 0 — Wave 0 evidence scaffolding (commit `7f43069`)

Pre-execution prereqs created:
- `.planning/phases/06-release-signing/evidence/` directory
- `evidence/tool-versions.txt` — audit trail of `sops` / `yq` / `openssl` / `keytool` / `hdiutil` / macOS versions at execution time
- `evidence/smoke-*.sh` stubs (7 scripts): umbrella `smoke-roundtrip.sh` + per-acceptance `smoke-keystore-generated.sh` + `smoke-sops-roundtrip.sh` + `smoke-sha256-captured.sh` + 3 iOS stubs (`smoke-ios-cert-roundtrip.sh`, `smoke-ios-provprofile.sh`, `smoke-asc-api-key.sh` — populated by Plan 06-02 when iOS work reactivates per ADR-0011 Amendment 3)
- `evidence/recovery-card-template.md` (template kept on disk as preserved artifact for v1.0.1 KEYSTORE-CLOUD-BACKUP promotion)

### Task 1 — SOPS slot skeleton (commit `9aa5cab`)

Created `.secrets/prod/mobile-signing.yaml` as SOPS-encrypted YAML with the schema from CONTEXT D-03:
- `android:` block (skeleton populated by Task 3)
- `ios:` block (skeleton; populated by Plan 06-02 when iOS work reactivates per Amendment 3)
- SOPS recipient = solo dev's age key from `~/.config/sops/age/keys.txt` (CI age key deferred to Phase 7 BUILD-01 per D-14)

### Task 2 — Keystore generation + SHA-256 capture (commit `0824c9b`)

Android release keystore generated via RAM-disk ephemeral procedure (RESEARCH Pitfall 11 — macOS `shred -u` is broken on APFS/SSD; RAM disk evaporates on unmount):
- Format: **PKCS12** (was JKS in CONTEXT D-04; Claude-discretion swap per RESEARCH §4 — keytool default since JDK 9; Android Gradle accepts both)
- Algorithm: RSA 4096
- Validity: 36500 days (100 years; D-06)
- Alias: `runningecosystem-release` (single alias per CONTEXT D-05)
- Passwords: 32-byte random via `openssl rand -base64 32` (CONTEXT D-08)
- SHA-256 fingerprint captured to `evidence/keystore-sha256.txt` in 2 bands (colon-separated `AA:BB:CC:...` + colon-stripped `AABBCC...`) per PATTERNS §4 — unblocks D-19 Mapbox `pk.` token Bundle ID + SHA-256 restriction tightening (deferred Phase 2 item)

### Task 3 — SOPS write + round-trip verify (commit `8201aa2`)

Keystore + passwords written to `.secrets/prod/mobile-signing.yaml` via `sops set --value-file /tmp/b64.txt` syntax (CONTEXT D-15 Claude-discretion swap from shell-piped `sops --set` per RESEARCH §7 — SOPS 3.11+ form avoids `ARG_MAX` + shell-history leak):
- `android.keystore_base64` = base64 of the PKCS12 keystore bytes (~5 KB)
- `android.keystore_password` = the 32-byte random
- `android.key_alias` = `runningecosystem-release`
- `android.key_password` = same as keystore_password (single-alias convention per CONTEXT D-08)

Round-trip verification PASSED via: `sops -d .secrets/prod/mobile-signing.yaml | yq -r '.android.keystore_base64' | base64 -d | keytool -list -keystore /dev/stdin -storepass:env STORE_PASS` produces `runningecosystem-release` with matching SHA-256 fingerprint vs the original capture in `evidence/keystore-sha256.txt`.

### Task 4 — `docs/SECRETS.md §"Mobile signing — recovery"` (commit `27d4954`)

Extended `docs/SECRETS.md` (existing 10-token RUNBOOK from Phase 2) with new section `## Mobile signing — recovery` covering the 4 scenarios from CONTEXT D-15:
- **(a) Age key lost on workstation** → restore from 1Password sealed entry per Phase 2 D-04 → `sops -d` verify
- **(b) Age key lost everywhere** → CATASTROPHIC; documented "what to tell testers" + Phase 2 D-04 1Password sealed redundancy makes simultaneous loss ~0 probability
- **(c) SOPS file corruption** → `git restore .secrets/prod/mobile-signing.yaml` from history
- **(d) iOS distribution cert expires/revoked** → regenerate via Apple Developer portal (deferred along with all iOS work per Amendment 3)

Section follows the Russian-headed playbook template from PATTERNS §3 (matches existing `## Mapbox pk. playbook` structure).

---

## Tasks 5-6 — DEFERRED per ADR-0011 Amendment 4 2026-05-20 PM

Original task plan included:
- **Task 5:** Cloud-sync SOPS bundle + age key to user-chosen cloud (iCloud / Google Drive / Dropbox) + write `RECOVERY-CARD.md` + write `cloud-backup-log.txt`
- **Task 6:** USER ACTION — cross-device sync verification on phone + print + place RECOVERY-CARD.md at home

These tasks were rewritten from a bank-grade 2-USB ceremony to a lean cloud-backup variant in commit `fbde5b1` (ADR-0011 Amendment 2 PM). On dispatch, the executor reached a workstation-state checkpoint: iCloud Drive not configured, OneDrive daemon dormant, Dropbox stale >1 year — cloud-provider choice became a real architectural decision.

**ADR-0011 Amendment 4 PM** then determined that for closed-beta scope (5-10 testers, DM-everyone-reinstall ≈ 30 min recovery from keystore loss), the backup ceremony itself is over-engineered. Single SOPS-encrypted copy on the dev workstation = sufficient. The age key already has Phase 2 D-04 1Password sealed backup, so the load-bearing recovery path stays intact.

**Promotion path:** v1.0.1 `KEYSTORE-CLOUD-BACKUP` backlog row in `.planning/ROADMAP.md`. Triggers (any one):
1. Google Play Store submission begins (Play Store keystore loss = catastrophic at scale)
2. Tester base passes 50 users (DM-everyone doesn't scale)
3. Explicit decision to start treating keystore as production asset

When promoted: un-flag `deferred_tasks: [5, 6]` in `06-01-PLAN.md` frontmatter + un-flag the `<DEFERRED_TASK_NOTICE>` blocks inside Tasks 5+6 + re-run Tasks 5+6 against a live cloud-sync provider. The cloud-backup variant task bodies are preserved in the plan file for direct re-execution; no rewrite needed.

---

## Key files

### Created
- `.secrets/prod/mobile-signing.yaml` — SOPS-encrypted, `android:` populated, `ios:` skeleton (Plan 06-02 deferred per Amendment 3)
- `.planning/phases/06-release-signing/evidence/keystore-sha256.txt` — 2-band fingerprint (D-19 Mapbox restriction unblock)
- `.planning/phases/06-release-signing/evidence/tool-versions.txt` — audit trail
- `.planning/phases/06-release-signing/evidence/smoke-*.sh` × 7 — smoke scripts (Android 4 live, iOS 3 stubs)
- `.planning/phases/06-release-signing/evidence/recovery-card-template.md` — preserved template for v1.0.1 promotion

### Modified
- `docs/SECRETS.md` — new section `## Mobile signing — recovery` (4 scenarios)

### NOT created (deferred per Amendment 4)
- `.planning/phases/06-release-signing/evidence/RECOVERY-CARD.md` — was Task 5 output; deferred
- `.planning/phases/06-release-signing/evidence/cloud-backup-log.txt` — was Task 5 output; deferred
- Any cloud-folder copies of `mobile-signing.yaml` / `age-keys.txt` — was Task 5 output; deferred

---

## Acceptance vs `must_haves.truths`

| Must-have | Status | Evidence |
|---|---|---|
| Android release keystore generated offline, RSA 4096, validity ≥ 36500 days, alias `runningecosystem-release` | ✅ | `evidence/keystore-sha256.txt` + `keytool -list` round-trip in Task 3 |
| Plaintext keystore exists on disk for <30 seconds (RAM disk) | ✅ | RAM-disk procedure in Task 2 commit `0824c9b` |
| Encrypted keystore in `.secrets/prod/mobile-signing.yaml` (SOPS, base64-in-YAML); git history clean | ✅ | `git log --diff-filter=A` against the yaml shows only SOPS-encrypted form; no plaintext keystore in history |
| Round-trip `sops -d \| yq -r \| base64 -d \| keytool -list` produces alias with matching SHA-256 | ✅ | Task 3 commit body documents the round-trip; passes at SUMMARY-time re-verification |
| SHA-256 captured to `evidence/keystore-sha256.txt` (2 bands) | ✅ | `evidence/keystore-sha256.txt` exists, contains both formats |
| `docs/SECRETS.md` has `## Mobile signing — recovery` section (4 scenarios per D-15) | ✅ | commit `27d4954` |
| ~~One encrypted cloud backup of mobile-signing.yaml + age key~~ | 🛑 DEFERRED | Per ADR-0011 Amendment 4 PM; v1.0.1 `KEYSTORE-CLOUD-BACKUP` |
| ~~Single printed RECOVERY-CARD.md at home~~ | 🛑 DEFERRED | Per ADR-0011 Amendment 4 PM |
| ~~Cloud backup sync verified on second device~~ | 🛑 DEFERRED | Per ADR-0011 Amendment 4 PM |

7 of 9 must-haves PASS. 2 deferred with structured promotion path.

---

## Acceptance vs ROADMAP §"Phase 6" success criteria

ROADMAP criteria 1-4 covered by Plan 06-01; criteria 5-9 were iOS-side (Plan 06-02 — deferred per Amendment 3). For closed-beta Android-only scope:

| ROADMAP criterion | Status |
|---|---|
| 1. Android keystore generated offline, single workstation, deleted from disk after encryption | ✅ |
| 2. Encrypted keystore committed (SOPS); git history clean | ✅ |
| 3. ~~Two offline physical backups in separate physical locations~~ | 🛑 REWRITTEN by Amendment 4: "single SOPS copy on dev workstation = sufficient for closed beta" |
| 4. Recovery playbook in `docs/SECRETS.md` | ✅ |
| 5-9. iOS Apple Dev + cert + provisioning + ASC API + EAS-managed-creds decision | 🛑 DEFERRED per ADR-0011 Amendment 3 (Android-first launch); Plan 06-02 stays on disk for re-trigger |

---

## Deviations from plan (documented)

1. **Task 5+6 not executed** — per ADR-0011 Amendment 4 PM. Plan file body for Tasks 5+6 stays in place as preserved-but-deferred content; promotion = un-flag `deferred_tasks` + run as-is.
2. **`must_haves.truths` final 3 lines** (cloud backup + RECOVERY-CARD + second-device verify) marked DEFERRED with strikethrough — see edited Plan 06-01 frontmatter at commit time of this SUMMARY.
3. **CONTEXT D-04** (`-storetype JKS`) → executed as `-storetype PKCS12` per RESEARCH §4 Claude-discretion swap. No functional difference for Android Gradle.
4. **CONTEXT D-07** (2 USBs at ≥5 km) → was rewritten to cloud backup per Amendment 2 PM → now FULLY SUPERSEDED per Amendment 4 PM.
5. **CONTEXT D-15(d)** (sops --set shell-piped) → executed as `sops set --value-file` per RESEARCH §7 Claude-discretion swap.
6. **CONTEXT D-04** `shred -u /tmp/...` → executed as RAM-disk-via-`hdiutil ram://` per RESEARCH Pitfall 11.

---

## Next: Phase 7

Plan 06-01 closes Phase 6 (since Plan 06-02 is deferred per Amendment 3). Per `.planning/ROADMAP.md` strict order: Phase 7 = **Release builds + mobile stability** (`mobile-shared` workstream).

- Plan 07-01 (EAS Android production profile + R8/ProGuard + arm64-v8a only)
- Plan 07-03 (Background reliability — Android foreground service + MIUI + One UI mitigations + 1h Pixel pocket-walk)
- Plan 07-02 (EAS iOS production) DEFERRED per ADR-0011 Amendment 3

Phase 7 will need to address the deferred CI age-key issue (Plan 06-01 D-14-CI-AGE-KEY deferral) — GitHub Actions consuming `.secrets/prod/mobile-signing.yaml` for EAS Android builds requires a CI age recipient added to `.sops.yaml` via `sops updatekeys`.

Resume via `/gsd-discuss-phase 7`.

---

## Self-Check: PASSED

- [x] Tasks 0-4 verified shipped via smoke probes (SOPS round-trip + SHA-256 present + docs/SECRETS.md section grep + working tree clean)
- [x] Tasks 5-6 marked DEFERRED in plan frontmatter (`deferred_tasks: [5, 6]`) + inline `<DEFERRED_TASK_NOTICE>` blocks
- [x] SUMMARY.md captures: what landed + what's deferred + promotion path + deviations + next phase
- [x] ROADMAP Phase 6 flipped to `[x] DONE`; SIGN-01 trace = Complete
- [x] PROJECT.md Phase 6 row checked off
- [x] STATE.md reflects Phase 6 closed, Phase 7 next
- [x] ADR-0011 Amendment 4 documents the rationale + promotion triggers
