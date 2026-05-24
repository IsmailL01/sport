// Open OEM-specific auto-start / battery-saver settings page (Phase 7 / Plan 07-03 Task 3).
//
// Why: vendor-killers (MIUI auto-start blocker, One UI deep-sleep heuristics)
// stop foreground services even when the user explicitly granted background-
// location. Mitigation = nudge user to the right settings page on first launch
// (see AutostartDialog, Task 4).
//
// Strategy: detect vendor via Device.manufacturer → fire vendor-specific intent
// → on failure (intent not available on this build), fall back to the generic
// Android app-details settings page. Both legs return `{launched, vendor}` so
// the caller can log + display a toast.
//
// iOS = no-op; the foreground-service-killer pattern is Android-only (iOS deferred
// per ADR-0011 Amendment 3).

import { Platform } from 'react-native';
import { startActivityAsync, ActivityAction } from 'expo-intent-launcher';
import * as Application from 'expo-application';

import { detectVendor } from './oem';

const APP_PACKAGE = Application.applicationId ?? 'com.runningecosystem.mobile';

export type OEMSettingsResult = {
  launched: boolean;
  vendor: 'xiaomi' | 'samsung' | 'huawei' | 'generic' | 'generic-fallback' | 'ios' | 'launch-failed';
};

export async function openOEMAutoStartSettings(): Promise<OEMSettingsResult> {
  if (Platform.OS !== 'android') return { launched: false, vendor: 'ios' };
  const vendor = detectVendor();
  try {
    switch (vendor) {
      case 'xiaomi':
        // MIUI auto-start permission editor — deep-links to per-app autostart toggle.
        await startActivityAsync('miui.intent.action.APP_PERM_EDITOR', {
          extra: { extra_pkgname: APP_PACKAGE },
        });
        return { launched: true, vendor: 'xiaomi' };
      case 'samsung':
        // One UI battery / sleep settings — top-level entry; user navigates to "Apps that won't sleep".
        await startActivityAsync('com.samsung.android.sm.ACTION_BATTERY');
        return { launched: true, vendor: 'samsung' };
      default:
        // Huawei + generic: open app details settings (user navigates to Battery → Allow background).
        await startActivityAsync(ActivityAction.APPLICATION_DETAILS_SETTINGS, {
          data: `package:${APP_PACKAGE}`,
        });
        return { launched: true, vendor: vendor === 'huawei' ? 'huawei' : 'generic' };
    }
  } catch {
    // OEM-specific intent unavailable on this build (e.g., MIUI version drift,
    // Samsung intent renamed). Fall back to generic app-details.
    try {
      await startActivityAsync(ActivityAction.APPLICATION_DETAILS_SETTINGS, {
        data: `package:${APP_PACKAGE}`,
      });
      return { launched: true, vendor: 'generic-fallback' };
    } catch {
      return { launched: false, vendor: 'launch-failed' };
    }
  }
}
