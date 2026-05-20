# Phase 6: Release signing - Discussion Log

**Date:** 2026-05-20
**Mode:** Autonomous (per standing instruction `feedback_autonomous_discuss_mode` — no AskUserQuestion; orchestrator selected recommended defaults from prior-phase patterns + closed-beta lean scope per ADR-0011)

> Audit trail for human review. Not consumed by downstream agents — see `06-CONTEXT.md` for the canonical decisions.

---

## Gray areas identified

The phase has 4 broad implementation-decision clusters. None of them were re-asked (no AskUserQuestion calls); each was resolved autonomously by mapping to an existing prior-phase pattern or applying the closed-beta scope-reduction principle from ADR-0011.

### Cluster 1 — SOPS layout + encoding for mobile signing

**Q1: One SOPS slot or two (Android vs iOS split)?**
- Options considered: (a) single `.secrets/prod/mobile-signing.yaml` bundling both platforms; (b) split `.secrets/prod/android-signing.yaml` + `.secrets/prod/ios-signing.yaml`
- Selected: **(a) single file** — D-01
- Why: closed-beta = single signing bundle managed together; Phase 6 ships them as a unit; splitting doubles file count for no rotation-cycle independence benefit (Apple cert renews annually independent of Android keystore, but the Apple renewal flow updates only `ios:` fields — YAML structure handles that cleanly)

**Q2: Binary encoding inside SOPS — base64 in YAML field vs `--input-type binary` per-file?**
- Options considered: (a) base64-encoded inside YAML field; (b) `sops --encrypt --input-type binary` on the raw keystore file (separate `.sops.binary` files); (c) git-crypt instead of SOPS
- Selected: **(a) base64 in YAML field** — D-02, D-03
- Why: matches Phase 2 D-02 pattern (`.secrets/<env>/<group>.yaml`); diff-able; `sops --set` works for non-binary fields (passwords + IDs) without re-encoding the binary; CI extraction is one `yq` + `base64 -d` away. Binary file mode would require parallel file management. git-crypt rejected (deviates from Phase 2 D-01 age-over-everything decision).

**Q3: dev/staging slot needed?**
- Options considered: (a) prod-only; (b) prod + staging + dev for symmetry with existing `.secrets/<env>/` layout
- Selected: **(a) prod-only** — D-01
- Why: EAS dev + preview profiles use Expo's automatic debug keystore (non-secret, regenerable per-machine). Staging mobile build is not a closed-beta scope item. Empty dev/staging signing files are dead weight.

### Cluster 2 — Android keystore lifecycle

**Q4: Keystore generation environment — air-gapped vs solo workstation one-shot?**
- Options considered: (a) air-gapped Raspberry Pi / old laptop, never networked; (b) solo workstation, generate-encrypt-shred sequence
- Selected: **(b) workstation one-shot** — D-04
- Why: closed-beta blast radius = 5-10 friend testers; air-gapped machine = funded-team paranoia + extra hardware. The bigger operational risk is friction discouraging the solo dev from doing the work at all. Plaintext keystore touches disk for ~30 seconds; `shred -u` mitigates magnetic disk residue (acceptable threat model).

**Q5: Keystore alias — single vs multi (e.g., release + upload key for Play App Signing)?**
- Options considered: (a) single `runningecosystem-release` alias; (b) split release alias + upload key (Play App Signing pattern)
- Selected: **(a) single alias** — D-05
- Why: Play App Signing requires Google to hold the release key (rejected per D-10 self-managed pattern + ADR-0011 closed-beta no-Google-distribution policy). Closed-beta uses self-hosted Caddy manifest, not Play Store. Single alias = simpler ProGuard config in Phase 7.

**Q6: Validity period — Android best-practice 25 / 50 / 100 years?**
- Options considered: 25y (Android Studio default minimum for Play Store), 50y, 100y
- Selected: **100 years** — D-06
- Why: Android forces signed-by-same-key forever; premature expiry = every existing install dies + cannot update. 100y is the de-facto industry standard (longer than projected lifetime of Android OS).

**Q7: Backup medium — VeraCrypt USB vs paper QR vs hardware-encrypted drive?**
- Options considered: (a) 2× VeraCrypt-encrypted standard USB sticks; (b) 2× hardware-encrypted USB (Kingston DT 50, Apricorn); (c) printed paper QR codes
- Selected: **(a) VeraCrypt USB** — D-07
- Why: cross-platform (macOS + Linux + Windows recovery); standard USB sticks ($10 each ×2); VeraCrypt mature + open-source; matches Phase 2 D-04 USB pattern (single backup device carries both age key + signing bundle). Hardware-encrypted = $50/drive ×2 + vendor risk if hardware fails. Paper QR = recovery requires OCR / manual transcription (slow + error-prone).

**Q8: USB content scope — just keystore, or keystore + age key together?**
- Options considered: (a) keystore-only USB (separate from Phase 2 age-key USB); (b) shared USB with both age key + keystore
- Selected: **(b) shared USB** — D-07
- Why: recovery is a unit (keystore is useless without age key to decrypt SOPS); shared USB = halves the number of physical backup devices to manage; the age key is itself SOPS-encrypted on disk via the VeraCrypt layer, so single USB compromise still requires VeraCrypt passphrase. Defense-in-depth (VeraCrypt + SOPS) preserved.

