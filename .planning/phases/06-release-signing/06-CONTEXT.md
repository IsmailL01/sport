# Phase 6: Release signing - Context

**Gathered:** 2026-05-20 (autonomous mode per standing instruction — no AskUserQuestion; decisions selected from prior-phase patterns + closed-beta lean scope)
**Status:** Ready for planning

<domain>
## Phase Boundary

Generate, encrypt, and back up the **two most-critical secrets** in the project lifecycle:

1. **Android release keystore** — Java keystore (`.jks`) signed with a 4096-bit RSA key, 100-year validity. Single alias. Generated once; loss = every existing install on every closed-beta tester's device dies on the next signed update (Android refuses to install an APK signed with a different key than the previous one). Two offline physical backups.
2. **iOS Apple Developer Program enrollment + distribution credentials** — Apple Developer Program Individual enrollment ($99/year), distribution certificate (P12), distribution provisioning profile (`.mobileprovision`) bound to bundle ID `com.runningecosystem.mobile`, App Store Connect API key (`.p8`) with App Manager role for unattended TestFlight uploads. Self-managed in SOPS, NOT EAS-managed.

**Scope anchor:** Phase 6 generates + persists the credentials. Phase 7 consumes them at build time (EAS production profile). Phase 8 consumes them at distribution time (TestFlight upload, signed APK on Caddy manifest). Phase 6 does NOT touch `eas.json` build config, NOT run any EAS build, NOT publish anything.

**Why "most-critical":** Per ADR-0011 closed-beta scope, mobile crash reporting is dropped (no automated recovery from a botched build), pgBackRest restore drills are dropped (no automated recovery from DB loss), 8-device matrix dropped, 48h soak dropped. The keystore + iOS cert are the ONE pair of secrets where losing them is genuinely catastrophic + unrecoverable (Android forces signed-by-same-key for updates; Apple revokes distribution and the cert chain has to rebuild). The backup discipline here is load-bearing for the whole closed-beta program.

</domain>

<decisions>
## Implementation Decisions

### SOPS layout for mobile signing

