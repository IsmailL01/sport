# Phase 8: Closed-beta distribution — Context

**Gathered:** 2026-05-24 (autonomous mode per standing memory `feedback_autonomous_discuss_mode` — no `AskUserQuestion`; decisions resolved from prior-phase patterns + ADR-0011 lean scope + existing deployed infrastructure).
**Status:** Ready for planning. Plan execution gated on Plan 07-03 closure (Phase 7 must close before Phase 8 runs per ROADMAP), but Plan 07-03 is device-blocked — **planning can proceed in parallel with Pixel acquisition**.

<domain>
## Phase Boundary

Ship one command — `git tag v1.0.0-beta.N && git push origin v1.0.0-beta.N` — and have Android closed-beta testers receive the new APK without any manual intervention beyond tapping "Update" inside the app.

Concretely:

1. **EAS Cloud build → signed Android .aab** already produced in Phase 7 (e.g., commit `f09e729` produced `CZseoc8Nac3ouY86QqPU3.aab`).
2. **CI hook extracts universal APK** from the .aab via `bundletool` and uploads it to MinIO (the same MinIO instance already proxied via Caddy at `s3.148-253-214-156.sslip.io` per Phase 3 INFRA-01).
3. **CI generates + signs `manifest.json`** with Ed25519 signature over the canonical JSON payload (latest version + APK signed-URL + min-supported-version + sha256 + released_at).
4. **CI uploads `manifest.json`** to a public-read MinIO bucket; Caddy serves it via the existing s3.* reverse-proxy.
5. **Mobile app checks the manifest** on launch (after auth resolved) + via Settings "Check for updates"; verifies Ed25519 signature with the embedded public key; if a new version is available, shows a non-blocking banner with "Обновить" → opens APK signed-URL via `Linking.openURL`.
6. **Force-update path** reuses the REL-02 mechanism already shipped in Phase 1 — when `min_supported_version > installed`, the existing `ForceUpdateScreen` + `useForceUpdateStore` + `apiClient` HTTP 426 hook blocks app usage until update. Phase 8 just triggers it from the manifest-check path instead of (or in addition to) the backend HTTP 426 path.

**Scope anchor:** Phase 8 produces the **distribution channel**. Phase 9 invites real testers + runs the 72h watchlist. Phase 8 does NOT touch tester onboarding, NOT add invite codes, NOT seed a tester list — that's all Phase 9 LAUNCH-01..02.

**Why this is small in lean scope:**

- **No backend code added.** Manifest is a static JSON file uploaded by CI; APKs are static blobs in MinIO; Caddy already reverse-proxies MinIO; the existing REL-02 force-update infrastructure is reused 1:1.
- **No vendor lock-in added.** APKs and manifest both live in MinIO (provider-agnostic per Phase 3 pivot 2026-05-17 — Hetzner Storage Box ROADMAP reference is stale and gets replaced).
- **iOS DEFERRED per ADR-0011 Amendment 3** — no TestFlight CI, no CFBundleVersion auto-bump, no Apple ID tester seeding. ROADMAP success criteria 5-7 (iOS portions) are all `~~struck~~`.
- **No tester-private gating in v1.0** — the manifest URL is publicly readable; the APK URL is signed (24h validity); closed-beta blast radius of 5-10 testers makes this acceptable. Private invite gating moves to v1.0.1 backlog if/when needed.

</domain>

<canonical_refs>
## Canonical refs (MANDATORY — downstream agents MUST read)

**This phase's roadmap entry:**
- `.planning/ROADMAP.md` → §"Phase 8: Closed-beta distribution" + §"v1.0.1 Backlog" (for deferred items list)
- `.planning/REQUIREMENTS.md` → §"Phase 8 — Closed-Beta Distribution (DIST)" + §"Dropped per ADR-0011" (DIST-02 iOS deferred)