**Q9: Number of physical locations — 1 / 2 / 3?**
- Options considered: 1 (dev's home only), 2 (home + offsite), 3 (home + offsite + safe deposit box)
- Selected: **2** — D-07, ROADMAP success criterion 3
- Why: ROADMAP explicitly requires "two offline physical backups in separate physical locations"; 1 = single point of failure (house fire); 3 = solo-dev operational tax (extra USB to maintain + extra location to visit). 2 is the documented Phase 6 acceptance gate.

### Cluster 3 — iOS Apple Developer + distribution

**Q10: Enrollment type — Individual vs Organization?**
- Options considered: (a) Individual ($99/year, no D-U-N-S, legal name shown); (b) Organization ($99/year, D-U-N-S required, company name shown)
- Selected: **(a) Individual** — D-09
- Why: solo dev with no legal entity; D-U-N-S enrollment delays Apple Developer access by ~2 weeks for first-time orgs (would block Phase 6 → Phase 7 critical path); legal name in TestFlight is acceptable for closed-beta friend distribution. Migration Individual → Organization is supported by Apple without re-signing.

**Q11: Credentials storage — EAS Cloud-managed vs self-managed in SOPS?**
- Options considered: (a) EAS Cloud holds keystore + cert + provisioning profile + ASC key; (b) self-managed in SOPS, EAS reads at build time via env
- Selected: **(b) self-managed in SOPS** — D-10
- Why: matches Phase 4's "no vendor lock-in" pattern (D-04-04-A save/scp/load over GHCR pull-auth) + Phase 2's "age over cloud KMS" decision. Solo dev's "I am the only person who can recover this" reality favors full control over vendor convenience.

**Q12: ASC API key role — Admin / App Manager / Developer?**
- Options considered: Admin (full account), App Manager (build upload + TestFlight + invite), Developer (read-only build status)
- Selected: **App Manager** — D-11
- Why: principle of least privilege; sufficient for Phase 8 `xcrun altool upload` + TestFlight tester invite. Admin = blast radius if key leaks (can revoke certs, modify billing). Developer = insufficient (cannot upload).

**Q13: Provisioning profile type — App Store / Ad Hoc / Development?**
- Options considered: App Store, Ad Hoc, Development
- Selected: **App Store** — D-13
- Why: TestFlight uses App Store profiles internally (only correct choice); Ad Hoc requires per-tester UDID registration (breaks at 5+ testers); Development is for Xcode-tethered debug.

**Q14: Bundle ID + applicationId — keep `com.runningecosystem.mobile` or change?**
- Options considered: (a) keep as-is (already in `apps/mobile-rn/app.json`); (b) change to staging-variant for closed beta (`com.runningecosystem.mobile.beta`)
- Selected: **(a) keep `com.runningecosystem.mobile`** — D-12
- Why: Apple/Google bind bundle ID to signing identity at first registration; changing later requires re-signing all installs as a new app. Closed beta = no separate staging variant needed. Locked.

### Cluster 4 — Plan structure + recovery playbooks

**Q15: Plan ordering — 06-01 + 06-02 parallel or strict serial?**
- Options considered: (a) parallel (waves 1 + 1); (b) strict serial 06-01 → 06-02
- Selected: **(b) serial** — D-16
- Why: both plans write to the same SOPS file `.secrets/prod/mobile-signing.yaml`; parallel execution would race on file creation. Serial ordering matches the natural dependency (06-02 needs the SOPS slot 06-01 created).

**Q16: USER ACTION checkpoints — when to pause?**
- Options considered: pause at each milestone vs pause only at unavoidable user actions
- Selected: **unavoidable only** — D-17
- Why: Plan 06-01 pauses for physical USB backup placement (cannot be automated); Plan 06-02 pauses for Apple Developer enrollment (cannot be automated). All other steps (`keytool` generation, `sops --set`, certificate generation via Apple portal browser session) are autonomous + scripted.

**Q17: Fastlane Match vs Apple Developer portal UI for cert rotation?**
- Options considered: Fastlane Match (multi-dev cert sync), Apple Developer portal manual rotation, fastlane sigh (provisioning profile automation)
- Selected: **Apple Developer portal UI** — D-18
- Why: solo dev + once-a-year cert renewal = Match's multi-dev sync value is zero; the operational tax of maintaining Match's git-encrypted certs repo + match passphrase ≫ the time saved by automating once-a-year clicks.

**Q18: Recovery playbook scope — how many failure scenarios to document?**
- Options considered: (a) just the happy path (age key restored from USB); (b) 4 scenarios (USB restore + catastrophic loss + corruption + iOS cert expiry)
- Selected: **(b) 4 scenarios** — D-15
- Why: Phase 6 is the last chance to plan for these before they become real; documenting now while context is fresh is much cheaper than reconstructing under pressure.

---

## Deferred ideas (captured for future phases)

- Fastlane Match → v1.1 if cert renewal becomes recurring chore
- Organization Apple Developer enrollment → public-launch milestone if incorporation happens
- Staging bundle ID variant → v1.1 if staging mobile build becomes useful
- Reproducible-build byte-identical verification → dropped per ADR-0011
- SLSA provenance attestation for mobile artifacts → dropped per ADR-0011
- EAS Cloud-managed credentials as fallback → if local builds prove too slow in Phase 7
- Annual cert renewal automation reminder → flagged in `docs/SECRETS.md §"iOS signing — recovery"` scenario (d)

## Scope creep blocked

- None — discussion stayed entirely within "generate + persist + back up signing credentials" boundary. Build pipeline (Phase 7) + distribution pipeline (Phase 8) explicitly deferred.

---

*Audit trail only — see `06-CONTEXT.md` for the canonical decisions consumed by gsd-phase-researcher + gsd-planner.*