- **D-01:** SOPS slot = **single file** `.secrets/prod/mobile-signing.yaml`. Both Android keystore + iOS cert/profile/ASC bundled in one file (a single signing bundle managed together). Why: closed-beta = prod-only scope (no separate staging/dev signing — EAS dev/preview profiles use Expo's debug keystore which is automatic + non-secret). Adding `staging/` + `dev/` slots that are guaranteed to stay empty is dead weight. Existing SOPS pattern is `.secrets/<env>/<group>.yaml` (per Phase 2 D-02); `mobile-signing` is a new group orthogonal to `shared` / `mapbox` / `oauth` / `sentry`.

- **D-02:** SOPS encoding = **base64 inside YAML fields**, NOT `--input-type binary` per-file. Why: keeps SOPS-native YAML format (diff-able + `sops --set` works for non-binary fields like passwords + IDs); CI extracts binaries via `sops -d .secrets/prod/mobile-signing.yaml | yq -r .android.keystore_base64 | base64 -d > keystore.jks`. Matches the way Mapbox tokens are stored as strings in `.secrets/<env>/mapbox.yaml`. The keystore is ~3-5KB after base64; well within YAML field practical size.

- **D-03:** Decrypted YAML structure:
  ```yaml
  android:
    keystore_base64: <base64 of .jks bytes>
    keystore_password: <store password — 32-byte random>
    key_alias: runningecosystem-release
    key_password: <key password — same as keystore_password for single-alias keystore per keytool convention>
  ios:
    distribution_cert_p12_base64: <base64 of .p12>
    distribution_cert_password: <p12 export password>
    provisioning_profile_base64: <base64 of .mobileprovision>
    provisioning_profile_uuid: <UUID from profile, useful for CI debug>
    team_id: <Apple Team ID — populated after enrollment>
    asc_api_key_p8_base64: <base64 of AuthKey_XXXXXXX.p8>
    asc_api_key_id: <Key ID from ASC>
    asc_api_issuer_id: <Issuer UUID from ASC>
  ```

### Android keystore generation + recovery

- **D-04:** Keystore generation environment = **solo-workstation one-shot**, NOT air-gapped machine. Procedure: `keytool -genkeypair -alias runningecosystem-release -keystore /tmp/runningecosystem.keystore.jks -keyalg RSA -keysize 4096 -validity 36500 -storetype JKS -dname "CN=Running Ecosystem, OU=Mobile, O=Running Ecosystem, L=<city>, ST=<state>, C=<country>"` → immediately base64-encode → `sops --set` into `.secrets/prod/mobile-signing.yaml` → `shred -u /tmp/runningecosystem.keystore.jks`. Plaintext keystore touches disk for ~30 seconds. Why: air-gapped machine = funded-team paranoia (extra hardware, ceremonial overhead). Closed-beta blast radius (5-10 friend testers) doesn't warrant it; the bigger risk is operational complexity discouraging the solo dev from generating the keystore at all.

- **D-05:** Keystore alias = `runningecosystem-release`. **Single alias** per keystore (one-app-one-cert). Why: simpler ProGuard config in Phase 7 (no `keyAlias`/`storePassword`/`keyPassword` triple-config drama); no rotation surface; matches Android best practice.

- **D-06:** Validity period = **100 years** (`-validity 36500`). Android forces app updates to be signed with the same key as the previous install forever. Premature expiry = every existing install dies + cannot update. 100 years is the de-facto standard (longer than the projected lifetime of either Android or this developer).

- **D-07:** Two offline physical backups = **two VeraCrypt-encrypted USB sticks**, separate physical locations. Each USB contains:
  1. The SOPS age private key (`~/.config/sops/age/keys.txt`) — needed to decrypt anything
  2. A copy of `.secrets/prod/mobile-signing.yaml` (still SOPS-encrypted — defense-in-depth: even if the USB falls into the wrong hands, the SOPS layer still requires the age key, and the age key is on the same USB but VeraCrypt-volume-encrypted)
  3. A printed paper recovery card (laminated) with: VeraCrypt passphrase hint (NOT the passphrase itself — a mnemonic), reminder that `age` key is on this USB, location of the OTHER USB, restoration `bash` cheat-sheet (8-line script: mount VeraCrypt → copy keys → run `sops -d` → extract keystore via `yq` + `base64 -d` → done)

  Locations: one USB at dev's home (locked drawer), one USB elsewhere (parents' house / friend's safe / safe deposit box — user picks the specific location during Plan 06-01 USER ACTION). The same backup pattern mirrors **Phase 2 D-04** ("age private key in 1Password sealed entry per dev + encrypted USB physical backup per dev") — the keystore travels alongside the age key on the same physical artifact.

- **D-08:** Keystore + key passwords = **32-byte random**, generated via `openssl rand -base64 32`. Same password for both keystore-level + key-level (single-alias keystore convention). Stored in the same SOPS file (`.secrets/prod/mobile-signing.yaml` fields `keystore_password` + `key_password`). The passwords are SOPS-encrypted at rest; the keytool command at generation time reads them via env var to avoid them ever appearing in shell history.

### iOS Apple Developer + distribution credentials

- **D-09:** Apple Developer Program enrollment = **Individual** ($99/year), NOT Organization. Why: solo dev with no legal entity. Individual enrollment is faster (no D-U-N-S number required), $99/year same as Organization, but dev's legal name appears in TestFlight + App Store. For closed-beta friend distribution this is acceptable (testers know who you are). Upgrade to Organization deferred to public-launch milestone if/when project incorporates — Apple supports migrating individual → organization without re-signing existing apps, so this is reversible.

- **D-10:** iOS distribution cert + provisioning profile = **self-managed via SOPS**, NOT EAS Cloud-managed credentials. Why: matches Phase 4's "no vendor lock-in" pattern (chose save/scp/load deploy over GHCR pull-auth). EAS Cloud-managed credentials trade convenience for vendor dependency — Expo holds your keys; if Expo's service degrades or you ever leave EAS, you re-issue. Self-managed = full control + portability + the same SOPS backup strategy as the Android keystore. Higher friction acceptable for solo-dev "I am the only person who can recover this" reality. Phase 7 will reference these via `eas.json` env vars; Phase 8 will reference these for TestFlight upload.

- **D-11:** ASC API key role = **App Manager** (NOT Admin). App Manager scope covers: upload builds via `xcrun altool` / `fastlane pilot` / EAS submit, manage TestFlight build availability, invite TestFlight testers. Admin = full account control (overkill, principle-of-least-privilege violated). Developer = read-only build status (insufficient for upload). App Manager is the Goldilocks role.

- **D-12:** Bundle ID + applicationId **LOCKED** at `com.runningecosystem.mobile` (already in `apps/mobile-rn/app.json` lines 22 + 30). Apple binds this to the signing identity at first registration and cannot be reused with the same Apple ID once registered. The same string is used for both iOS bundle identifier + Android applicationId — they don't conflict (different stores) and matching keeps developer mental model simple. NO staging vs prod variant for closed beta (`com.runningecosystem.mobile.staging` deferred to v1.1 if/when a staging mobile build becomes useful).

- **D-13:** Provisioning profile type = **App Store** (NOT Ad Hoc, NOT Development). App Store profiles are required for TestFlight uploads; Ad Hoc requires manual UDID registration per tester (high friction at 5-10 testers, breaks down at scale); Development is for Xcode-tethered debug builds. TestFlight uses App Store profiles internally, so this is the only correct choice.

### SOPS recipient + access control

- **D-14:** SOPS recipients update — **add CI age key** (the 3rd recipient mentioned in Phase 2 D-04: "CI gets a 3rd age key when Phase 4 wires GitHub Actions"). Verify it was added in Phase 4. If yes, no change needed; CI can already decrypt new `.secrets/prod/mobile-signing.yaml`. If no, Phase 6 Plan 06-01 adds it. Solo dev's age key remains the only personal recipient (no team to add).

### Recovery playbook scope

- **D-15:** Extend `docs/SECRETS.md` with new section **"Mobile signing — recovery"**. Cover 4 scenarios:
  - **(a) Age key lost on workstation** → restore from USB. Steps: insert USB → mount VeraCrypt volume → `cp /Volumes/<vc>/age-keys.txt ~/.config/sops/age/keys.txt` → verify via `sops -d .secrets/prod/mobile-signing.yaml | head -1`. ~5 min recovery.
  - **(b) Age key lost everywhere (both USBs lost / destroyed + workstation lost)** → CATASTROPHIC. App dies for existing testers. Document the "what to tell testers" message template. Document mitigation: this is why we have 2 USBs in 2 physical locations + 1Password sealed (per Phase 2 D-04). Probability of all 3 failing simultaneously approaches zero.
  - **(c) Keystore corrupted but age key OK** → keystore is base64-encoded inside the SOPS file, so corruption is improbable (SOPS YAML is text), but if the SOPS file itself is damaged: `git restore .secrets/prod/mobile-signing.yaml` from git history (it's committed encrypted). If git history is also lost: scenario (b). The keystore_base64 field is small enough (~5KB) that you'd notice file truncation visually before pushing a broken commit.
  - **(d) iOS distribution cert expires (annual) or is revoked** → regenerate via Apple Dev portal. Steps: log in → Certificates → Distribution → revoke old → generate new → download `.cer` + private key from Keychain → export `.p12` → base64 → `sops --set .secrets/prod/mobile-signing.yaml '["ios"]["distribution_cert_p12_base64"]'` → commit. Provisioning profile needs regeneration (auto-detected by Apple portal when cert changes). Existing TestFlight builds keep working until expiry; new builds need new cert. Plan annual reminder via `gh secret set RENEWAL_REMINDER_DATE` or calendar entry.

### Plan structure + execution order

- **D-16:** Plan 06-01 (Android keystore) executes **before** 06-02 (iOS). Sequential, not parallel. Why: 06-01 creates the SOPS slot `.secrets/prod/mobile-signing.yaml` (initially with only the `android:` section + empty `ios:` placeholders); 06-02 fills in the `ios:` section after Apple Developer enrollment completes. If 06-02 ran first/parallel, both plans would race to create the file. Strict serial avoids the race.

- **D-17:** USER ACTION checkpoints (both plans are `autonomous: false`):
  - **Plan 06-01 Task N (final)** = solo dev physically places 2 USB backups in 2 separate locations. Cannot be automated. Plan pauses for user confirmation: "Backup 1 placed at: ___. Backup 2 placed at: ___. Confirm both VeraCrypt volumes mounted successfully on test before final commit."
  - **Plan 06-02 Task 0 (first)** = solo dev enrolls in Apple Developer Program (Individual, $99/year). Pauses for user to provide: Apple Team ID (10-character alphanumeric, found in Account → Membership). All other iOS work (cert generation, provisioning profile, ASC API key) follows in subsequent tasks once Team ID is in hand.

- **D-18:** Plan 06-02 does NOT use Apple's `developer.apple.com/account` automation tools (Fastlane Match, etc.) at this phase. Why: those tools manage cert/profile rotation across multiple devs; for solo dev with one-time setup, the Apple Developer web portal UI is simpler. Document the UI clicks in `docs/SECRETS.md §"iOS signing"`. Fastlane Match consideration deferred to v1.1 if cert renewal becomes a recurring chore.

### Phase 2 closeout dependencies

- **D-19:** Phase 6 unblocks a deferred item from Phase 2 — Mapbox token Bundle ID + SHA-256 restriction tightening. Per `docs/SECRETS.md §Mapbox pk. playbook`, the `pk.` token should be restricted to `com.runningecosystem.mobile` bundle + the production keystore's SHA-256 fingerprint. The SHA-256 fingerprint can only be extracted AFTER the keystore exists (via `keytool -list -v -keystore <jks> | grep SHA256`). Plan 06-01 Task M = capture the SHA-256 fingerprint to a side file (`.planning/phases/06-release-signing/evidence/keystore-sha256.txt`) so the user can apply the Mapbox dashboard restriction during a follow-up `/gsd-fast mapbox-restrict` task — NOT in Phase 6 scope to actually do the restriction (it's a UI click on Mapbox dashboard), but Phase 6 produces the artifact that enables it.

### Out of scope (deferred to other phases)

- **D-20:** `eas.json` production profile credential references → **Phase 7** scope. Phase 6 produces the credentials in SOPS; Phase 7 wires them into the build via `eas.json` env block + `extends` + `EAS_BUILD_CREDENTIALS_FILE` env. The "local vs EAS Cloud build" trade-off (full self-managed vs Expo holds intermediate state) lives in Phase 7 discuss.
- **D-21:** ASC API key actual upload workflow → **Phase 8 (DIST-02)** scope. Phase 6 stashes the `.p8` in SOPS; Phase 8's `.github/workflows/ios-release.yml` reads it via `gh secret set ASC_API_KEY` → `xcrun altool --apiKey ${KEY_ID} --apiIssuer ${ISSUER_ID}`.
- **D-22:** TestFlight internal group seeding (Apple IDs of 5-10 testers) → **Phase 8 (DIST-02)** scope. Phase 6 ensures the ASC API key has App Manager role; Phase 8 actually invites testers.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project decision history
- `docs/DECISIONS/0011-scope-reset-to-closed-beta-lean.md` — closed-beta lean scope ADR; explains why Phase 6 consolidates AND-SIGN-* + IOS-SIGN-* into SIGN-01..02 + dropped sub-IDs (SLSA provenance attestation explicitly best-effort, reproducible-build verification deferred)
- `docs/DECISIONS/0007-v1.0-release-contract.md` — v1.0 scope freeze; references the closed-beta release as the launch target
- `docs/DECISIONS/0006-mapbox-token-incident.md` — Mapbox token restriction strategy; Phase 6 produces the SHA-256 fingerprint that enables Mapbox `pk.` Bundle ID + SHA-256 restriction tightening

### SOPS + secrets handling (Phase 2 substrate)
- `.planning/phases/02-secrets-and-config-hardening/02-CONTEXT.md` — full Phase 2 decision log (D-01..D-20); critical inheritance: D-01 (age over PGP/KMS), D-02 (`.secrets/<env>/<group>.yaml` layout), D-04 (1Password sealed + USB backup pattern — **mirror this for keystore**), D-05 (`.sops.yaml` config), D-18 (extend `docs/SECRETS.md` with rotation playbooks)
- `docs/SECRETS.md` — existing 10-token-type rotation RUNBOOK; Phase 6 extends with "Mobile signing — recovery" section (D-15)
- `.sops.yaml` (repo root) — SOPS encryption recipients config; Phase 6 verifies CI age key is a recipient (D-14)

### App identity + EAS
- `apps/mobile-rn/app.json` lines 22-30 — bundle ID `com.runningecosystem.mobile` + Android applicationId same (LOCKED per D-12)
- `apps/mobile-rn/eas.json` — current EAS profiles (development / preview / production); Phase 7 will extend `production` block, Phase 6 leaves untouched
- `app.json:5` `version: "0.1.0"` — current version string; Phase 9 will tag `v1.0.0-beta.1` per LAUNCH-01

### Roadmap + requirements
- `.planning/ROADMAP.md` §"Phase 6: Release signing" — 9 success criteria covering keystore + iOS cert (lines 32-46)
- `.planning/REQUIREMENTS.md` §"Phase 6 — Release Signing (SIGN)" — SIGN-01 (Android) + SIGN-02 (iOS) consolidated requirements

### Apple/Google official documentation (planner will fetch fresh via WebFetch)
- Apple Developer Program enrollment: `https://developer.apple.com/programs/enroll/`
- ASC API key generation: `https://appstoreconnect.apple.com/access/api`
- Android keystore best practices: `https://developer.android.com/studio/publish/app-signing#secure-shared-keystore`
- EAS managed vs self-managed credentials: `https://docs.expo.dev/app-signing/local-credentials/`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **SOPS infrastructure** (Phase 2): `.sops.yaml` config + `.secrets/{dev,staging,prod}/` directory layout + `sops --set` / `sops -d` workflows. Phase 6 adds `mobile-signing.yaml` to `prod/` only; no infrastructure work needed.
- **`docs/SECRETS.md` 10-section template** (Phase 2): each token type has a playbook with trigger / dashboard procedure / SOPS update / deploy step / validation. Phase 6's "Mobile signing — recovery" section follows the same template.
- **Phase 2 D-04 USB backup pattern**: 1Password sealed + encrypted USB per dev. Phase 6 reuses the same USB devices to add the mobile-signing bundle alongside the age key (single USB carries both secrets — they're a recoverable unit).
- **`apps/mobile-rn/app.json`**: bundle ID + Android applicationId already finalized at `com.runningecosystem.mobile`. No code change in Phase 6 — just consumption.

### Established Patterns
- **Self-managed secrets, not vendor-managed** (Phase 4 D-04-04-A "save/scp/load" pivot over GHCR pull-auth, Phase 2 D-01 "age over cloud KMS"): Phase 6 D-10 self-managed iOS credentials over EAS Cloud-managed credentials extends this. Consistent project principle.
- **SOPS values base64-encoded for binaries** (existing precedent in `.secrets/<env>/oauth.yaml` for Strava client secret, which is a string — but the pattern extends naturally to base64): Phase 6 D-02 codifies this for the keystore + p12 + provisioning profile + p8 binaries.
- **Documentation in `docs/SECRETS.md` is the single source of truth for secret recovery** (Phase 2 D-18 + existing 10-section RUNBOOK): Phase 6 extends, doesn't fork. No new RUNBOOK file.
- **Plans with USER ACTION checkpoints are `autonomous: false`** (Phase 2 Plan 02-04 Mapbox dashboard rotation, Phase 4 Plan 04-04 live rollback drill, Phase 5 Plan 05-06 acceptance walkthrough): Phase 6 follows same convention — both 06-01 + 06-02 are `autonomous: false`.

### Integration Points
- **Phase 7 build pipeline** (Phases 7 BUILD-01..02 + STAB-01): Phase 7's `eas.json` production profile will reference `.secrets/prod/mobile-signing.yaml` via env-extraction wrapper script. Phase 6 ensures the SOPS field names + structure are stable so Phase 7 can write the wrapper deterministically.
- **Phase 8 distribution pipeline** (Phases 8 DIST-01..02): Phase 8's `.github/workflows/ios-release.yml` consumes the ASC API key + Team ID; Phase 8's Caddy manifest signer (`AND-DIST` equivalent) consumes the keystore SHA-256 fingerprint for APK self-verification. Phase 6 produces both.
- **Phase 2 Mapbox `pk.` restriction tightening** (deferred from Phase 2 — see D-19): Phase 6 captures the keystore SHA-256 fingerprint to `.planning/phases/06-release-signing/evidence/keystore-sha256.txt` so the user can apply Mapbox dashboard restriction in a follow-up step.

</code_context>

<specifics>
## Specific Ideas

- **Keystore filename inside SOPS**: encode as `keystore_base64` field (not `keystore.jks_base64` — keep the field name clean, the `.jks` extension is an artifact of the keytool default and lives only on the dev's `/tmp/` during generation).
- **VeraCrypt vs LUKS for USB encryption**: VeraCrypt because it's cross-platform (the dev workstation is macOS per CLAUDE.md context, but a future recovery might happen on a different machine). LUKS is Linux-only. BitLocker is Windows-only. VeraCrypt = belt-and-suspenders.
- **Backup labeling**: the two USB sticks get human-friendly labels printed on them: "SPORT-RECOVERY-A" and "SPORT-RECOVERY-B" (NOT "Android keystore + iOS cert + age key" — that's a target painted on the device). Labels match the recovery card naming.
- **Apple Team ID format**: 10 character alphanumeric, e.g. `A1B2C3D4E5`. Plan 06-02 Task 0 documents where to find it (Apple Developer portal → Account → Membership → Team ID).

</specifics>

<deferred>
## Deferred Ideas

- **Fastlane Match for cert/profile rotation** → v1.1 if iOS cert annual renewal becomes a recurring chore. Single solo dev + once-a-year cert renewal = web portal UI is sufficient for now.
- **Organization Apple Developer enrollment** → public-launch milestone if/when project incorporates. Migration from Individual → Organization is supported by Apple without re-signing.
- **iOS staging bundle ID variant** (`com.runningecosystem.mobile.staging`) → v1.1 if/when a separate staging mobile build becomes useful. Closed-beta = single prod build.
- **Reproducible-build byte-identical verification** (was Phase 11 AND-BUILD-06 + Phase 12 IOS-BUILD-05) → dropped per ADR-0011 (funded-team rigor, not closed-beta gate).
- **SLSA provenance attestation included in CI artifacts** (was Phase 9 AND-SIGN-05) → dropped per ADR-0011 (cosign/SLSA already best-effort in `backend-cd.yml`; mobile-side attestation deferred).
- **EAS Cloud-managed credentials option (v1.0.1 fallback)** → if local builds prove too slow in Phase 7, revisit and consider letting EAS hold the keystore. D-10 self-managed is the default; this is the escape hatch.
- **Annual cert renewal reminder automation** → calendar entry + GitHub Issue template; not in Phase 6 scope but flagged in `docs/SECRETS.md §"iOS signing — recovery"` scenario (d).

</deferred>

---

## Post-CONTEXT amendment 2026-05-20 PM — Lean key custody

Per ADR-0011 §"Amendment 2026-05-20 PM — Lean key custody", the following CONTEXT decisions are **partially superseded** for v1.0 closed-beta scope:

- **D-07 (2 VeraCrypt USB sticks, ≥5 km separation, laminated paper RECOVERY-CARDs):** SUPERSEDED. Replaced with: **1 cloud backup** of the SOPS-encrypted `mobile-signing.yaml` + age key file to user-chosen cloud (iCloud Drive / Google Drive / Dropbox). Plus **1 printed RECOVERY-CARD.md** kept with personal documents at home (no lamination). Age key passphrase recovery path is the existing Phase 2 D-04 1Password sealed entry (no new 1Password entry needed for DMG passphrase since DMG is removed).

- **D-15 (4 recovery scenarios):** Scenario (a) "USB restore" SOFTENED to "cloud download + age key from 1Password" — same 4-scenario structure, just one wording update. Scenarios (b)/(c)/(d) unchanged.

- **D-08 (passwords stored alongside encrypted DMG):** Not applicable — no DMG container layer. Keystore + key passwords stay in SOPS YAML fields as before. Age key passphrase stays in 1Password per Phase 2 D-04.

**Why amended:** D-07 inherited a bank-grade rigor pattern from Phase 2 D-04, which itself was designed for the 21-phase scope. Re-evaluated under the closed-beta lens (5-10 friend testers; keystore loss = re-release inconvenience, not catastrophe; SOPS+age = the encryption envelope, NOT the storage medium), the 2-USB ceremony is over-engineered. See ADR-0011 §"Amendment 2026-05-20 PM" for the full reasoning + comparison table.

**Promotion path:** `PROD-LAUNCH-PREP` in `.planning/ROADMAP.md §v1.0.1 Backlog` — re-apply bank-grade procedure when beta passes 50 users. No re-keying needed.

**Files affected:** `06-01-PLAN.md` Tasks 5+6 rewritten; `06-VALIDATION.md` per-task map for Tasks 5-6 updated; this CONTEXT amendment block.

---

*Phase: 6-release-signing*
*Context gathered: 2026-05-20 (autonomous mode — 22 decisions resolved from prior-phase patterns + closed-beta lean scope per ADR-0011)*
*Amended: 2026-05-20 PM — D-07/D-08/D-15(a) partially superseded by ADR-0011 lean key custody amendment*