**Reused infrastructure (Phase 1 REL-02 force-update mechanism):**
- `services/backend/pkg/clientversion/clientversion.go` — server-side version negotiation; emits HTTP 426 on min-version mismatch
- `services/backend/pkg/clientversion/middleware_test.go` — test patterns for HTTP 426 trigger
- `apps/mobile-rn/src/auth/apiClient.ts` — HTTP 426 hook → `useForceUpdateStore.setRequired(true, minVersion)`
- `apps/mobile-rn/src/state/forceUpdate.ts` — Zustand store for force-update state (required, minVersion, forceUpdateUrl)
- `apps/mobile-rn/src/ui/screens/ForceUpdateScreen.tsx` — blocking Modal triggered when `required === true`; "Обновить сейчас" button → `Linking.openURL(forceUpdateUrl)`
- `apps/mobile-rn/App.tsx` — already mounts ForceUpdateScreen

**Reused infrastructure (Phase 3 INFRA-01 deployed stack):**
- `services/backend/gateway/Caddyfile.prod` → §"s3.148-253-214-156.sslip.io" — existing MinIO reverse-proxy; Phase 8 adds NO new Caddy config (manifest served from MinIO as static object)
- `services/backend/media/internal/s3/client.go` — existing presigned-URL pattern for MinIO; same pattern for APK signed URLs in Phase 8
- `services/backend/media/internal/service/svc.go` — media service handles the canonical presigned-URL flow

**Reused infrastructure (Phase 6 SIGN-01 + Phase 7 BUILD-01):**
- `.secrets/prod/mobile-signing.yaml` — SOPS-encrypted Android keystore (PKCS12, alias `runningecosystem-release`)
- `.github/workflows/android-release.yml` — EAS Cloud build workflow; Phase 8 EXTENDS this with post-build steps (extract APK via bundletool → upload to MinIO → generate signed manifest → upload manifest)
- `.planning/phases/07-release-builds-mobile-stability/07-01-SUMMARY.md` — Plan 07-01 closeout; provides .aab artifact pattern + bundletool requirement + cert SHA-256 reference (`C6:33:47:6C:63:11:40:3F:5D:19:E2:3A:07:3A:15:F6:EA:BC:D6:40:FB:7F:F5:49:A5:B1:C3:A5:18:30:D7:BB`)
- `.planning/phases/06-release-signing/06-CONTEXT.md` D-14 + D-15 — SOPS recovery + CI age key patterns (extended into Plan 07-01 commit `dd0dce5`)

**Architectural decision records:**
- `docs/DECISIONS/0007-v1.0-release-contract.md` — wire contract + version negotiation policy (REL-02)
- `docs/DECISIONS/0011-scope-reset-to-closed-beta-lean.md` + 4 amendments — closed-beta lean scope; Amendment 3 defers iOS arm; Amendment 4 defers keystore cloud backup
- `docs/DECISIONS/0012-keystore-password-leak-2026-05-22.md` + amendment — credential-diagnostics discipline (applies to manifest-signing keypair in Phase 8 too)

**Phase 7 CONTEXT (referenced patterns):**
- `.planning/phases/07-release-builds-mobile-stability/07-CONTEXT.md` D-01..D-28 — EAS Cloud build pipeline, SOPS-via-CI credential injection, arm64-v8a only

**Codebase maps (refreshed 2026-05-23):**
- `.planning/codebase/INTEGRATIONS.md` — MinIO + Caddy + SOPS + GitHub Actions integration topology
- `.planning/codebase/ARCHITECTURE.md` — domain-driven + adapter pattern; Phase 8 adds NO new adapter (Linking.openURL is platform-native; no abstraction needed)
- `.planning/codebase/STRUCTURE.md` — directory layout (`src/update/` is the natural new module for the manifest-check + Settings entry)

</canonical_refs>

<code_context>
## Reusable assets + patterns (informs Plan structure)

### REL-02 force-update path (Phase 1) — REUSE 1:1, do not re-implement

The full "version mismatch blocks app usage" flow already exists:

```
apiClient.doFetch(...) → HTTP 426 detected → useForceUpdateStore.setRequired(true, minVersion, forceUpdateUrl)
  → ForceUpdateScreen renders (full-screen Modal, onRequestClose no-op)
  → user taps "Обновить сейчас" → Linking.openURL(forceUpdateUrl)
```

