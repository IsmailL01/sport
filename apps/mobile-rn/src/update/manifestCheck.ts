// Phase 8 Plan 08-01 Task 5 — manifest fetch + verify + dispatch.
//
// Single entry point: `checkForUpdate({ force? })`. Triggered by
//   1. useUpdateCheckOnForeground hook on AppState='active'
//   2. SettingsScreen "Проверить обновления" tap (force: true)
//
// Throttle: 6 hours between auto-checks (force: true bypasses).
//
// Dispatch (per 08-CONTEXT D-11):
//   - silent (no update available)         → no UI change
//   - optional update available            → useUpdateBannerStore (non-blocking banner)
//   - force update required                → useForceUpdateStore (REL-02 blocking Modal)
//
// Failure handling: silent (no error toast). Logs to console.warn for dev
// diagnostics. Per 08-CONTEXT D-13.

import { parseManifest } from './manifestSchema';
import { verifyManifestSignature } from './manifestSigning';
import { useUpdateBannerStore } from './updateBannerStore';
import { useUpdateCheckStore } from './updateCheckStore';
import { gt as semverGt } from './semverLite';
import { useForceUpdateStore } from '../state/forceUpdate';
import { getInstalledVersion } from '../util/version';

// Phase 8 distribution gated per ADR-0011 Amendment 5 (2026-05-24): closed-beta
// scope reduced to manual sideload by solo dev. Empty/unset env →
// checkForUpdate short-circuits to `disabled` without network fetch. Re-enable
// by setting EXPO_PUBLIC_UPDATE_MANIFEST_URL in .env / shell env / app.json
// `extra` before `expo prebuild` / `eas build`.
function getManifestUrl(): string {
  return process.env.EXPO_PUBLIC_UPDATE_MANIFEST_URL ?? '';
}
const THROTTLE_MS = 6 * 60 * 60 * 1000; // 6 hours

export type CheckOptions = {
  force?: boolean;
};

export type CheckResult =
  | { state: 'disabled' }
  | { state: 'no-update' }
  | { state: 'banner-shown' }
  | { state: 'force-required' }
  | { state: 'throttled' }
  | { state: 'failed'; error: string };

export async function checkForUpdate(
  opts: CheckOptions = {},
): Promise<CheckResult> {
  const { force = false } = opts;
  const manifestUrl = getManifestUrl();
  if (!manifestUrl) {
    if (__DEV__) {
      console.warn(
        '[update] disabled — EXPO_PUBLIC_UPDATE_MANIFEST_URL not set (ADR-0011 Amendment 5)',
      );
    }
    return { state: 'disabled' };
  }
  const { lastCheckedAt, checking } = useUpdateCheckStore.getState();

  if (checking) return { state: 'failed', error: 'already checking' };
  if (
    !force &&
    lastCheckedAt !== null &&
    Date.now() - lastCheckedAt < THROTTLE_MS
  ) {
    return { state: 'throttled' };
  }

  useUpdateCheckStore.setState({ checking: true, lastError: null });

  try {
    const res = await fetch(manifestUrl, { method: 'GET' });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const json = (await res.json()) as unknown;

    const parsed = parseManifest(json);
    if (!parsed.ok) {
      throw new Error(`schema: ${parsed.error}`);
    }
    const manifest = parsed.value;

    if (!verifyManifestSignature(manifest)) {
      throw new Error('signature verification failed');
    }

    // Replay protection (D-24): reject if released_at < stored installedReleasedAt.
    const releasedAtMs = Date.parse(manifest.released_at);
    if (!Number.isFinite(releasedAtMs)) {
      throw new Error('manifest.released_at not parseable');
    }
    const { installedReleasedAt } = useUpdateCheckStore.getState();
    if (
      installedReleasedAt !== null &&
      releasedAtMs < installedReleasedAt
    ) {
      throw new Error('replay: manifest older than installed baseline');
    }

    // First-fetch baseline: persist installedReleasedAt for future comparisons.
    useUpdateCheckStore.setState({
      lastCheckedAt: Date.now(),
      checking: false,
      installedReleasedAt:
        installedReleasedAt === null
          ? releasedAtMs
          : Math.max(installedReleasedAt, releasedAtMs),
    });

    const installedVersion = getInstalledVersion();

    // Force update (highest priority — wins over banner).
    if (semverGt(manifest.min_supported_version, installedVersion)) {
      useForceUpdateStore.getState().set({
        required: true,
        minVersion: manifest.min_supported_version,
        forceUpdateUrl: manifest.apk_url,
      });
      // Clear any optional-banner state — force overrides.
      useUpdateBannerStore.setState({
        available: false,
        manifest: null,
        suppressedUntil: null,
      });
      return { state: 'force-required' };
    }

    // Optional update.
    if (semverGt(manifest.version, installedVersion)) {
      const prev = useUpdateBannerStore.getState();
      // RESEARCH §9 Q6: if banner is suppressed but the manifest's version
      // has CHANGED since the suppression was set, clear suppressedUntil
      // (different release than the one the user dismissed).
      const versionChanged =
        prev.manifest === null || prev.manifest.version !== manifest.version;
      useUpdateBannerStore.setState({
        available: true,
        manifest,
        suppressedUntil: versionChanged ? null : prev.suppressedUntil,
      });
      return { state: 'banner-shown' };
    }

    // Installed >= manifest.version — no update.
    useUpdateBannerStore.setState({
      available: false,
      manifest: null,
      suppressedUntil: null,
    });
    return { state: 'no-update' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Silent failure per CONTEXT D-13. Log only.
    if (__DEV__) {
      console.warn('[update] check failed:', msg);
    }
    useUpdateCheckStore.setState({ checking: false, lastError: msg });
    return { state: 'failed', error: msg };
  }
}
