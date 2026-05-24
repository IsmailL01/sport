# Phase 6: Release signing — Research

**Researched:** 2026-05-20
**Domain:** Operational secret-management — Android keystore generation + Apple Developer enrollment + iOS distribution credentials + SOPS base64-in-YAML persistence + offline physical backup
**Confidence:** HIGH (CI/SOPS/keytool verified locally + Apple flow cross-checked against official Apple Developer Help docs + Expo official docs for credentials.json)

## Summary

Phase 6 generates two unrecoverable secrets (Android release keystore + Apple iOS distribution bundle) and persists them in `.secrets/prod/mobile-signing.yaml` (SOPS-encrypted, base64-in-YAML per D-02) with two offline physical backups (D-07). All 22 CONTEXT decisions hold up against 2026-current tooling. **One blocker surfaced:** `.sops.yaml` (line 23) still has the CI age-key TODO open from Phase 2; D-14 will need Plan 06-01 to either add the CI key OR confirm Phase 4 already wired it via `sops updatekeys` (research found no evidence it was added — `.sops.yaml` recipient list still shows only DEV_A).

**Primary recommendation:** Execute Plan 06-01 (Android, ~30 min wall-clock work) before 06-02 (iOS, gated on Apple enrollment review SLA that has slipped to 2-7+ weeks in early 2026 per developer.apple.com forums). Use **PKCS12** as keystore format (not JKS) per modern keytool defaults — Android Gradle Plugin accepts both transparently, and PKCS12 is portable across Java versions; D-04 keytool flag `-storetype JKS` should be flipped to `-storetype PKCS12` (or omitted to take keytool's default). Use **`sops set --value-file`** (SOPS 3.11+) to inject the base64'd keystore — avoids shell-arg length limits and command-history exposure. Use **Disk Utility encrypted DMG (AES-256)** instead of VeraCrypt for the two USB backups — VeraCrypt on macOS 26 requires FUSE-T with Sequoia/Tahoe compatibility caveats; encrypted DMG is built-in, cross-mac-portable, and uses the same AES-256 primitive. Use **macOS RAM disk via `hdiutil`** for the ephemeral keystore-generation tempfile instead of `/tmp/` + `shred` — `shred` is unavailable on macOS (BSD `rm -P` is ineffective on APFS/SSD due to copy-on-write + wear leveling); RAM disk evaporates on unmount, no SSD trace.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** SOPS slot = single file `.secrets/prod/mobile-signing.yaml` (Android + iOS bundled).
- **D-02:** SOPS encoding = base64 inside YAML fields (not `--input-type binary`).
- **D-03:** Decrypted YAML structure = `android.{keystore_base64, keystore_password, key_alias, key_password}` + `ios.{distribution_cert_p12_base64, distribution_cert_password, provisioning_profile_base64, provisioning_profile_uuid, team_id, asc_api_key_p8_base64, asc_api_key_id, asc_api_issuer_id}`.
- **D-04:** Keystore generation environment = solo-workstation one-shot (NOT air-gapped). Keytool command + immediate base64 + SOPS write + shred. Plaintext on disk ~30s.
- **D-05:** Keystore alias = `runningecosystem-release` (single alias).
- **D-06:** Validity = 100 years (`-validity 36500`).
- **D-07:** Two offline physical backups = two VeraCrypt-encrypted USB sticks, separate locations. Each carries (1) age private key, (2) SOPS-encrypted `.secrets/prod/mobile-signing.yaml`, (3) printed laminated recovery card.
- **D-08:** Keystore + key passwords = 32-byte random via `openssl rand -base64 32`; same password for both keystore-level and key-level.
- **D-09:** Apple Developer Program = Individual enrollment ($99/year, NOT Organization).
- **D-10:** iOS distribution cert + provisioning profile = self-managed in SOPS (NOT EAS Cloud-managed).
- **D-11:** ASC API key role = App Manager (NOT Admin, NOT Developer).
- **D-12:** Bundle ID + applicationId LOCKED at `com.runningecosystem.mobile` (single, no staging variant).
- **D-13:** Provisioning profile type = App Store (NOT Ad Hoc, NOT Development).
- **D-14:** SOPS recipients update = add CI age key if not already added by Phase 4. **Research finding:** `.sops.yaml` line 23 still shows TODO — Plan 06-01 must add the CI key OR confirm separately whether Phase 4 added it elsewhere (none of the Phase 4 SUMMARYs reference `sops updatekeys`).
- **D-15:** Extend `docs/SECRETS.md` with "Mobile signing — recovery" covering 4 scenarios (a-d).
- **D-16:** Plan 06-01 (Android) → 06-02 (iOS) strict serial.
- **D-17:** Both plans `autonomous: false` with USER ACTION checkpoints (USB placement + Apple Team ID input).
- **D-18:** No Fastlane Match for cert/profile rotation at this phase (web portal UI is sufficient).
- **D-19:** Phase 6 produces SHA-256 fingerprint side-file `.planning/phases/06-release-signing/evidence/keystore-sha256.txt` (Mapbox `pk.` restriction tightening is a separate follow-up task, NOT Phase 6 scope).
- **D-20:** `eas.json` production profile credential references → Phase 7 scope.
- **D-21:** ASC API key actual upload workflow → Phase 8 (DIST-02) scope.
- **D-22:** TestFlight tester invitation → Phase 8 (DIST-02) scope.

### Claude's Discretion

- USB encryption tool choice (CONTEXT D-07 specifies VeraCrypt; research surfaces **encrypted DMG as superior macOS-native alternative** — flagged for planner to apply discretion when writing Plan 06-01 Task N).
- Keystore format `JKS` vs `PKCS12` (CONTEXT D-04 keytool command line says `-storetype JKS`; research recommends **PKCS12**).
- Ephemeral-file location during keytool generation (CONTEXT D-04 says `/tmp/`; research recommends **macOS RAM disk via `hdiutil`** because `shred` is unavailable + APFS/SSD secure-delete is ineffective).
- `sops --set` syntax — CONTEXT D-15(d) shows shell-piped form; research recommends `sops set --value-file` for size + history hygiene.
- `yq` flavor (Go vs Python) for SOPS extraction in recovery RUNBOOK — research recommends **mikefarah/yq Go binary** (`brew install yq`), matches the project's existing macOS tooling.

### Deferred Ideas (OUT OF SCOPE)

- Fastlane Match for cert/profile rotation → v1.1.
- Organization Apple Developer enrollment → public-launch milestone.
- iOS staging bundle ID variant `com.runningecosystem.mobile.staging` → v1.1.
- Reproducible-build byte-identical verification → dropped per ADR-0011.
- SLSA provenance attestation in CI artifacts (mobile-side) → dropped per ADR-0011.
- EAS Cloud-managed credentials option → v1.0.1 escape hatch only.
- Annual cert renewal reminder automation → calendar entry sufficient for v1.0.
- Hardware HSM for Android keystore → v1.1 if/when public Play Store submission.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SIGN-01 | Android release keystore — generated offline; SOPS-encrypted; 2 offline physical backups in separate locations; recovery playbook in `docs/SECRETS.md` | §4 (keytool 4096+100y), §6 (encrypted-DMG USB backup), §7 (SOPS base64-in-YAML), §8 Pitfalls 4/6/9/12 |
| SIGN-02 | Apple Developer Program enrolled; distribution cert (P12) + App Store provisioning profile; ASC API key P8 in SOPS; EAS-managed-vs-fastlane-Match decision documented in `docs/SECRETS.md` §"iOS signing" | §1 (Apple Dev enrollment 2026), §2 (ASC API key roles), §3 (App ID → Cert → Profile order), §5 (EAS credentials.json schema), §8 Pitfalls 1/2/8/10 |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Keystore generation | Local dev workstation (macOS) | — | One-shot; never runs on CI/server |
| Keystore persistence | SOPS-encrypted YAML in git | USB encrypted-DMG backup (2 copies) | Defense-in-depth; bus factor |
| iOS distribution cert generation | Apple Developer web portal (UI) + macOS Keychain | — | Apple's flow is portal + Keychain export; not automatable for solo dev at this phase |
| iOS cert persistence | SOPS-encrypted YAML in git | USB encrypted-DMG backup | Same pattern as keystore |
| ASC API key generation | App Store Connect web UI | — | Apple-portal-only flow |
| ASC API key persistence | SOPS-encrypted YAML in git | USB encrypted-DMG backup | Same pattern |
| Recovery (age-key loss) | USB encrypted-DMG mount | 1Password sealed (per Phase 2 D-04) | Multiple recovery channels |
| Recovery (cert expiry, annual) | Apple Developer web portal | Calendar reminder | Apple-driven renewal cycle |

## Standard Stack

### Core

| Tool | Version (verified) | Purpose | Why Standard |
|------|--------------------|---------|--------------|
| `keytool` | bundled with JDK ≥ 9 (default PKCS12; project workstation has it at `/usr/bin/keytool`) | Generate + introspect Android keystore | Java-stdlib, ships with every JDK, only sane tool for `.jks`/`.p12` |
| `sops` | 3.13.1 (verified locally; latest per CHANGELOG.md) | Encrypt secrets at rest | Project standard since Phase 2; `set --value-file` (3.11+) is the key 2026 feature |
| `age` | latest (already wired Phase 2; key at `~/.config/sops/age/keys.txt`) | X25519 key material for SOPS | Phase 2 D-01 locked choice |
| `yq` | 4.53.2 (mikefarah Go fork — install via `brew install yq` if missing) | Extract base64 fields from decrypted YAML for recovery | mikefarah/yq is the Go binary that `brew install yq` resolves to — NOT Python `yq` (jq-wrapper); confirmed via local `brew info yq` |
| `openssl` | 3.0.18 (verified locally) | Generate 32-byte random passwords (`openssl rand -base64 32`) | Universal; matches existing Phase 2 password-generation pattern in `docs/SECRETS.md` rotation playbooks |
| `hdiutil` | macOS built-in (`/usr/bin/hdiutil`) | Create encrypted DMG (USB backup); create RAM disk (ephemeral keystore tempfile) | macOS-native; no external dependency; AES-256 first-class |
| `base64` | macOS built-in (BSD `/usr/bin/base64`) | Encode keystore/p12/p8 bytes into YAML field-safe string | BSD `base64` requires `-i` for input file (`base64 -i keystore.p12`); does NOT support `-w0` GNU flag — BSD version doesn't wrap by default; verify with round-trip `base64 \| base64 -d` |
| Apple Developer Program (paid) | Individual $99/year (verified at developer.apple.com/programs/enroll) | iOS distribution authority | Mandatory for TestFlight + distribution cert + ASC API |
| Apple Developer app (iOS/iPadOS/macOS) | Latest, App Store | Enrollment + identity verification (Face ID / Touch ID / Apple Silicon T2 attestation) | 2026 Apple Developer Program enrollment requires Apple Developer app on a device with biometric auth (verified per developer.apple.com/help/account/membership/enrolling-in-the-app) |

### Supporting

| Tool | Version | Purpose | When to Use |
|------|---------|---------|-------------|
| `keychain access.app` | macOS built-in (Tahoe — macOS 26.2) | Export iOS distribution cert as `.p12` | After Apple Developer portal issues `.cer` and Keychain holds the private key; export via Keychain Access → right-click → Export → `.p12` |
| `security` CLI | macOS built-in (`/usr/bin/security`) | Programmatic Keychain operations | Alternative to Keychain Access GUI for scripting cert import/export |
| Disk Utility.app | macOS built-in | Create encrypted DMG containers for USB backup | Recommended over VeraCrypt on macOS 26 (FUSE-T compatibility caveats) |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Disk Utility encrypted DMG (recommended) | VeraCrypt + FUSE-T | VeraCrypt nightly works on macOS Sonoma; macOS Sequoia/Tahoe has reported exFAT bugs; needs FUSE-T install (requires partial SIP-disable on Apple Silicon some configs). CONTEXT D-07 specifies VeraCrypt — Claude discretion may swap to encrypted-DMG if planner agrees |
| PKCS12 keystore (recommended) | JKS | Both accepted by Android Gradle Plugin; PKCS12 is keytool default since JDK 9; CONTEXT D-04 says `-storetype JKS` — Claude discretion area |
| `sops set --value-file` (recommended) | `sops --set '["path"]["key"]' "$(base64 -i file)"` | Shell-arg form is what existing `docs/SECRETS.md` uses (e.g., Mapbox rotation playbook); value-file form avoids shell history + ARG_MAX (1MB on macOS, but the keystore is only ~5KB so ARG_MAX isn't a hard blocker — value-file is cleaner) |
| RAM disk for ephemeral keystore (recommended) | `/tmp/` + `rm -P` | macOS lacks `shred`; BSD `rm -P` is ineffective on APFS due to copy-on-write snapshots + SSD wear leveling; RAM disk evaporates on unmount with zero SSD trace |
| App Manager API key role (CONTEXT D-11) | Admin | App Manager has sufficient TestFlight + build-upload permissions for solo-dev workflow per fastlane docs and aso.dev; Admin is overkill (principle of least privilege violated) |

**Installation (one-shot per new dev machine):**

```bash
# Verify (project already has sops + openssl + keytool + base64 + hdiutil + security):
which sops yq openssl keytool base64 hdiutil security keychain

# Install missing yq if not present (Go binary, NOT Python wrapper):
brew install yq
yq --version    # expect v4.x (mikefarah/yq)

# Confirm SOPS version supports `set --value-file` (3.11+):
sops --version  # expect ≥ 3.11.0 (verified 3.13.1 already installed)
```

**Version verification** (run during Plan 06-01 Task 1 / Wave 0):

```bash
# Print versions to evidence file for audit trail:
mkdir -p .planning/phases/06-release-signing/evidence
{
  echo "## Tool versions captured at Phase 6 execution"
  date -u +"%Y-%m-%dT%H:%M:%SZ"
  echo
  sops --version --check-for-updates 2>&1 | head -2
  yq --version
  openssl version
  keytool -help 2>&1 | head -1
  echo "macOS: $(sw_vers -productVersion)"
} > .planning/phases/06-release-signing/evidence/tool-versions.txt
```

## Architecture Patterns

### System Architecture Diagram

```
                  Plan 06-01 (Android)                       Plan 06-02 (iOS)
                  ─────────────────                          ──────────────────
USER ACTION:                                            USER ACTION:
  (none — solo workstation generation)                    Apple Dev enrollment
                                                          ($99/yr Individual)
                ↓                                                ↓
   [hdiutil attach -nomount     ]                    [Apple Developer app    ]
   [ -size 10m ram://...        ]──→ /Volumes/SIGN_RAM   [ on iPhone/iPad/Mac ]──→ Team ID
   (RAM disk, evaporates on    )                        [ + 2FA + biometric   ]
   ( unmount, never hits SSD   )
                ↓                                                ↓
   [keytool -genkeypair         ]              [Apple Dev portal → Identifiers ]
   [ -alias runningecosystem-   ]              [ → Register App ID             ]
   [   release                  ]              [ com.runningecosystem.mobile    ]
   [ -keystore <ramdisk>.p12    ]                       ↓
   [ -keyalg RSA -keysize 4096  ]              [Apple Dev portal → Certificates ]
   [ -validity 36500            ]              [ → Apple Distribution → CSR     ]
   [ -storetype PKCS12          ]              [ (gen via Keychain on macOS)    ]
   [ -dname "CN=...,O=...,..."  ]                       ↓
                ↓                                  [Keychain Access.app →       ]
   [base64 -i keystore.p12       ]                [ export private key + cert  ]
   [   > /tmp/keystore.b64       ]                [   as .p12 with password    ]
                ↓                                                ↓
   [sops set --value-file       ]                 [Apple Dev portal → Profiles  ]
   [  /tmp/keystore.b64          ]                [ → App Store Distribution    ]
   [ .secrets/prod/mobile-       ]                [ → download .mobileprovision ]
   [   signing.yaml              ]                                ↓
   [ '["android"]                ]                 [App Store Connect → Users   ]
   [  ["keystore_base64"]'       ]                 [ → Keys → Add API Key       ]
                                                   [ → App Manager role         ]
                ↓                                  [ → download AuthKey_XXX.p8  ]
   [keytool -list -v             ]                 [ + capture Key ID + Issuer  ]
   [ -keystore <ramdisk>.p12     ]                                ↓
   [ -alias ...                  ]                 [base64 -i AuthKey_XXX.p8    ]
   [ \| grep SHA256:             ]                 [base64 -i distribution.p12  ]
                ↓                                  [base64 -i profile.mobile... ]
   [.planning/phases/06.../      ]                                ↓
   [   evidence/keystore-        ]                 [sops set --value-file ...   ]
   [   sha256.txt                ]                 [   (3× for p12 + profile +  ]
                ↓                                  [    p8 into .secrets/prod/  ]
   [hdiutil detach /Volumes/     ]                 [    mobile-signing.yaml)    ]
   [   SIGN_RAM                  ]                                ↓
   (RAM disk gone — zero SSD     )                 [sops -d .secrets/prod/      ]
   ( trace; passwords never      )                 [   mobile-signing.yaml      ]
   ( hit shell history because   )                 [   \| yq -r .ios.team_id    ]
   ( generation script sources   )                 [ (verify round-trip)        ]
   ( pwd from openssl rand into  )                                ↓
   ( env var KS_PASS that the    )                 [ Append "iOS signing —      ]
   ( shred-after-use script      )                 [ recovery" section to       ]
   ( unsets at end)              )                 [ docs/SECRETS.md (D-15)     ]
                ↓
   [ Append "Mobile signing —    ]
   [ recovery" section to        ]
   [ docs/SECRETS.md (D-15)      ]
                ↓
   USER ACTION: place 2 USB backups (encrypted-DMG containing:
   age key + sops-encrypted mobile-signing.yaml + paper recovery card)
   in 2 separate physical locations.
                ↓
   Plan 06-01 closed; Plan 06-02 starts ────→ joins flow (right column above)
                                                                ↓
                                            Plan 06-02 closed; phase 6 done.
                                            Phase 7 BUILD-01/02 can now consume.
```

### Recommended File Structure

```
.secrets/
├── prod/
│   └── mobile-signing.yaml          # NEW — SOPS-encrypted, base64-in-YAML per D-02
│                                    # Fields per D-03 (android.* + ios.*)
.planning/phases/06-release-signing/
├── 06-CONTEXT.md                    # already exists (22 D-NN decisions)
├── 06-RESEARCH.md                   # this file
├── 06-DISCUSSION-LOG.md             # already exists
├── 06-01-PLAN.md                    # Plan: Android keystore (write next)
├── 06-02-PLAN.md                    # Plan: iOS Apple Dev + cert + profile + ASC key (write after)
├── 06-01-SUMMARY.md                 # written at plan closeout
├── 06-02-SUMMARY.md                 # written at plan closeout
└── evidence/
    ├── tool-versions.txt            # produced Wave 0 / Plan 06-01 Task 1
    ├── keystore-sha256.txt          # produced Plan 06-01 (D-19)
    ├── apple-team-id.txt            # produced Plan 06-02 Task 0 (USER ACTION input)
    └── recovery-card-template.md    # template for paper laminate (sanitized — no pwd)
docs/
├── SECRETS.md                       # EXTEND with new section "Mobile signing — recovery" (D-15)
└── DECISIONS/
    └── 0011-scope-reset...md        # already exists (closed-beta scope rationale)
```

### Pattern 1: Generate Android keystore with RAM-disk ephemeral tempfile

**What:** Keytool generates `.p12` to a RAM-disk mount; the RAM disk evaporates on unmount; zero SSD persistence; passwords stay in env vars only.
**When to use:** Plan 06-01 keystore-generation task.
**Example:**

```bash
# Source: macOS hdiutil(1) man + Apple Disk Utility encrypted-image guide (see Sources)

set -euo pipefail

# 1. Generate passwords via env var (no shell history echo):
export KS_PASS=$(openssl rand -base64 32 | tr -d '\n=+/' | head -c 32)
# KS_PASS lives in this shell process only; never echoed; HISTFILE off in this scope.
# Per D-08: same password for keystore + key.

# 2. Allocate a 10MB RAM disk (plenty for 5-10KB keystore):
RAM_DEV=$(hdiutil attach -nomount ram://20480)   # 20480 sectors × 512 = 10MB
diskutil eraseVolume APFS SIGN_RAM "$RAM_DEV"    # mount at /Volumes/SIGN_RAM

# 3. Generate the keystore (PKCS12 per recommendation over JKS):
KS=/Volumes/SIGN_RAM/runningecosystem.p12
keytool -genkeypair \
  -alias runningecosystem-release \
  -keystore "$KS" \
  -storetype PKCS12 \
  -keyalg RSA \
  -keysize 4096 \
  -validity 36500 \
  -storepass:env KS_PASS \
  -keypass:env KS_PASS \
  -dname "CN=Running Ecosystem, OU=Mobile, O=Running Ecosystem, L=<city>, ST=<state>, C=<country>"
# -storepass:env / -keypass:env reads pwd from env var, NOT command-line argument
# (command-line args show in /proc & ps; env vars do not on macOS).

# 4. Capture SHA-256 fingerprint to evidence side-file (D-19):
keytool -list -v -keystore "$KS" -alias runningecosystem-release -storepass:env KS_PASS \
  | awk '/SHA256:/ {print $2}' \
  > .planning/phases/06-release-signing/evidence/keystore-sha256.txt

# 5. Base64-encode to a side-file (avoids shell-arg length + history):
base64 -i "$KS" > /Volumes/SIGN_RAM/keystore.b64

# 6. Inject base64 + passwords into SOPS via value-file (SOPS 3.11+):
sops set --value-file /Volumes/SIGN_RAM/keystore.b64 \
  .secrets/prod/mobile-signing.yaml '["android"]["keystore_base64"]'
# Passwords are short strings — shell-arg form is fine for them:
sops set .secrets/prod/mobile-signing.yaml '["android"]["keystore_password"]' "$KS_PASS"
sops set .secrets/prod/mobile-signing.yaml '["android"]["key_password"]' "$KS_PASS"
sops set .secrets/prod/mobile-signing.yaml '["android"]["key_alias"]' "runningecosystem-release"

# 7. Round-trip verification (decrypt + extract + compare SHA-256):
DECRYPTED_KS=/Volumes/SIGN_RAM/keystore-verify.p12
sops -d .secrets/prod/mobile-signing.yaml \
  | yq -r '.android.keystore_base64' \
  | base64 -d > "$DECRYPTED_KS"

# Pull the password env-var pattern (D-08) for the verify step:
export VER_PASS=$(sops -d .secrets/prod/mobile-signing.yaml | yq -r '.android.keystore_password')
keytool -list -v -keystore "$DECRYPTED_KS" -storepass:env VER_PASS \
  | awk '/SHA256:/ {print $2}' \
  | diff - .planning/phases/06-release-signing/evidence/keystore-sha256.txt
# Must produce NO output (files identical).

# 8. Teardown: detach RAM disk + unset env vars + clear history of this session:
unset KS_PASS VER_PASS
hdiutil detach /Volumes/SIGN_RAM   # RAM disk gone — physically unrecoverable
# Optional but recommended: `history -c` in the current shell (zsh: also flush HISTFILE).
```

### Pattern 2: USB backup as encrypted DMG (preferred over VeraCrypt)

**What:** Create an AES-256 encrypted DMG on USB stick; mount as read-write; copy age key + SOPS file + paper recovery card scan; unmount → eject.
**When to use:** Plan 06-01 final task (D-07 USB backup). Repeat for USB-B.
**Example:**

```bash
# Source: https://support.apple.com/guide/disk-utility/encrypt-protect-a-storage-device-password-dskutl35612/mac

# 1. Create 200MB AES-256 encrypted DMG (plenty for keys + recovery card):
hdiutil create -size 200m \
  -encryption AES-256 \
  -fs APFS \
  -volname "SPORT_RECOVERY_A" \
  /Volumes/<USB_LABEL>/sport-recovery-a.dmg
# Prompts for password (do NOT echo; type at prompt; copy to 1Password sealed entry).

# 2. Mount + populate:
hdiutil attach /Volumes/<USB_LABEL>/sport-recovery-a.dmg   # prompts for password
cp ~/.config/sops/age/keys.txt /Volumes/SPORT_RECOVERY_A/age-keys.txt
cp .secrets/prod/mobile-signing.yaml /Volumes/SPORT_RECOVERY_A/mobile-signing.yaml
# Also copy the paper recovery card text (no pwd, just mnemonic hint + other-USB location):
cp .planning/phases/06-release-signing/evidence/recovery-card-template.md \
   /Volumes/SPORT_RECOVERY_A/RECOVERY-CARD.md

# 3. Verify mount works on this machine before unmounting (decrypt sample):
SOPS_AGE_KEY_FILE=/Volumes/SPORT_RECOVERY_A/age-keys.txt \
  sops -d /Volumes/SPORT_RECOVERY_A/mobile-signing.yaml | yq -r '.android.key_alias'
# Must print "runningecosystem-release". If not, do NOT eject — debug first.

# 4. Unmount + eject:
hdiutil detach /Volumes/SPORT_RECOVERY_A
# Physically remove USB stick.
```

### Pattern 3: SOPS round-trip for iOS distribution bundle

**What:** Same `sops set --value-file` pattern as Android, but applied to 3 binary fields: `.p12` (distribution cert), `.mobileprovision` (provisioning profile), `.p8` (ASC API key).
**When to use:** Plan 06-02 Tasks 3-5 (after Apple-portal artifacts downloaded to `~/Downloads/`).
**Example:**

```bash
# Distribution certificate (.p12 exported from Keychain Access with password):
export P12_PASS=$(openssl rand -base64 32 | tr -d '\n=+/' | head -c 32)
# (use a DIFFERENT 32-byte random — p12 password is independent of keystore pwd)
# Export .p12 via Keychain Access GUI: right-click cert+private-key → Export → set P12_PASS

base64 -i ~/Downloads/runningecosystem-distribution.p12 \
  > /Volumes/SIGN_RAM/dist-cert.b64
sops set --value-file /Volumes/SIGN_RAM/dist-cert.b64 \
  .secrets/prod/mobile-signing.yaml '["ios"]["distribution_cert_p12_base64"]'
sops set .secrets/prod/mobile-signing.yaml \
  '["ios"]["distribution_cert_password"]' "$P12_PASS"

# Provisioning profile (binary file, ~7-10KB):
base64 -i ~/Downloads/RunningEcosystem_AppStore.mobileprovision \
  > /Volumes/SIGN_RAM/profile.b64
sops set --value-file /Volumes/SIGN_RAM/profile.b64 \
  .secrets/prod/mobile-signing.yaml '["ios"]["provisioning_profile_base64"]'
# Capture UUID for CI debug (D-03 ios.provisioning_profile_uuid):
PROFILE_UUID=$(security cms -D -i ~/Downloads/RunningEcosystem_AppStore.mobileprovision \
  | plutil -extract UUID raw -)
sops set .secrets/prod/mobile-signing.yaml \
  '["ios"]["provisioning_profile_uuid"]' "$PROFILE_UUID"

# ASC API key (p8 file, ~250 bytes — Apple-issued private key PEM):
# File downloaded as AuthKey_<KEYID>.p8 from App Store Connect → Users → Keys
base64 -i ~/Downloads/AuthKey_<KEYID>.p8 > /Volumes/SIGN_RAM/asc-key.b64
sops set --value-file /Volumes/SIGN_RAM/asc-key.b64 \
  .secrets/prod/mobile-signing.yaml '["ios"]["asc_api_key_p8_base64"]'
# Key ID + Issuer ID are short strings:
sops set .secrets/prod/mobile-signing.yaml '["ios"]["asc_api_key_id"]' "<KEYID>"
sops set .secrets/prod/mobile-signing.yaml '["ios"]["asc_api_issuer_id"]' "<UUID>"
sops set .secrets/prod/mobile-signing.yaml '["ios"]["team_id"]' "<10-char-team-id>"

unset P12_PASS
hdiutil detach /Volumes/SIGN_RAM
```

### Anti-Patterns to Avoid

- **DO NOT** type passwords directly into the `keytool -genkeypair` command line as `-storepass <pwd>` / `-keypass <pwd>` — they appear in `ps`/`/proc` and shell history. Use `-storepass:env <ENV_VAR>` / `-keypass:env <ENV_VAR>` instead.
- **DO NOT** save the plaintext `.p12` / `.keystore` to `/tmp/` and rely on `rm -P` to scrub it — APFS copy-on-write + SSD wear-leveling make `rm -P` ineffective. Use RAM disk.
- **DO NOT** commit unencrypted `.keystore` / `.p12` / `.mobileprovision` / `.p8` to git — verify via `git diff --cached` and a pre-commit grep guard before `git commit`.
- **DO NOT** export `.p12` from Keychain Access without setting an explicit password — Keychain Access default password behavior is inconsistent across macOS versions. Always click "Set password" and type a 32-byte random.
- **DO NOT** create the ASC API key with Admin role — App Manager is sufficient for upload + TestFlight management per fastlane docs.
- **DO NOT** rely on the iOS Distribution legacy cert type — use "Apple Distribution" (renamed 2019, unified across iOS/macOS/tvOS/watchOS).
- **DO NOT** add `OFFLINE:READ` / `TILESETS:READ` / `DOWNLOADS:READ` scopes to the Mapbox `pk.` token even after Phase 6's SHA-256 fingerprint is captured (this is a Phase 2 lesson, but Plan 06-01 Task M producing the SHA-256 fingerprint must NOT confuse the planner into doing the Mapbox dashboard restriction — D-19 explicitly says that's a follow-up, NOT Phase 6 scope).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Keystore generation | A custom OpenSSL chain or Bouncy Castle Python script | `keytool` (JDK built-in) | Battle-tested, Android Studio uses it, Gradle accepts its output directly, century-old encoding format support |
| Password generation | `head -c 32 /dev/urandom \| xxd -p` | `openssl rand -base64 32` | Existing `docs/SECRETS.md` pattern; produces base64-safe characters without the `+/=` ambiguity that breaks some YAML parsers |
| File secure-deletion | A multi-pass overwrite loop in bash | RAM disk via `hdiutil attach -nomount ram://...` | APFS COW + SSD wear leveling defeat any in-place overwrite; RAM disk evaporates on unmount, no SSD trace |
| Disk encryption for USB backup | A `gpg --symmetric` over a tar.gz | macOS encrypted DMG via `hdiutil create -encryption AES-256` (or Disk Utility GUI) | DMG is native to macOS, AES-256 hardware-accelerated on Apple Silicon, mounts as filesystem (not just blob), recovery from any Mac |
| iOS provisioning profile creation | Programmatic via App Store Connect API | Apple Developer web portal UI | Solo-dev once-a-year cert renewal cycle doesn't justify Fastlane Match infrastructure (D-18) |
| Apple Developer Program enrollment automation | Anything | Apple Developer app on iOS/iPad/macOS (Face ID + 2FA) | Apple's enrollment flow is intentionally interactive; automation = fraud signal triggering review delays |
| ASC API key creation | Programmatic via REST | App Store Connect web UI (Users → Keys → Add) | One-time setup; UI flow is the documented path; downloaded `.p8` is single-shot (re-download not possible) |

**Key insight:** Phase 6 is a **secret-generation phase**, not a secret-rotation phase. Almost everything is a one-shot operation: keystore is generated ONCE and never rotated (100-year validity per D-06); Apple cert is renewed annually but via portal UI; ASC API key is created once. Building automation for one-shot ops is negative-value engineering. Build it manually with verifiable evidence files, let the RUNBOOK in `docs/SECRETS.md` document the next time.

## Runtime State Inventory

> Phase 6 is **greenfield generation** of new secrets — not a rename/refactor. However, two categories of pre-existing runtime state are touched:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `.secrets/prod/mobile-signing.yaml` does NOT yet exist (verified `.secrets/prod/` contains only Phase 2 outputs: `shared.yaml`, `mapbox.yaml`, `oauth.yaml`) | New file created by Plan 06-01 (Android section); extended by Plan 06-02 (iOS section appended) |
| Live service config | None — Phase 6 does NOT modify any running service. `eas.json` untouched (per D-20, Phase 7's job). | No action |
| OS-registered state | macOS Keychain WILL hold the iOS distribution private key + certificate after Plan 06-02 (Apple Developer portal flow imports them into Keychain Access). This is intentional: Keychain is the canonical source for `.p12` export. | Document in `docs/SECRETS.md` "iOS signing — recovery" that the Keychain entry is part of the recovery chain. **DO NOT delete the Keychain entry after `.p12` export** — keep it as a third backup channel. |
| Secrets/env vars | `.sops.yaml` line 23 still has `# - CI deploy key (Phase 4) appended here once issued.` TODO. **Verified: CI age key was NOT added by Phase 4** (Phase 4 SUMMARYs do not mention `sops updatekeys`). Plan 06-01 must either (a) add the CI age key now (if Phase 4 produced one) or (b) document that Phase 6 ships with DEV_A as sole recipient and re-key after Phase 7 if Phase 7 wires GitHub Actions to consume the SOPS file. | **Plan must address this gap.** Suggested resolution: defer CI-key addition to Phase 7 when GitHub Actions actually consumes mobile-signing.yaml — Phase 6 doesn't need CI decrypt access. Document this in Plan 06-01 alongside D-14. |
| Build artifacts | None — Phase 6 produces no compiled artifacts. (Phase 7 will.) | No action |

**Nothing found in category "Build artifacts":** Phase 6 is pre-build credential prep; no Gradle/Xcode/Metro output. Confirmed by repo grep — no `*.keystore.bak` / `*.p12.bak` / stale signing artifacts present.

## Section 1 — Apple Developer Program Enrollment (2026 flow)

**Verified via:** `developer.apple.com/programs/enroll/` (CITED), `developer.apple.com/help/account/membership/enrolling-in-the-app/` (CITED), `developer.apple.com/forums/thread/820213` review-time discussion (CITED).

| Property | Value | Source |
|----------|-------|--------|
| Pricing (Individual) | **$99 USD / year** (locale-converted; same as Organization) | developer.apple.com/programs/enroll [CITED] |
| Enrollment path 2026 | **Apple Developer app** on iOS/iPadOS/macOS device with biometric auth (Face ID / Touch ID / Apple Silicon T2) — required since 2023, web-only enrollment deprecated for Individual | developer.apple.com/help/account/membership/enrolling-in-the-app [CITED] |
| 2FA on Apple ID | **Mandatory** | developer.apple.com/programs/enroll [CITED] |
| Required documents | Legal name (matching ID), email, phone, physical address (NO P.O. boxes). No D-U-N-S Number required (Organization-only). For sole proprietors: legal name appears as App Store seller — cannot alias. | developer.apple.com/programs/enroll [CITED] |
| Physical iPhone required | **Yes — Apple Developer app needs an iOS/iPad device OR a Mac with T2 chip / Apple Silicon for biometric attestation during enrollment.** Mac-only enrollment is supported if Mac has T2/Silicon. Older Intel Macs without T2 cannot enroll via the Apple Developer app — fallback is web flow which is being deprecated. | developer.apple.com/help/account/membership/enrolling-in-the-app [CITED] |
| Review time (official) | 24-48h for confirmation, 1-3 days for full approval | aso.dev + webtonative.com (Quora-cited, 2026 [VERIFIED via multiple sources]) |
| Review time (reality 2026) | **2-7+ weeks reported by many devs early 2026** with zero communication during review. Plan for this. | developer.apple.com/forums/thread/820213 [CITED — recent thread early 2026] |
| Annual renewal | Auto-renews if payment method stays valid. **Cert expires + all distribution dies** if renewal lapses. Calendar reminder advised. | developer.apple.com/programs/enroll [CITED] |

**Implication for Plan 06-02:** USER ACTION at Task 0 is enrollment kickoff; the rest of the plan must be **pause-able for up to 7 weeks** while waiting on Apple. Plan 06-01 (Android) MUST complete first (D-16) and is unblocked by Apple-side review. Suggest Plan 06-02 frontmatter: `autonomous: false`, `expected_pause_max: "7 weeks"`, `resume_trigger: "Apple Team ID + Apple ID confirmation visible in https://developer.apple.com/account"`.

## Section 2 — App Store Connect API Key (2026)

**Verified via:** aso.dev/app-store-connect/api-key-access-levels (CITED), docs.fastlane.tools/actions/pilot (CITED), Apple Developer Help (partial — 404 on direct role-permissions deeplink, content via aso.dev mirror).

| Property | Value | Source |
|----------|-------|--------|
| API key creation URL | https://appstoreconnect.apple.com/access/api (Users + Access → Keys tab) | App Store Connect UI [VERIFIED via existing CONTEXT references] |
| Role options 2026 | **Admin** / **App Manager** / **Developer** / **Finance** / **Sales and Reports** (same 5 levels as 2023+; no renames in 2026) | aso.dev/app-store-connect/api-key-access-levels [CITED] |
| **App Manager scope (verified for solo-dev workflow)** | **Can:** upload builds (altool/fastlane pilot/EAS submit/Transporter), manage TestFlight build availability, invite TestFlight testers (internal group), update build metadata. **Cannot:** respond to App Store reviews (Admin-only), manage users/roles, access financials. | aso.dev + docs.fastlane.tools/actions/pilot [CITED — both confirm App Manager sufficient for upload + TestFlight] |
| Developer role (insufficient for D-11) | Can upload builds, but **cannot update build metadata or manage testers** unless `--skip_waiting_for_build_processing: true` — too constraining for Phase 8 TestFlight invitation flow | docs.fastlane.tools/actions/pilot [CITED] |
| Key file structure | **Single `AuthKey_<KEYID>.p8` file** (Apple-issued PEM-encoded EC private key, ~250 bytes) + **Key ID** (10-char alphanumeric, shown in ASC UI) + **Issuer ID** (UUID, shown in ASC UI Keys page header) — all three required for JWT signing | App Store Connect UI + aso.dev [CITED] |
| Maximum keys per team | Apple does not publish a hard limit; multiple keys allowed; can revoke + reissue without affecting team status | aso.dev [CITED] |
| Download policy | **`.p8` shown ONCE at creation** — Apple does not allow re-download. Lose it → revoke + create new key. Lock it into SOPS immediately after download. | aso.dev [CITED] |
| Xcode 14+ requirement | **Starting 2026, Xcode ≥ 14 required to upload to App Store Connect.** Phase 7's EAS Build uses Xcode 15+ (Expo SDK 54 default), so this is satisfied. | developer.apple.com/help/app-store-connect/manage-builds/upload-builds [CITED] |

**Recommendation:** D-11 App Manager role is CORRECT for the closed-beta scope. Plan 06-02 Task 4 = create App Manager API key, download `.p8`, capture Key ID + Issuer ID, then `sops set --value-file` per Pattern 3 above. CONTEXT D-11 confirmed by 2026 sources.

## Section 3 — Apple Distribution Certificate + App Store Provisioning Profile (2026)

**Verified via:** developer.apple.com/help/account/identifiers/register-an-app-id (CITED), developer.apple.com/help/account/provisioning-profiles/create-an-app-store-provisioning-profile (CITED), bluelabellabs.com cert guide (CITED), capawesome.io iOS-certs-explained (CITED).

**Order of operations (strict — Apple enforces dependencies):**

1. **Register App ID** at developer.apple.com/account/resources/identifiers/list → Identifiers → + button → **Explicit App ID** (NOT Wildcard) → Bundle ID = `com.runningecosystem.mobile` → enable capabilities matching `apps/mobile-rn/app.json` plugins (Background Modes already in app.json: `location` / `fetch` / `processing`; Push Notifications NOT needed for closed beta per ADR-0011 dropping CRASH-*). [CITED: developer.apple.com/help/account/identifiers/register-an-app-id]
2. **Generate a CSR** (Certificate Signing Request) on macOS via Keychain Access → Certificate Assistant → Request a Certificate From a Certificate Authority → Saved to disk → Continue. Produces `CertificateSigningRequest.certSigningRequest` file. [CITED: bluelabellabs.com]
3. **Create Apple Distribution certificate** at developer.apple.com/account/resources/certificates/list → + → **Apple Distribution** (NOT legacy "iOS Distribution" — that's deprecated since 2019, unified into Apple Distribution covering iOS+macOS+tvOS+watchOS) → upload CSR → download `.cer` → **double-click to install into macOS Keychain** (this binds the private key from Keychain to the Apple-issued public cert). [CITED: capawesome.io + bluelabellabs.com]
4. **Export `.p12`** from Keychain Access: find the "Apple Distribution: <Your Name> (<TeamID>)" entry → expand to show the bundled private key → right-click → Export 2 items → File Format: Personal Information Exchange (.p12) → **set explicit P12 password** (32-byte random per D-08 pattern) → save to `~/Downloads/runningecosystem-distribution.p12`. [Pitfall: do NOT use Keychain default password behavior — explicitly set the password.]
5. **Create App Store provisioning profile** at developer.apple.com/account/resources/profiles/list → + → **Distribution → App Store** (NOT Ad Hoc, NOT Development) → App ID = `com.runningecosystem.mobile` → select the Apple Distribution cert from step 3 → name it `RunningEcosystem AppStore` → download `.mobileprovision`. [CITED: developer.apple.com/help/account/provisioning-profiles/create-an-app-store-provisioning-profile + D-13]
6. **Extract UUID** from the `.mobileprovision` for D-03 field `ios.provisioning_profile_uuid`: `security cms -D -i ~/Downloads/RunningEcosystem_AppStore.mobileprovision | plutil -extract UUID raw -`

**Annual renewal flow (D-15 scenario d):**

- Apple Distribution certs are valid for 1 year. Apple sends email reminders ~30 days before expiry.
- Renewal: revoke old cert at developer.apple.com/account/resources/certificates/list → generate new (steps 2-4 above) → regenerate `.mobileprovision` against new cert (step 5; Apple portal auto-detects cert change and rebuilds the profile if you click the old one and re-save) → `sops set --value-file` to update both fields in `.secrets/prod/mobile-signing.yaml`.
- **Existing TestFlight builds keep working until expiry.** New builds need the new cert. Don't panic — there's no instant invalidation.

## Section 4 — Android keytool (RSA 4096 + 100y validity + format choice)

**Verified via:** Oracle JDK 17 `keytool` spec (CITED), local `keytool -help` execution (VERIFIED), support.google.com/googleplay/android-developer/answer/16641489 SHA-256 extraction (CITED), Google Play minimum 25y signing-cert validity (CITED via support.google.com).

| Property | Value | Source |
|----------|-------|--------|
| Format choice | **PKCS12 (recommended)** OR JKS. Both work with Android Gradle Plugin's `signingConfigs.release`. PKCS12 is keytool default since JDK 9 (Java 9 deprecated JKS for security reasons). CONTEXT D-04 says `-storetype JKS` but research recommends switching to PKCS12 — Claude discretion area. | Oracle keytool spec + Medium-amaxperteye [CITED] |
| Key algorithm | RSA-4096 (D-04 locked) | D-04 [LOCKED] |
| Validity | 36500 days = 100 years (D-06 locked) | D-06 [LOCKED]. Google Play minimum signing-cert validity is 25 years (`9125 days` is Android Studio default); 100y is well above floor. [CITED: support.google.com/googleplay/android-developer/answer/9842756] |
| Android Studio warning about 100y | No rejection, just a yellow "this is unusually long" hint. Android Gradle Plugin accepts any validity ≥ Google Play minimum (25y). Document the warning in the RUNBOOK so future-self doesn't panic. | codegenes.net + support.google.com [VERIFIED across 2 sources] |
| keytool command (recommended w/ PKCS12) | See Pattern 1 above — uses `-storetype PKCS12` instead of `-storetype JKS`; everything else (alias, validity, RSA 4096, dname) matches D-04 | research recommendation |
| Password injection mode | `-storepass:env <ENV_VAR>` and `-keypass:env <ENV_VAR>` to read from environment (not command-line argument visible in `ps`) | Oracle keytool spec [CITED] |
| SHA-256 fingerprint extraction | `keytool -list -v -keystore <file> -alias <alias> -storepass:env <ENV> \| awk '/SHA256:/ {print $2}'` produces `AA:BB:CC:DD:...` (32 hex pairs separated by colons; 64 hex chars + 31 colons = 95 chars total). Format compatible with Mapbox dashboard, Google Sign-In, Firebase, Stripe, and every other consumer of Android signing-cert fingerprints. | support.google.com/android-developer-console/answer/16641489 [CITED] + local `keytool -help` [VERIFIED] |
| Mapbox dashboard fingerprint format | Accepts the colon-separated 95-char form directly (`AA:BB:CC:...`). Some other tools (rare) want the unformatted 64-char form — strip colons via `tr -d ':'`. Capture both formats to the side-file per D-19. | docs.SECRETS.md prior usage [VERIFIED — Phase 2 D-32 captured fingerprint in colon format] |
| Android Gradle Plugin consumption | `signingConfigs { release { storeFile file("keystore.p12") ; storeType "PKCS12" ; storePassword ... ; keyAlias ... ; keyPassword ... } }` — Phase 7 builds this; Phase 6 just produces the file | Phase 7 scope (D-20) |

**Recommendation:** Plan 06-01 keytool command should use `-storetype PKCS12` (override D-04's `JKS`). Plan should explicitly call this out: "Per RESEARCH §4, deviating from CONTEXT D-04 keytool storetype (JKS → PKCS12) per modern keytool default + portability + no functional difference for Android Gradle Plugin consumption."

## Section 5 — EAS self-managed credentials reference patterns (file location only — no build invocation)

**Verified via:** docs.expo.dev/app-signing/local-credentials (CITED), docs.expo.dev/build-reference/local-builds (CITED), docs.expo.dev/eas/json (CITED).

**Schema (canonical for EAS CLI ≥ 12.0, current Expo SDK 54):**

```json
// credentials.json at apps/mobile-rn/credentials.json (gitignored; populated at build time by Phase 7 wrapper)
{
  "android": {
    "keystore": {
      "keystorePath": "android/keystores/release.keystore",
      "keystorePassword": "<read from SOPS>",
      "keyAlias": "runningecosystem-release",
      "keyPassword": "<read from SOPS>"
    }
  },
  "ios": {
    "provisioningProfilePath": "ios/certs/profile.mobileprovision",
    "distributionCertificate": {
      "path": "ios/certs/dist.p12",
      "password": "<read from SOPS>"
    }
  }
}
```

**`eas.json` reference syntax (Phase 7's job, NOT Phase 6 — listed here for forward compatibility):**

```json
{
  "build": {
    "production": {
      "credentialsSource": "local",        // ← per-profile, NOT global
      ...
    }
  }
}
```

**Default value:** `"credentialsSource": "remote"` (Expo Cloud-managed). Setting `"local"` opts into reading `credentials.json` from project root. [CITED: docs.expo.dev/app-signing/local-credentials]

**File location convention (per Expo docs):** `apps/mobile-rn/credentials.json` at project root (relative paths inside it point to `apps/mobile-rn/android/keystores/release.keystore` and `apps/mobile-rn/ios/certs/dist.p12` etc.). **Phase 6 does NOT create these files** — it stores them base64-encoded in SOPS. Phase 7 wires a wrapper script that decrypts SOPS → materializes them at the conventional paths → invokes `eas build --local` (or remote build with credentials.json uploaded as a one-shot via EAS).

**`eas build --local` support on Expo SDK 54:** **Yes, supported.** Same process as cloud build; runs on dev workstation; consumes credentials.json. Useful for Phase 7 debugging. [CITED: docs.expo.dev/build-reference/local-builds]

**Deprecation signal:** **None found.** Expo docs frame local credentials as "useful if you want to manage your own app signing credentials" — not deprecated. Self-managed credentials remain a first-class option in 2026. [VERIFIED via docs.expo.dev/app-signing/local-credentials full-page read]

**Phase 6 takeaway:** All Phase 6 has to do is **freeze the SOPS structure** per D-03 so Phase 7's wrapper script can read fields deterministically:

- `.android.keystore_base64` → write to `apps/mobile-rn/android/keystores/release.keystore` (decoded)
- `.android.keystore_password`, `.android.key_alias`, `.android.key_password` → inject as env vars or write to `credentials.json`
- `.ios.distribution_cert_p12_base64` → write to `apps/mobile-rn/ios/certs/dist.p12`
- `.ios.distribution_cert_password` → inject
- `.ios.provisioning_profile_base64` → write to `apps/mobile-rn/ios/certs/profile.mobileprovision`
- `.ios.asc_api_key_p8_base64` + `.ios.asc_api_key_id` + `.ios.asc_api_issuer_id` + `.ios.team_id` → consumed by Phase 8 distribution workflow, not Phase 7 build

## Section 6 — VeraCrypt on macOS 2026 + Disk Utility encrypted DMG fallback

**Verified via:** veracrypt.io/en/Downloads.html (CITED), sourceforge.net/p/veracrypt/discussion/general/thread/137169447e (CITED — Sequoia thread), github.com/veracrypt/VeraCrypt/issues/1055 (CITED — FUSE-T issue), support.apple.com/guide/disk-utility/encrypt-protect-a-storage-device-password-dskutl35612 (CITED).

| Property | VeraCrypt on macOS | Disk Utility encrypted DMG |
|----------|---------------------|-----------------------------|
| Installation | Requires FUSE-T (replaces deprecated macFUSE on Apple Silicon). FUSE-T install via Homebrew. Some configs need partial SIP-disable on Apple Silicon. | Built-in (no install). |
| macOS 26 (Tahoe) compatibility | Reports of Sequoia exFAT bugs (Apple-side, not VeraCrypt — affects newly-created exFAT volumes; HFS+ unaffected). macOS 26.2 status: unverified — VeraCrypt forums had not posted Tahoe-specific compatibility notes as of 2026-Q2. | First-class. No third-party dependency. AES-256 supported. |
| Encryption | AES (XTS), Serpent, Twofish, cascades | AES-128 / AES-256 |
| Cross-platform recovery | Yes — VeraCrypt runs on Windows + Linux + macOS, so recovery USB can be opened anywhere | macOS-only (encrypted DMG mounts on macOS — Linux/Windows can't open it natively; for cross-platform recovery use a portable .img + dd) |
| Plausible deniability | Yes (hidden volumes) | No |
| GUI | VeraCrypt.app | Disk Utility.app or `hdiutil` CLI |
| Phase 6 fit | CONTEXT D-07 specifies VeraCrypt | **Recommended alternative** for macOS-only solo-dev scenario: simpler, native, identical AES-256 primitive, no kernel-extension drama |

**Recommendation:** Use encrypted DMG (Pattern 2 above) unless cross-platform recovery is a hard requirement. For solo dev whose only recovery machine is also a Mac, encrypted DMG is strictly better. Update D-07 wording in Plan 06-01 to read "VeraCrypt **or** macOS encrypted DMG (AES-256 via `hdiutil create -encryption AES-256`) — solo dev's choice, encrypted DMG recommended for native simplicity." [ASSUMED: planner agrees with this discretion; if not, fall back to VeraCrypt + FUSE-T install in a Wave 0 prep task.]

**If sticking with VeraCrypt:** Install via `brew install --cask veracrypt` after `brew install --cask macfuse` (or FUSE-T from fuse-t.org). Test mount BEFORE generating the keystore — the worst time to debug VeraCrypt install issues is after the keystore is on RAM disk and the clock is ticking.

## Section 7 — SOPS base64-in-YAML pattern

**Verified via:** github.com/getsops/sops/blob/main/CHANGELOG.md (CITED — confirmed SOPS 3.13.1 latest + `set --value-file` added in 3.11.0), local `sops --version` (VERIFIED 3.13.1 installed).

**Recommended pattern (use `sops set --value-file` for binary fields):**

```bash
# Write a binary file to SOPS as base64-encoded string:
base64 -i <binary-file> > /tmp/value.b64
sops set --value-file /tmp/value.b64 <sops-file> '["<json-path>"]'
# Example:
base64 -i keystore.p12 > /Volumes/SIGN_RAM/keystore.b64
sops set --value-file /Volumes/SIGN_RAM/keystore.b64 \
  .secrets/prod/mobile-signing.yaml '["android"]["keystore_base64"]'

# Read back:
sops -d .secrets/prod/mobile-signing.yaml \
  | yq -r '.android.keystore_base64' \
  | base64 -d > /tmp/keystore-restored.p12
```

**JSON-path argument syntax for `sops set`:**
- Top-level field: `'["key"]'`
- Nested: `'["outer"]["inner"]'`
- Per SOPS 3.13 spec; arguments are JSON-path-style strings, NOT dotted paths. Quoting matters — single-quote the whole string, double-quote the keys.

**Why `set --value-file` over `--set` with shell-piped base64:**

1. **Shell history hygiene.** `sops --set ... "$(base64 -i file)"` puts the entire base64 blob into shell history when the command line is echoed (depending on shell + history config). `sops set --value-file <file>` passes only the filename.
2. **ARG_MAX.** macOS ARG_MAX = 1048576 bytes (verified locally via `getconf ARG_MAX`). A 5KB keystore base64-encodes to ~7KB — fits inside ARG_MAX easily. But: a 200KB iOS provisioning profile base64-encodes to ~270KB; still fits, but value-file is cleaner discipline.
3. **stderr clarity.** Errors from `--value-file` mention the file path; errors from shell-substitution mention "argument too long" which is a confusing wrong direction.
4. **Atomicity.** value-file is read once; shell substitution risks the binary file changing between `$(base64 ...)` evaluation and the SOPS write.

**`yq` flavor:** Use **mikefarah/yq v4** (Go binary; installed via `brew install yq`). NOT the Python `yq` (jq-wrapper for YAML, separate project). Verify with `yq --version` — should print `yq (https://github.com/mikefarah/yq/) version v4.x.x`. The `yq -r '.field'` syntax for raw extraction matches jq.

**Round-trip verification (mandatory after every SOPS write of a binary field):**

```bash
# 1. Decrypt + extract + decode:
sops -d .secrets/prod/mobile-signing.yaml \
  | yq -r '.android.keystore_base64' \
  | base64 -d > /tmp/keystore-rt.p12

# 2. Open the decoded keystore with keytool to confirm structure:
export VER_PASS=$(sops -d .secrets/prod/mobile-signing.yaml | yq -r '.android.keystore_password')
keytool -list -v -keystore /tmp/keystore-rt.p12 -storepass:env VER_PASS \
  | awk '/SHA256:/ {print $2}'
# Must match the original SHA-256 captured during generation (D-19 side-file).
```

## Section 8 — Pitfalls + mitigations (15 items)

1. **Apple Developer Program annual fee not auto-renewed → cert expires → all distribution dies.** Mitigation: enable auto-renewal in App Store Connect → Membership → Account Holder; cross-verify payment method is valid; set calendar reminder 30 days before annual anniversary. [Catastrophic if missed — testers cannot install updates.]
2. **Keystore lost = catastrophic for Android.** No recovery. Mitigation: D-07 two USB backups in two locations + recovery RUNBOOK tested BEFORE the keystore is the only copy. Test the recovery on USB-A by mounting on the dev workstation, restoring the SOPS file + age key, decrypting, and re-extracting the SHA-256 fingerprint to compare against the original. If diff → backup is corrupt → regenerate USB-A before depending on it.
3. **ASC API key file extension confusion.** Apple distributes the key as `AuthKey_<KEYID>.p8`; some examples online strip the `AuthKey_` prefix. Mitigation: base64 the file **as Apple delivered it** (full filename); the field stores raw .p8 bytes regardless of filename — Apple's filename is a convention, not a parser dependency. Document the original filename in a comment in `docs/SECRETS.md` for re-association if you ever forget which `.p8` is which.
4. **macOS Keychain export of distribution cert defaults to a weak/unclear password.** Mitigation: at Keychain Access "Export" dialog, **always** click "Set password" and paste a 32-byte random from `openssl rand -base64 32`. Do NOT accept Keychain's prompt-with-empty-password. Verify by re-importing the `.p12` with the password before committing to SOPS.
5. **keytool 100-year validity triggers Android Studio yellow warning.** No rejection — just a warning ("Certificate validity is unusually long"). Mitigation: document the warning in `docs/SECRETS.md` "Mobile signing — recovery" so future-self / future-dev doesn't think the keystore is broken. Google Play minimum is 25 years; 100 is fine.
6. **SHA-256 fingerprint format mismatch across consumers.** Mapbox dashboard accepts the colon-separated form (`AA:BB:CC:...`); Google APIs Console wants the same; Firebase wants the same; some other tools (rare) want colon-stripped form. Mitigation: capture **both** formats to the evidence side-file:
   ```bash
   keytool ... | awk '/SHA256:/ {print $2}' \
     | tee evidence/keystore-sha256.txt \
     | tr -d ':' > evidence/keystore-sha256-bare.txt
   ```
7. **SOPS `--set` with shell-injected base64 has length limits and shell-history exposure.** Mitigation: use `sops set --value-file <file>` (SOPS ≥ 3.11) per Pattern 1/3. macOS ARG_MAX = 1048576 bytes (verified) — the keystore fits, but discipline matters for the provisioning profile (270KB base64'd) and future-larger artifacts.
8. **VeraCrypt on macOS 26 requires FUSE-T with partial SIP-disable on some Apple Silicon configurations.** Mitigation: prefer Disk Utility encrypted DMG (native, no kernel-ext drama). If sticking with VeraCrypt, do a dry-run install on the dev workstation BEFORE generating the keystore — debugging FUSE-T at the wrong moment is high-risk.
9. **USB stick stored in cold environment can degrade flash memory over years.** Mitigation: rotate the backup every ~3 years (refresh write cycles + re-encrypt against fresh AES-256 key from new password). Schedule the rotation as a calendar reminder titled "SPORT_RECOVERY_A refresh" three years from creation date.
10. **Multiple Apple IDs (personal + dev) — the dev Apple ID owns Apple Developer Program.** Mitigation: confirm during Plan 06-02 Task 0 that the Apple ID used for enrollment is one the solo dev controls long-term (not a throwaway). Document the Apple ID in a `docs/SECRETS.md` "iOS signing" section (just the email, NOT the password — Apple ID password goes to 1Password). The ASC API key + distribution cert are bound to this Apple ID's team; switching Apple IDs requires Apple-side ownership transfer (long, manual process).
11. **macOS `shred` is unavailable; BSD `rm -P` is ineffective on APFS/SSD due to copy-on-write snapshots + wear leveling.** Mitigation: use a RAM disk for ephemeral keystore generation (Pattern 1). `/tmp/` on macOS is APFS-backed; do NOT use it for keystore plaintext.
12. **`.sops.yaml` line 23 still has CI age-key TODO from Phase 2.** Verified — Phase 4 did NOT add a CI age key. Mitigation: Plan 06-01 should explicitly address this in a frontmatter blocker note. Suggested resolution: defer to Phase 7 (when GitHub Actions actually consumes `.secrets/prod/mobile-signing.yaml`). For Phase 6 execution, DEV_A as sole recipient is sufficient — solo dev decrypts locally for the duration of Phase 6.
13. **Mapbox `pk.` token Bundle ID + SHA-256 restriction is a separate follow-up — NOT Phase 6 scope (D-19).** Mitigation: Plan 06-01 produces `evidence/keystore-sha256.txt` only; the actual Mapbox dashboard restriction is a `/gsd-fast mapbox-restrict` task post-Phase 6. The planner should NOT smuggle this into Phase 6 task lists.
14. **App Manager API key has different scope than App Manager user role.** Confusing because Apple reuses the role name across two distinct permission systems. **For API keys, App Manager has TestFlight + build-upload access** (verified via fastlane docs). **For App Store Connect web UI users, App Manager has even broader access** (including app metadata, app store page, etc.). Mitigation: document this distinction in `docs/SECRETS.md` so a future-self confused by the apparent overlap doesn't escalate the API key to Admin "to be safe."
15. **`.p8` file is downloaded only once — re-download not possible.** Mitigation: immediately after ASC UI download (Plan 06-02 Task 4), `base64 -i AuthKey_<KEYID>.p8` and `sops set --value-file` BEFORE moving the file to Trash. Do NOT skip the SOPS write thinking "I'll get back to it" — Trash empty + missing SOPS write = revoke key in ASC + create a new one (free, but annoying).

## Code Examples

> Code examples are inline throughout §1-§7 above (Pattern 1, Pattern 2, Pattern 3, and verification snippets). All examples are 2026-current per verified sources at the top of each section.

## State of the Art

| Old Approach | Current Approach (2026) | When Changed | Impact |
|--------------|-------------------------|--------------|--------|
| JKS keystore format | PKCS12 (keytool default) | JDK 9 (2017) deprecated JKS | Both still work; Android Gradle Plugin accepts both; PKCS12 portable |
| "iOS Distribution" certificate | "Apple Distribution" certificate | 2019 unification | iOS Distribution still exists for legacy, but new certs should be Apple Distribution |
| Apple Developer web-only enrollment for Individual | Apple Developer **app**-based enrollment (Face ID / Touch ID / T2 attestation) | ~2023 transition | Old web flow being deprecated; need iOS/iPad/T2-Mac device |
| Username + password auth for App Store Connect upload | App Store Connect API key (JWT) | ~2020 Apple introduced | API key now preferred; username/password being deprecated |
| macFUSE for VeraCrypt on macOS | FUSE-T (Apple-API-friendlier) | ~2023 for Apple Silicon | Old macFUSE requires kernel-extension approval; FUSE-T uses NFS-style userspace |
| `sops --set` shell-substitution for binary values | `sops set --value-file <path>` | SOPS 3.11 (2024) | Cleaner, no shell-history leak, no ARG_MAX risk |
| `srm` for secure file delete on macOS | (removed in macOS Sierra 2016); use RAM disk for ephemeral files | macOS Sierra 2016 | `rm -P` survives but is ineffective on APFS |

**Deprecated/outdated (do not use):**

- `srm` (removed from macOS in Sierra; not coming back)
- Web-only Apple Developer enrollment for Individuals (still works but actively migrating to app-based)
- iTunes Connect (renamed to App Store Connect ~2018; the URL `appstoreconnect.apple.com` is current)
- macFUSE on Apple Silicon for VeraCrypt (use FUSE-T)
- Fastlane Match for solo-dev annual cert renewal (overkill; D-18 confirmed)

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | macOS 26.2 (Tahoe) is fully compatible with VeraCrypt + FUSE-T 2026 nightly. **Not verified directly** — VeraCrypt forums had no Tahoe-specific threads at the time of research. | §6 | If VeraCrypt fails on macOS 26, fall back to Disk Utility encrypted DMG (already the recommended alternative); minimal blast radius |
| A2 | App Manager API-key role permissions are the same in 2026 as they were in 2023-2024 (uploads + TestFlight + metadata). Verified via fastlane docs + aso.dev mirror, but Apple's first-party documentation page returned 404 during research. | §2 | If Apple has silently reduced App Manager scope, Plan 06-02 ASC API key may fail to upload — quick fix is re-create as Admin role. Recover time: 5 minutes |
| A3 | The `.sops.yaml` recipient list as committed reflects current state. **Verified** via `Read` of `/Users/ismail/Desktop/projects/sport/.sops.yaml` — DEV_A is sole recipient, CI key TODO open. Risk of drift is low (file is git-committed). | §"Runtime State Inventory" + Pitfall 12 | Low — file is current at research time |
| A4 | Phase 4 did NOT add a CI age key to `.sops.yaml`. **Verified by absence:** the file's recipient list shows only DEV_A and a comment `CI deploy key (Phase 4) appended here once issued.` — i.e., the comment is the original Phase 2 TODO unchanged. | Pitfall 12 + §"Runtime State Inventory" | If Phase 4 added the CI key via a different mechanism (e.g., environment variable in CI workflow), Phase 6's mobile-signing.yaml will simply be DEV_A-only and the CI key add is a Phase 7 concern. Low risk. |
| A5 | Apple Developer review SLA degradation to 2-7 weeks in early 2026 (verified via apple-dev forums thread) will not have improved by the time the solo dev enrolls. **Assumed** based on recent forum posts. | §1 | If review is fast (e.g., 24-48h), Phase 6 closes faster. If slow, Plan 06-02 already accounts for the pause (`expected_pause_max: "7 weeks"`). Either way, no plan rewrite needed. |
| A6 | Switching CONTEXT D-04 keystore format from JKS to PKCS12 is acceptable to the user (Claude discretion area). | §4 + §"Standard Stack" alternatives | Low — Android Gradle Plugin accepts both. If user insists on JKS, swap `-storetype PKCS12` → `-storetype JKS` in Pattern 1; no other change. |
| A7 | Switching VeraCrypt to encrypted DMG is acceptable to the user (Claude discretion area). | §6 | Low — both produce AES-256 encrypted USB backup. If user insists on VeraCrypt, install FUSE-T in a Wave 0 prep task. |

## Open Questions

1. **Should Phase 6 add the CI age key to `.sops.yaml` (and re-key via `sops updatekeys`), or defer to Phase 7?**
   - What we know: `.sops.yaml` line 23 still has the Phase 2 TODO open. Phase 4 did not add a CI key.
   - What's unclear: whether Plan 06-01 should produce a CI age key now (a one-line `age-keygen` + commit + `sops updatekeys`) or defer.
   - Recommendation: **defer to Phase 7** (when GitHub Actions actually needs decrypt access). Plan 06-01 should explicitly note the deferral in its frontmatter so it's an acknowledged carry-over, not an accidental gap. Solo dev's local `~/.config/sops/age/keys.txt` is sufficient for all Phase 6 operations.

2. **Should the encrypted-DMG password be the same for both USB-A and USB-B, or different?**
   - What we know: D-07 specifies two USBs at two locations; CONTEXT does not specify whether passwords match.
   - What's unclear: usability vs blast-radius tradeoff.
   - Recommendation: **same password for both** (single 32-byte random in 1Password sealed entry per Phase 2 D-04 pattern) — if the password is lost, both USBs are equally affected, and the recovery card's mnemonic hint is the third channel. Different passwords double the loss surface (must remember both, must store both, must rotate both).

3. **Where physically to place USB-B (D-07 says "elsewhere — user picks")?**
   - What we know: D-07 mentions options: parents' house / friend's safe / safe deposit box.
   - What's unclear: which is the solo dev's actual choice for this project.
   - Recommendation: defer to USER ACTION at Plan 06-01 final task. Pause and ask user, log the answer (sanitized — e.g., "USB-B at Y location") in `06-01-SUMMARY.md`. NOT in evidence/ side-file (don't want a literal map of the backup to live in git).

4. **iOS Apple ID — personal or dedicated dev account?**
   - What we know: the solo dev may have a personal Apple ID already (email visible in CLAUDE.md: `hummetzadeismail8@gmail.com`).
   - What's unclear: whether to enroll the Apple Developer Program under the personal Apple ID (immediate, no email migration) or to create a project-specific one (cleaner separation, but adds an Apple ID to manage forever).
   - Recommendation: **personal Apple ID is fine for closed-beta solo dev.** Mention this in Plan 06-02 Task 0 USER ACTION as the default. If user wants separation, swap before kickoff.

5. **Should the paper recovery card include the SOPS file's age key, or just a hint?**
   - What we know: D-07 says "VeraCrypt passphrase hint (NOT the passphrase itself — a mnemonic), reminder that age key is on this USB, location of the OTHER USB, restoration bash cheat-sheet."
   - What's unclear: whether the cheat-sheet should include actual decrypt commands.
   - Recommendation: **yes, include the bash cheat-sheet** with full commands and placeholder for the password. Future-self under recovery stress should not have to look up `yq` syntax. Example skeleton in `evidence/recovery-card-template.md`.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| macOS | Phase 6 entirely (keystore generation, Keychain, hdiutil) | ✓ | 26.2 (Tahoe) | None — Phase 6 is macOS-only |
| `sops` | SOPS encryption | ✓ | 3.13.1 (≥ 3.11 required for `set --value-file`) | None — SOPS is project standard since Phase 2 |
| `keytool` | Android keystore generation | ✓ | JDK-bundled at `/usr/bin/keytool` | None — keytool is the only sane tool for `.jks`/`.p12` |
| `openssl` | Password generation | ✓ | 3.0.18 | macOS built-in `/usr/bin/openssl` is older but adequate |
| `yq` | SOPS extract for recovery | ✓ | 4.53.2 (mikefarah Go) | If missing: `brew install yq` |
| `hdiutil` | RAM disk + encrypted DMG | ✓ | macOS built-in | None — required |
| `base64` | Binary-to-YAML encoding | ✓ | BSD built-in | None — required |
| `security` CLI | Provisioning profile UUID extraction | ✓ | macOS built-in | None — required |
| `plutil` | Mobileprovision parsing | ✓ | macOS built-in | None — required |
| Apple Developer Program | Section 1-3 entirely | ✗ (must enroll) | — | None — Phase 6 deliverable IS enrollment |
| Apple Developer app on iOS/iPad/Mac | Enrollment biometric attestation | ASSUMED ✓ (solo dev has iPhone per LAUNCH-01 testing on own iPhone) | — | Mac with T2/Apple Silicon (the dev workstation is Apple Silicon — verified via `sw_vers` macOS 26.2 native) is a fallback |
| iOS or T2/Silicon Mac for enrollment | Apple Developer app | ✓ (dev workstation macOS 26.2 = Apple Silicon native) | — | None needed — workstation suffices |
| 1Password (sealed entries for passwords + Apple ID) | Phase 2 D-04 + Phase 6 password storage | ASSUMED ✓ (Phase 2 D-04 references 1Password sealed entries) | — | If 1Password unavailable, use macOS Keychain "Secure Notes" as fallback |
| VeraCrypt (CONTEXT D-07) | USB backup encryption | ✗ (not installed) | — | **Disk Utility encrypted DMG (recommended fallback; native; AES-256)** |
| USB sticks (×2) | D-07 offline backups | ASSUMED ✗ | — | Plan must include "user supplies 2 USB sticks ≥ 256MB" as Plan 06-01 prerequisite |

**Missing dependencies with no fallback:** Apple Developer Program enrollment ($99 + biometric attestation) — this IS the deliverable, not a prerequisite. Cannot proceed in Plan 06-02 without it.

**Missing dependencies with fallback:** VeraCrypt → encrypted DMG (preferred); `yq` not installed → `brew install yq` (single command).

## Validation Architecture

> Phase 6 is **operational/secret-management**, not code-shipping. Traditional unit-test coverage does not apply. Validation = round-trip verification + RUNBOOK execution + side-file diff.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Bash scripts + `diff` + `keytool -list` verification (no `pytest`/`jest` here) |
| Config file | None — verification commands inline in Plan task definitions |
| Quick run command | (per-task verification inline in Plan; see Pattern 1 round-trip block) |
| Full suite command | Plan 06-01 + 06-02 closeout = SUMMARY.md checklists confirming all evidence files exist |
| Phase gate | All evidence files exist + SHA-256 round-trip diff = empty + sops -d on mobile-signing.yaml returns parseable YAML + sops -d on USB-A + USB-B mounted volumes returns the same YAML |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| SIGN-01 | Keystore exists in SOPS + round-trip decrypts | smoke | `sops -d .secrets/prod/mobile-signing.yaml \| yq -r .android.keystore_base64 \| base64 -d \| keytool -list -keystore /dev/stdin -storepass:env VER_PASS \| grep SHA256` | written by Plan 06-01 |
| SIGN-01 | SHA-256 fingerprint side-file matches keystore | smoke | `diff evidence/keystore-sha256.txt <(sops -d ... \| extract-and-fingerprint)` | written by Plan 06-01 |
| SIGN-01 | USB-A mounts + decrypts + matches SOPS | manual-only | Plug USB, mount encrypted DMG, run `sops -d`, compare to live `.secrets/prod/mobile-signing.yaml` byte-for-byte | manual — Plan 06-01 USER ACTION final task |
| SIGN-01 | USB-B mounts + decrypts + matches SOPS | manual-only | Same as USB-A, repeated for USB-B | manual — Plan 06-01 USER ACTION final task |
| SIGN-02 | iOS distribution `.p12` round-trips | smoke | `sops -d .secrets/prod/mobile-signing.yaml \| yq -r .ios.distribution_cert_p12_base64 \| base64 -d \| openssl pkcs12 -info -passin env:VER_P12` | written by Plan 06-02 |
| SIGN-02 | Provisioning profile UUID matches stored field | smoke | `security cms -D -i <(sops -d ... \| yq -r .ios.provisioning_profile_base64 \| base64 -d) \| plutil -extract UUID raw - == sops -d ... \| yq -r .ios.provisioning_profile_uuid` | written by Plan 06-02 |
| SIGN-02 | ASC API key parseable + Key ID + Issuer ID present | smoke | `sops -d ... \| yq -r .ios.asc_api_key_p8_base64 \| base64 -d \| openssl ec -in /dev/stdin -text -noout` (verifies PEM structure) | written by Plan 06-02 |
| SIGN-02 | `docs/SECRETS.md` extended with "Mobile signing — recovery" section | doc-check | `grep -q '## Mobile signing' docs/SECRETS.md && grep -q '### Scenario (a)' docs/SECRETS.md` | written by Plan 06-01 + 06-02 |

### Sampling Rate

- **Per task commit:** inline smoke command for the specific field just written (e.g., after writing keystore_base64, immediately run the round-trip check)
- **Per plan closeout:** full SOPS decrypt + all 8 field round-trips + USB mount tests
- **Phase gate:** SUMMARY.md checklist of every smoke command passed, evidence side-files present, USB tests confirmed

### Wave 0 Gaps

- [ ] `yq` install verified (`brew install yq` if absent)
- [ ] VeraCrypt **or** Disk Utility (built-in) confirmed available per discretion choice
- [ ] 2 USB sticks ≥ 256MB confirmed available (user prerequisite)
- [ ] Solo dev has Apple ID with 2FA enabled (Plan 06-02 prerequisite)
- [ ] Solo dev has biometric-capable device (iPhone OR T2/Silicon Mac — workstation suffices)
- [ ] `evidence/` subdirectory created (`mkdir -p .planning/phases/06-release-signing/evidence`)
- [ ] `.sops.yaml` CI age key TODO acknowledged in Plan 06-01 frontmatter (decision to defer to Phase 7)

## Security Domain

> `security_enforcement` is implicit/enabled per repo convention (Phase 2 SEC-* requirements). Phase 6 is secret-generation, so ASVS Cryptography (V6) + Stored Cryptography categories are the primary focus.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (Apple ID 2FA) | Apple's built-in 2FA enforcement |
| V3 Session Management | no | Phase 6 is one-shot offline; no sessions |
| V4 Access Control | yes (SOPS recipient list) | age recipient-based access; DEV_A + future CI key |
| V5 Input Validation | yes (base64 round-trip) | `keytool -list` post-decrypt validates structure |
| V6 Cryptography | yes (RSA-4096, AES-256, age X25519/ChaCha20) | All from standard libraries: keytool, hdiutil, age. **Never hand-roll.** |
| Stored Cryptography | yes (keystore at rest in SOPS) | SOPS + age (X25519 + ChaCha20-Poly1305); base64-in-YAML field |
| Backup & Recovery | yes (2 USB backups + recovery card + RUNBOOK) | Two physical locations + paper card + tested recovery procedure |

### Known Threat Patterns for Mobile Signing Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Keystore plaintext leak via temp file | Information Disclosure | RAM disk (Pattern 1); plaintext never on SSD |
| Password leak via shell history | Information Disclosure | `-storepass:env` instead of CLI arg; `unset` after; turn off HISTFILE for the session |
| Password leak via `ps`/`/proc` | Information Disclosure | Same — env var, not CLI arg |
| Apple ID account takeover | Elevation of Privilege / Spoofing | 2FA mandatory; consider hardware security key on the Apple ID |
| USB backup theft + decryption | Information Disclosure | AES-256 encrypted DMG with long passphrase; passphrase NOT on the USB; recovery card has hint only |
| USB backup flash degradation | Denial of Service (data loss) | Two physical copies; refresh every ~3 years |
| CI age key compromise | Information Disclosure | Defer adding CI key until Phase 7 actually needs it; isolate CI key to a dedicated GitHub Actions secret |
| Mapbox `pk.` token misuse | Tampering / DoS (quota abuse) | Bundle ID + SHA-256 restriction (Phase 6 produces fingerprint; restriction is a follow-up post-Phase 6 per D-19) |
| ASC API key leak (build pipeline) | Elevation of Privilege | App Manager role limits blast radius; revoke + reissue in 5 min via App Store Connect UI |
| Apple Distribution cert revocation (by Apple) | DoS | Annual renewal flow documented in `docs/SECRETS.md` (D-15 scenario d); existing TestFlight builds keep working until expiry |
| Single age recipient = single point of failure | DoS (data loss) | Mitigated by 1Password sealed entry + 2 USB backups (Phase 2 D-04); CI key addition is Phase 7 |

## Sources

### Primary (HIGH confidence)

- **Apple Developer Program enrollment 2026:** developer.apple.com/programs/enroll/ ; developer.apple.com/help/account/membership/enrolling-in-the-app/ ; developer.apple.com/help/account/membership/program-enrollment/
- **Apple Developer review SLA (early 2026):** developer.apple.com/forums/thread/820213
- **App ID + Cert + Profile order:** developer.apple.com/help/account/identifiers/register-an-app-id/ ; developer.apple.com/help/account/provisioning-profiles/create-an-app-store-provisioning-profile/
- **Apple Distribution vs iOS Distribution (rename history):** capawesome.io/blog/ios-certificates-and-provisioning-profiles-explained/ ; bluelabellabs.com/blog/generate-apple-certificates-provisioning-profiles/
- **EAS local credentials schema + eas.json `credentialsSource`:** docs.expo.dev/app-signing/local-credentials/ ; docs.expo.dev/build-reference/local-builds/ ; docs.expo.dev/eas/json/
- **Expo SDK 54 + EAS Build local support:** docs.expo.dev/build/introduction/ ; docs.expo.dev/eas/cli/
- **SOPS 3.13.1 changelog + `set --value-file`:** github.com/getsops/sops (CHANGELOG.md), local `sops --version` verification
- **keytool spec:** docs.oracle.com/en/java/javase/17/docs/specs/man/keytool.html ; medium.com/@devsanflutter Java/Keytool/Fingerprints
- **Google Play minimum 25y signing-cert validity:** support.google.com/googleplay/android-developer/answer/9842756
- **SHA-256 fingerprint via keytool:** support.google.com/android-developer-console/answer/16641489 ; support.google.com/googleplay/android-developer/answer/16641489
- **macOS encrypted DMG (Disk Utility / hdiutil AES-256):** support.apple.com/guide/disk-utility/encrypt-protect-a-storage-device-password-dskutl35612/mac

### Secondary (MEDIUM confidence)

- **App Store Connect API key roles + App Manager scope:** aso.dev/app-store-connect/api-key-access-levels/ ; aso.dev/app-store-connect/user-roles/ ; aso.dev/app-store-connect/api-key/ (Apple's first-party role-permissions page returned 404 during research — aso.dev is well-regarded third-party mirror)
- **Fastlane pilot role requirements (App Manager sufficient for upload + testers):** docs.fastlane.tools/actions/pilot/ ; docs.fastlane.tools/actions/upload_to_testflight/ ; docs.fastlane.tools/app-store-connect-api/
- **PKCS12 vs JKS Android Gradle Plugin compatibility:** medium.com/ama-xperteye Signing-APKs-or-libraries-for-release ; github.com/forgo/keystore-gradle-plugin
- **100-year validity Android Studio warning behavior:** codegenes.net/blog/how-to-create-an-android-keystore-rsa-key-with-infinite-validity/

### Tertiary (LOW confidence — flagged for validation)

- **VeraCrypt on macOS 26 (Tahoe):** sourceforge.net/p/veracrypt VeraCrypt-on-macOS-Sequoia thread (covers Sequoia 15, not Tahoe 26); github.com/veracrypt/VeraCrypt/issues/1055 (FUSE-T request still open) — **macOS 26-specific compatibility status not verified.** Mitigated by recommending encrypted-DMG fallback (native, no third-party dependency).
- **Apple Developer review wait time exact distribution in May 2026:** developer.apple.com forums (anecdotal) — actual median wait may be shorter or longer than the reported 2-7 week range.

## Metadata

**Confidence breakdown:**

- Standard stack (sops, yq, keytool, hdiutil, openssl): HIGH — all verified via local execution + primary documentation
- Architecture patterns (RAM disk, encrypted DMG, base64-in-YAML, round-trip diff): HIGH — primary Apple docs + SOPS changelog + Expo docs all confirm
- Apple Developer enrollment 2026 flow: HIGH — multiple primary sources (developer.apple.com/programs/enroll + apple developer help) confirm $99 + 2FA + biometric attestation
- ASC API key App Manager role scope: MEDIUM — Apple first-party 404'd; fastlane + aso.dev sources concur but absent Apple direct confirmation
- VeraCrypt on macOS 26: LOW — no Tahoe-specific verification; recommend fallback
- Pitfalls list: HIGH — derived from CONTEXT D-15 + cross-verified with primary docs
- Phase 4 CI age-key status: HIGH (negative finding) — verified via `Read` of `.sops.yaml` and Phase 4 SUMMARY scans

**Research date:** 2026-05-20
**Valid until:** 2026-08-20 for Apple enrollment flow (Apple periodically revamps); 2026-06-20 for SOPS version pin (active development); indefinite for keytool flags + Mapbox SHA-256 format

---

*Phase: 6-release-signing*
*Research conducted: 2026-05-20 — 22 CONTEXT decisions cross-verified against 2026-current primary documentation; 3 Claude-discretion areas flagged (keystore format JKS→PKCS12, USB encryption VeraCrypt→encrypted DMG, SOPS `--set`→`set --value-file`); 1 carry-over blocker surfaced (`.sops.yaml` CI age key TODO from Phase 2 still open).*