For Phase 8 manifest-driven force-update, the SAME state hook is used:

```typescript
// New: src/update/manifestCheck.ts (Phase 8)
async function checkForUpdate() {
  const manifest = await fetchManifest();      // GET signed JSON from MinIO
  if (!verifyEd25519(manifest)) return;        // signature must validate
  if (semverGT(manifest.min_supported_version, installedVersion)) {
    useForceUpdateStore.setState({             // ← same store as REL-02
      required: true,
      minVersion: manifest.min_supported_version,
      forceUpdateUrl: manifest.apk_url,        // Phase 8 sets to APK signed URL
    });
  } else if (semverGT(manifest.version, installedVersion)) {
    useUpdateBannerStore.setState({ available: true, manifest }); // non-blocking
  }
}
```

### MinIO presigned URL pattern (Phase 3 / media service)

`services/backend/media/internal/s3/client.go` uses the AWS SDK v2 S3 client (MinIO-compatible) with `s3.PresignClient.PresignGetObject(...)` + `WithPresignExpires(24h)`. Phase 8 CI uses the same pattern via the `mc` (MinIO client) CLI OR via a tiny inline Go helper invoked from the workflow.

### Caddy reverse-proxy for MinIO (Phase 3 / gateway)

Existing config block in `services/backend/gateway/Caddyfile.prod`:

```caddy
s3.148-253-214-156.sslip.io {
    reverse_proxy minio:9000
    log { output stdout; format json }
}
```

This already serves MinIO via HTTPS. Phase 8 adds NO new Caddy block — APK + manifest are MinIO objects fetched via this proxy.

### android-release.yml workflow (Phase 7 BUILD-01) — EXTEND, do not replace

Current workflow ends at `eas build --platform android --profile production --no-wait`. Phase 8 ADDS steps AFTER:

```yaml
# Existing steps end here ...
- name: Trigger EAS build
  # ... existing ...

# Phase 8 ADDS:
- name: Wait for EAS build to finish
  run: |
    eas build:view ${{ steps.trigger.outputs.build_id }} --wait --json > build.json
    # extract artifactUrl

- name: Download .aab
  run: curl -L -o /tmp/build.aab "$(jq -r .artifactUrl build.json)"

- name: Install bundletool + extract universal APK
  run: |
    npm install -g bundletool
    bundletool build-apks --bundle=/tmp/build.aab --output=/tmp/build.apks --mode=universal
    unzip -p /tmp/build.apks universal.apk > /tmp/build.apk

- name: Upload APK + generate signed manifest
  run: scripts/release-distribute.sh /tmp/build.apk "${GITHUB_REF_NAME}"
  env:
    MINIO_ACCESS_KEY: ${{ secrets.MINIO_ACCESS_KEY }}
    MINIO_SECRET_KEY: ${{ secrets.MINIO_SECRET_KEY }}
    MANIFEST_SIGNING_AGE_KEY: ${{ secrets.SOPS_AGE_KEY_CI }}  # same age key reused
```

`scripts/release-distribute.sh` is the new artifact authored by Plan 08-01. Atomic + idempotent.

### SOPS pattern for the new manifest-signing keypair

Following Phase 6 D-15 + Phase 7 D-04 conventions:

```
.secrets/prod/manifest-signing.yaml   # NEW file (SOPS-encrypted)
  manifest_signing_ed25519_private: <base64-Ed25519-32-byte-private>
  manifest_signing_ed25519_public:  <base64-Ed25519-32-byte-public>  # also embedded in mobile app
```

Encrypted to BOTH solo-dev age recipient AND CI age recipient (lifted in Plan 07-01 commit `dd0dce5`). No second recipient set needed.

</code_context>

<decisions>
## Implementation Decisions

### Storage backend

