// OEM (Android device manufacturer) detection (Phase 7 / Plan 07-03 Task 3).
//
// Closed-beta scope per ADR-0011 STAB-01 lean: MIUI + One UI handled here;
// HyperOS bucketed under Xiaomi (since HyperOS = Xiaomi rebrand); EMUI / HONOR
// detected but deferred to v1.0.1 per CONTEXT D-17 (intents available below
// only fire on MIUI + One UI; HONOR/Huawei users land on generic fallback).
//
// Used by `openOEMSettings.ts` to pick the right deep-link intent.

import * as Device from 'expo-device';

export type Vendor = 'xiaomi' | 'samsung' | 'huawei' | 'generic';

export function detectVendor(): Vendor {
  const manufacturer = (Device.manufacturer ?? '').toLowerCase();
  if (
    manufacturer.includes('xiaomi') ||
    manufacturer.includes('redmi') ||
    manufacturer.includes('poco')
  ) {
    // Covers MIUI + HyperOS (Xiaomi rebrand of MIUI on flagship + Poco devices).
    return 'xiaomi';
  }
  if (manufacturer.includes('samsung')) {
    // One UI.
    return 'samsung';
  }
  if (manufacturer.includes('huawei') || manufacturer.includes('honor')) {
    // EMUI / HarmonyOS — deferred per CONTEXT D-17 (no specific intent shipped;
    // generic fallback used by openOEMSettings).
    return 'huawei';
  }
  return 'generic';
}
