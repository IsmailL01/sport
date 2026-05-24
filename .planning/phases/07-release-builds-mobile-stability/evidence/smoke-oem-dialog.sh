#!/usr/bin/env bash
# Phase 7 Plan 07-03 Task 3 — OEM detection + intent launcher smoke
#
# Validates static shape of OEM module + intent presence + dep installation.
# Exit codes: 0 green, 1 assertion failed.
set -euo pipefail

OEM=apps/mobile-rn/src/vendor/oem.ts
OPENSETTINGS=apps/mobile-rn/src/vendor/openOEMSettings.ts
TEST=apps/mobile-rn/src/vendor/__tests__/oem.test.ts
PKG=apps/mobile-rn/package.json

must() {
  local name="$1" pattern="$2" path="$3"
  grep -q "$pattern" "$path" || { echo "❌ ${name}: pattern '${pattern}' not found in ${path}"; exit 1; }
  echo "✓ ${name}"
}

test -f "$OEM" || { echo "❌ oem.ts missing"; exit 1; }
test -f "$OPENSETTINGS" || { echo "❌ openOEMSettings.ts missing"; exit 1; }
test -f "$TEST" || { echo "❌ oem.test.ts missing"; exit 1; }
echo "✓ all 3 files present"

# Public API
must "detectVendor exported"                   "export function detectVendor"                   "$OEM"
must "openOEMAutoStartSettings exported"        "export async function openOEMAutoStartSettings" "$OPENSETTINGS"

# Vendor coverage (closed-beta scope per CONTEXT D-17)
must "MIUI intent"                              "miui.intent.action.APP_PERM_EDITOR"             "$OPENSETTINGS"
must "Samsung intent"                           "com.samsung.android.sm"                         "$OPENSETTINGS"
must "Generic fallback"                         "ActivityAction.APPLICATION_DETAILS_SETTINGS"    "$OPENSETTINGS"

# Vendor detection
must "Xiaomi/Redmi/POCO detection"              "redmi\\|poco\\|xiaomi"                          "$OEM"
must "HONOR detection (HarmonyOS legacy)"       "honor"                                          "$OEM"

# Deps
must "expo-device installed"                    "expo-device"                                    "$PKG"
must "expo-intent-launcher installed"           "expo-intent-launcher"                           "$PKG"
must "expo-application installed"               "expo-application"                               "$PKG"

# Unit tests pass — match the __tests__/ path that Jest discovers
echo "Running jest unit tests on vendor..."
(cd apps/mobile-rn && npx jest --testPathPattern='vendor' --silent) || {
  echo "❌ vendor unit tests FAILED"
  exit 1
}
echo "✓ vendor unit tests green"

echo ""
echo "🎉 smoke green: OEM detection + intent launcher present + tests pass"