- **D-01:** APK + manifest storage = **MinIO** (already deployed via Phase 3 INFRA-01 + Caddy reverse-proxied at `s3.148-253-214-156.sslip.io`). NOT Hetzner Storage Box (ROADMAP/REQUIREMENTS text is stale — predates the 2026-05-17 Phase 3 pivot from Hetzner Cloud to provider-agnostic VPS). Phase 8 closeout MUST rewrite the affected ROADMAP/REQUIREMENTS lines (tracked as a Plan 08-01 final-task chore).
- **D-02:** Buckets:
  - `android-releases` — **private** (`X-Amz-Acl: private`). APKs accessed via 24h presigned URLs only. Bucket lifecycle: keep last 5 releases; older purged via MinIO lifecycle policy (v1.0.1 backlog item `RELEASE-RETENTION-POLICY` if it becomes a problem; for closed beta with N<5 releases, no-op).
  - `android-manifest` — **public-read**. `manifest.json` is publicly readable (signature provides integrity; no auth gate). Single object; rewritten on each release.

### Manifest format + signing

- **D-03:** Manifest URL = `https://s3.148-253-214-156.sslip.io/android-manifest/manifest.json` (Caddy → MinIO via existing reverse-proxy; no new Caddy config). Single canonical URL — no per-tester / per-env routing in v1.0.
- **D-04:** Manifest signing algorithm = **Ed25519** (not RSA, not HMAC). Why: 32-byte signatures, deterministic, native support in Go (`crypto/ed25519`) AND mobile (`@noble/ed25519` for pure-JS verification, tree-shakeable, no native deps). Matches the SOPS age primitive family (X25519+Ed25519) already in this repo.
- **D-05:** Signing keypair location = `.secrets/prod/manifest-signing.yaml` (SOPS-encrypted; CI age recipient already in `.sops.yaml` from Plan 07-01 commit `dd0dce5`). Schema:

  ```yaml
  manifest_signing:
    ed25519_private_base64: <Ed25519 32-byte private key, base64>
    ed25519_public_base64:  <Ed25519 32-byte public key, base64>
    # public key is also hard-coded into the mobile app (D-09 below) — this
    # field is for CI to self-verify after signing, not for distribution.
  ```

- **D-06:** Canonical JSON manifest schema (LOCKED — downstream agents follow this exact shape):

  ```json
  {
    "version":               "1.0.0-beta.1",
    "version_code":          1,
    "min_supported_version": "1.0.0-beta.1",
    "apk_url":               "https://s3.148-253-214-156.sslip.io/android-releases/v1.0.0-beta.1.apk?X-Amz-Algorithm=...&X-Amz-Expires=86400&X-Amz-Signature=...",
    "apk_sha256":            "C6...BB",
    "apk_size_bytes":        45123456,
    "released_at":           "2026-05-24T18:43:09Z",
    "signature":             "<base64-Ed25519-signature-of-canonical-payload>"
  }
  ```

  Canonical payload for signing = the JSON above MINUS the `signature` field, serialized via `JSON.stringify` with sorted keys + no extra whitespace. Sign that byte string; embed signature back. Mobile verification strips `signature`, re-serializes canonically, verifies against embedded public key.

- **D-07:** Manifest signing flow (CI-side, Go inline helper or `scripts/sign-manifest.sh`):
  1. CI extracts APK from .aab via bundletool → computes apk_sha256
  2. CI uploads APK to `android-releases` bucket → gets presigned URL via MinIO client
  3. CI builds the canonical JSON payload (version/version_code/etc. — minus signature)
  4. CI signs the canonical payload with `manifest_signing_ed25519_private_base64` from SOPS
  5. CI appends `signature: <base64>` to the JSON → uploads to `android-manifest/manifest.json` (overwrite)
  6. CI verifies round-trip: re-downloads manifest, strips signature, re-signs, compares — proves no upload corruption

### Mobile-side check + UX

