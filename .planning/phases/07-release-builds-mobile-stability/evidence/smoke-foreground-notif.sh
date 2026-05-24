#!/usr/bin/env bash
# Phase 7 Plan 07-03 Task 2 — foreground notification.ts smoke
#
# Validates the static shape of the foreground-service notification updater
# without requiring a device or running JS. Run from repo root.
#
# Exit codes:
#   0 — green
#   1 — assertion failed
set -euo pipefail

FILE=apps/mobile-rn/src/foreground/notification.ts
APP=apps/mobile-rn/App.tsx
PKG=apps/mobile-rn/package.json

must() {
  local name="$1" pattern="$2" path="$3"
  grep -q "$pattern" "$path" || { echo "❌ ${name}: pattern '${pattern}' not found in ${path}"; exit 1; }
  echo "✓ ${name}"
}

test -f "$FILE" || { echo "❌ notification.ts missing at ${FILE}"; exit 1; }
echo "✓ notification.ts present"

# Required public API
must "presentRecordingNotification exported"    "export async function presentRecordingNotification"  "$FILE"
must "dismissRecordingNotification exported"    "export async function dismissRecordingNotification"  "$FILE"
must "subscribeToRecordingTick exported"        "export function subscribeToRecordingTick"            "$FILE"
must "setupForegroundChannel exported"          "export async function setupForegroundChannel"        "$FILE"

# RU body template (matches plan + ROADMAP §7 criterion 5)
must "RU notification body template"            "Запись пробежки активна"                              "$FILE"

# Store subscription via useActivityStore (NOT useSessionStore per plan-drift fix 2026-05-24)
must "useActivityStore subscription"            "useActivityStore.subscribe"                           "$FILE"
must "totalDistance derived (points)"           "totalDistance"                                        "$FILE"
must "formatDuration / formatDistance used"     "formatDuration\|formatDistance"                       "$FILE"

# expo-notifications dependency
must "expo-notifications in package.json"       "expo-notifications"                                   "$PKG"

# App.tsx wires the subscription on mount
must "App.tsx imports subscribeToRecordingTick" "subscribeToRecordingTick"                             "$APP"
must "App.tsx calls it in useEffect"            "subscribeToRecordingTick()"                           "$APP"

echo ""
echo "🎉 smoke green: notification.ts wires foreground updater via useActivityStore + totalDistance + RU template"