- **D-08:** Manifest-fetch trigger = **on `AppState change to 'active'`** + once per 6 hours throttle (MMKV-persisted `lastManifestCheckAt`). Also: explicit "Check for updates" button in Settings (overrides throttle). No background fetch (battery cost; offline-first principle).
- **D-09:** Public key distribution = **hard-coded constant** in `apps/mobile-rn/src/update/manifestSigning.ts` (NOT app.json env, NOT remote-fetched). Rotation = ship new app version with new pubkey; old apps stop verifying new manifests → force-update via the OLD pubkey's last-signed manifest (which can pin a new `min_supported_version` that triggers REL-02). Pubkey rotation runbook = v1.0.1 backlog item `MANIFEST-SIGNING-KEY-ROTATION` (template in `docs/SECRETS.md` extension).
- **D-10:** Signature verification library = **`@noble/ed25519`** (pure JS, 6 KB minified, tree-shakeable, no native deps). NOT `tweetnacl` (older, larger, less actively maintained). Install via `npm install @noble/ed25519` from `apps/mobile-rn/`.
- **D-11:** Update UX layers (3 states):
  1. **No update available** — silent no-op
  2. **Optional update available** (`manifest.version > installed` AND `manifest.min_supported_version <= installed`) — **non-blocking Toast/banner**: "Доступна версия %version%" with [Обновить] [Позже] buttons. "Позже" suppresses the banner for 24h via MMKV `updateBannerSuppressedUntil`. "Обновить" → `Linking.openURL(manifest.apk_url)` → Android system installer handles APK install. Banner location: top of TrackerStartScreen + top of FeedScreen (cover both common app-launch entries; reuse the same `<UpdateBanner />` component).
  3. **Force update required** (`manifest.min_supported_version > installed`) — **reuse REL-02 ForceUpdateScreen**. Set `useForceUpdateStore` state: `{ required: true, minVersion, forceUpdateUrl: manifest.apk_url }`. ForceUpdateScreen renders blocking Modal. "Обновить сейчас" → `Linking.openURL(manifest.apk_url)`. Identical UX to the backend HTTP 426 path; user can't tell the difference.

- **D-12:** Settings entry = **NEW row in `apps/mobile-rn/src/navigation/screens/me/SettingsScreen.tsx`**: label "Проверить обновления" + subtitle showing `lastManifestCheckAt` relative time ("проверено 3 минуты назад"). Tap → runs `checkForUpdate({ force: true })` → if no update, show toast "У вас актуальная версия %version%"; if update, transitions into D-11 case 2 or 3 as appropriate.

- **D-13:** Manifest fetch failure handling = **silent failure** (no error toast, no banner). Why: closed-beta blast radius; intermittent network on Android is common; don't burn user goodwill on cosmetic infra. Logged via existing `console.warn` + visible to dev via Loki tail if needed.

### CI workflow extension

- **D-14:** `.github/workflows/android-release.yml` extension steps (added AFTER existing "Trigger EAS build"):
  1. **Wait for EAS build** — replace existing `--no-wait` with explicit `eas build:view <id> --wait` (workflow blocks until build finishes; EAS Cloud build is ~12 min so the workflow's total time becomes ~15 min — acceptable for tag-driven cadence)
  2. **Download .aab artifact** from EAS Cloud (`curl -L "$artifactUrl"`)
  3. **Install bundletool** (Plan 08-01 pins version) — `npm install -g bundletool` OR fixed-version GitHub Action
  4. **Extract universal APK** via `bundletool build-apks --bundle=<.aab> --output=<.apks> --mode=universal` → unzip → universal.apk
  5. **Compute apk_sha256 + apk_size_bytes**
  6. **Upload APK to MinIO** via `mc cp` to `android-releases/v${GITHUB_REF_NAME}.apk` (mc client installed in CI; auth via SOPS-decrypted MINIO_ACCESS_KEY + MINIO_SECRET_KEY)
  7. **Presign APK URL** with 24h expiry via `mc share download --expire 24h` OR Go inline helper
  8. **Build canonical manifest JSON** + sign with Ed25519 private key from `.secrets/prod/manifest-signing.yaml` (decrypted with `SOPS_AGE_KEY_CI`)
  9. **Upload manifest** to `android-manifest/manifest.json` (public-read; overwrite)
  10. **Round-trip verify** — re-download manifest, re-verify signature, compare APK URL fields

- **D-15:** New CI secrets needed (GitHub Actions secrets, separate from `SOPS_AGE_KEY_CI` which is reused):
  - `MINIO_RELEASES_ACCESS_KEY` — service-account access key for MinIO with PutObject on `android-releases` + `android-manifest`
  - `MINIO_RELEASES_SECRET_KEY` — the secret half
  - These are NEW MinIO credentials with scope limited to the two release buckets; the existing `media` service's MinIO creds are separate (don't reuse).

- **D-16:** bundletool version pin = **bundletool 1.18.x** (latest stable as of Phase 7 Plan 07-01 evidence/tool-versions.txt). Plan 08-01 Wave 0 updates tool-versions.txt with the bundletool version + uses the same artifact in Plan 07-03 Task 5 device smoke procedure.

- **D-17:** Plan 07-03 dependency = **NOT a hard dep**. Phase 8 depends on Plan 07-01 (closed) for the EAS build pipeline + .aab artifact pattern. Plan 07-03 (foreground service + Pixel pocket-walk) validates STAB-01 runtime behavior but is independent of DIST-01 plumbing. Plan 08-01 can be authored + executed without Plan 07-03 closure; the only true gate is "Plan 07-01 has produced at least one signed .aab" which has already happened (commit `f09e729` / build `052a2e92`).

### State + storage on mobile

- **D-18:** Mobile state for update flow = **two NEW Zustand stores** (matching existing pattern in `apps/mobile-rn/src/state/`):
  - `useUpdateBannerStore` — non-blocking banner state: `{ available: boolean, manifest: Manifest | null, suppressedUntil: number | null }`. Persisted via MMKV (suppressedUntil survives app restarts).
  - `useUpdateCheckStore` — fetch state: `{ lastCheckedAt: number | null, checking: boolean, lastError: string | null }`. Persisted via MMKV.
  - The **force-update path** continues to use the EXISTING `useForceUpdateStore` (REL-02; no changes).

- **D-19:** Module location = `apps/mobile-rn/src/update/`:
  - `manifestCheck.ts` — fetch + parse + dispatch (force vs banner)
  - `manifestSigning.ts` — Ed25519 verify + canonical-payload serializer + hard-coded pubkey constant
  - `manifestSchema.ts` — TypeScript type + zod-style runtime validator
  - `UpdateBanner.tsx` — non-blocking banner component (mounted at top of TrackerStartScreen + FeedScreen)
  - `useUpdateCheckOnForeground.ts` — AppState 'active' listener + 6h throttle + invokes checkForUpdate
  - `__tests__/manifestCheck.test.ts` + `manifestSigning.test.ts`

- **D-20:** Network adapter = **direct `fetch()`** (NOT through the existing `apiClient` from REL-02). Why: manifest is on a different origin (s3.148-253-214-156.sslip.io vs the API origin), doesn't need JWT, doesn't follow the version-negotiation contract. Simpler + decouples from apiClient evolution.

### Edge cases + safety

- **D-21:** Tag-driven release flow:
  - `git tag v1.0.0-beta.N && git push origin v1.0.0-beta.N` → workflow fires
  - Workflow blocks if `manifest.json` already exists with `version >= GITHUB_REF_NAME` (idempotency: tagging the same version twice doesn't re-upload)
  - Mid-release failure (e.g., bundletool fails) leaves the OLD manifest intact (atomicity: upload manifest LAST; before that, the new APK is in MinIO but no one knows about it)

- **D-22:** APK install permission prompt = handled by Android system installer when user taps "Обновить" → `Linking.openURL` → MIME type `application/vnd.android.package-archive`. App declares no install-related permissions (`REQUEST_INSTALL_PACKAGES` NOT needed for `Linking.openURL` to the APK URL). User sees the standard Android "Install unknown apps" flow + Play Protect scan; that's the entire UX.

- **D-23:** Signature spoofing protection = **public-key pinning**. Even if MinIO is compromised + attacker uploads a malicious APK + crafted manifest, the manifest signature won't validate because they don't have the Ed25519 private key (lives in SOPS only). Mobile rejects → silent no-op (D-13). Attacker MUST compromise the SOPS bundle + dev workstation to forge a valid manifest — same trust boundary as the keystore itself.

- **D-24:** Manifest replay protection = `released_at` timestamp in the signed payload + mobile rejects manifests where `released_at < installed_released_at` (rollback prevention). Stored locally in MMKV after first successful manifest verification. Edge case: if a tester sideloads an old release, they'd be on `installed_released_at < manifest.released_at` and accept normal updates — no impact.

- **D-25:** APK signed-URL expiry = **24h from presign time**. Workflow regenerates the URL inside the manifest each time the workflow fires (i.e., once per release tag). If a tester waits >24h to update, they get a 403 from MinIO. Mitigation: nightly cron-fired workflow that re-presigns the latest APK + re-publishes manifest (v1.0.1 backlog `APK-URL-REFRESH-CRON` if it becomes a real problem; for closed-beta with 5-10 testers + tag-driven cadence, 24h is fine).

### Deferred from v1.0 (preserved for v1.0.1)

- **iOS TestFlight pipeline** — DEFERRED per ADR-0011 Amendment 3. Reactivates when iOS arm un-flags.
- **Multi-region CDN** — single VPS in v1.0; multi-region is v2.0 per PROJECT.md constraint table.
- **Private invite gating** — manifest URL is open in v1.0. Per-tester auth + JWT-gated manifest = v1.0.1 backlog `MANIFEST-INVITE-GATING` if closed beta passes 50 users.
- **Auto-install (without user tap)** — would need `REQUEST_INSTALL_PACKAGES` + custom installer flow. Scary UX. Out of scope until Play Store submission.
- **Reproducible-build verification** — DROPPED per ADR-0011 (funded-team rigor).

</decisions>

<deferred>
## Deferred Ideas (for future phases / backlog — captured during discussion)

| Idea | Trigger to revisit | Backlog handle |
|---|---|---|
| MANIFEST-SIGNING-KEY-ROTATION playbook in docs/SECRETS.md | annual cadence OR signing-key compromise | v1.0.1 |
| RELEASE-RETENTION-POLICY (MinIO lifecycle policy on `android-releases`) | bucket exceeds ~10 releases | v1.0.1 |
| APK-URL-REFRESH-CRON (nightly re-presign + re-publish manifest so >24h-old releases stay installable) | tester reports 403 on APK URL | v1.0.1 |
| MANIFEST-INVITE-GATING (per-tester auth on the manifest URL) | closed beta >50 users OR public launch consideration | v1.0.1 / v1.1 |
| ROADMAP-MINIO-RENAME (replace stale "Hetzner Storage Box" mentions in ROADMAP.md + REQUIREMENTS.md with "MinIO via Caddy reverse-proxy" — Plan 08-01 final-task chore) | Plan 08-01 closeout | This phase's responsibility — not deferred, just noted |

</deferred>

<claude_discretion_swaps>
## Decisions where Claude's judgment overrides ROADMAP wording

1. **"Hetzner Storage Box" → MinIO** (D-01). ROADMAP success criterion 2 says APKs on Hetzner Storage Box. Reality: Phase 3 pivoted away from Hetzner Cloud entirely 2026-05-17; we have MinIO deployed and Caddy reverse-proxies it. Hetzner Storage Box would mean adding a new vendor + new credentials + new code path for no benefit. MinIO is the right call.

2. **Manifest served from MinIO, not Caddy file_server** (D-03, D-14). ROADMAP success criterion 1 says "Caddy serves `/android/manifest.json`". Reality: Caddy already reverse-proxies MinIO; manifest can live in MinIO as a public-read object. Avoids touching Caddy config + avoids CI needing SSH to the VPS to write the manifest file. SSH-deploy pattern (Phase 4) is still available if needed for other paths.

3. **Direct `fetch()` for manifest, not through `apiClient`** (D-20). Manifest is on a different origin + doesn't follow the JWT+version-negotiation contract. Using `apiClient` would inherit auth + retry behavior that doesn't apply.

4. **Public-read `android-manifest` bucket, signed-URL `android-releases` bucket** (D-02). Manifest is integrity-protected by signature; APK is content-bounded by signed URL. Different security models, different buckets, single MinIO instance.

</claude_discretion_swaps>

<must_haves>
## Must-haves (locked acceptance for Plan 08-01)

Pulled from ROADMAP Phase 8 success criteria (Android-only portions) + above decisions:

1. **Manifest at `https://s3.148-253-214-156.sslip.io/android-manifest/manifest.json`** is publicly fetchable + Ed25519-verifies against the embedded pubkey.
2. **APK at signed URL** (24h expiry) downloads + installs via Android system installer; cert SHA-256 matches `C6:33:47:6C:63:11:40:3F:5D:19:E2:3A:07:3A:15:F6:EA:BC:D6:40:FB:7F:F5:49:A5:B1:C3:A5:18:30:D7:BB` (preservation across distribution; existing-install upgrade path holds).
3. **`git tag v1.0.0-beta.N && git push origin v1.0.0-beta.N`** triggers the full pipeline → new manifest published → testers' apps see the update on next AppState='active'.
4. **In-app check on launch + Settings "Check for updates"** both work; both verify signature; both surface optional-update banner OR force-update Modal depending on manifest's `min_supported_version`.
5. **Force-update path** (`min_supported_version > installed`) uses REL-02 ForceUpdateScreen 1:1 — no parallel implementation.
6. **Mid-release failures do not corrupt the manifest** — manifest upload is the LAST step; new APK in MinIO without a published manifest is a no-op (testers never see it).
7. **ROADMAP/REQUIREMENTS Hetzner-Storage-Box references rewritten** to MinIO before Phase 8 closes (Plan 08-01 final-task chore; not a separate Plan).

</must_haves>

<plans_anticipated>
## Plan structure (informs gsd-planner)

Single plan envisioned: **Plan 08-01 — Android self-hosted manifest + MinIO APK distribution + in-app update UX**.

Approximate task breakdown (gsd-planner refines):

- **Task 0** — Wave 0 evidence scaffolding (tool-versions.txt extension with bundletool + mc + @noble/ed25519 versions; smoke-*.sh stubs)
- **Task 1** — Generate Ed25519 keypair + populate `.secrets/prod/manifest-signing.yaml`; commit hardcoded pubkey to mobile via `src/update/manifestSigning.ts`
- **Task 2** — MinIO credentials provisioning (USER ACTION via MinIO console: create service-account access key with scoped policy → paste into `SOPS_AGE_KEY_CI`-encrypted .secrets file → GitHub Actions secrets)
- **Task 3** — `scripts/release-distribute.sh`: bundletool extract + mc upload + Ed25519 sign + manifest upload + round-trip verify
- **Task 4** — `.github/workflows/android-release.yml` extension: add wait-for-EAS-build + download .aab + invoke release-distribute.sh + secrets binding
- **Task 5** — Mobile `src/update/` module: manifestCheck.ts + manifestSigning.ts + manifestSchema.ts + tests
- **Task 6** — Mobile UpdateBanner.tsx + useUpdateCheckOnForeground.ts + wire into TrackerStartScreen + FeedScreen + SettingsScreen "Check for updates" row
- **Task 7** — USER ACTION: tag v1.0.0-beta.5 + watch full distribution pipeline end-to-end (CI → EAS → bundletool → MinIO → manifest) + verify on test device (use the same Pixel or any Android, since Plan 07-03's test infra is reused)
- **Task 8** — ROADMAP/REQUIREMENTS rename (Hetzner Storage Box → MinIO) + 08-01-SUMMARY

Wave 1 = all of the above (no parallelism inside; tasks linearly depend on each other).
Plan 08-01 frontmatter `autonomous: false` (Task 2 + Task 7 = USER ACTION; rest are autonomous).

iOS Plan 08-02 = DEFERRED per ADR-0011 Amendment 3; plan file does not exist.

</plans_anticipated>

---

## Next step

Plan 08-01 author: `/gsd-plan-phase 8`

Planning can proceed immediately. Plan execution gated on Plan 07-01 closure (already done; commit `5e2a8a6`); not gated on Plan 07-03 closure (which is device-blocked). When the planner spawns, it can author the plan body in parallel with Pixel acquisition for Phase 7 closeout.
