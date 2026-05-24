#!/usr/bin/env bash
# Phase 8 Plan 08-01 Task 6 — mobile update flow shape smoke.
set -euo pipefail
must() {
  local file="$1" pattern="$2" desc="$3"
  grep -q "$pattern" "$file" || { echo "❌ $desc (file: $file)"; exit 1; }
  echo "✓ $desc"
}

must apps/mobile-rn/src/update/UpdateBanner.tsx "Доступна версия"                       "UpdateBanner has RU template"
must apps/mobile-rn/src/update/UpdateBanner.tsx "Обновить"                              "UpdateBanner has Обновить CTA"
must apps/mobile-rn/src/update/UpdateBanner.tsx "Позже"                                 "UpdateBanner has Позже dismiss"
must apps/mobile-rn/src/update/UpdateBanner.tsx "Linking.openURL(manifest.apk_url)"     "UpdateBanner triggers Android installer via Linking.openURL"

must apps/mobile-rn/src/navigation/screens/record/TrackerStartScreen.tsx "UpdateBanner"   "TrackerStartScreen mounts UpdateBanner"
must apps/mobile-rn/src/navigation/screens/journal/JournalScreen.tsx     "UpdateBanner"   "JournalScreen mounts UpdateBanner"

must apps/mobile-rn/src/navigation/screens/me/SettingsScreen.tsx "Проверить обновления"   "SettingsScreen has check-updates row"
must apps/mobile-rn/src/navigation/screens/me/SettingsScreen.tsx "checkForUpdate"         "SettingsScreen wires checkForUpdate"
must apps/mobile-rn/src/navigation/screens/me/SettingsScreen.tsx "formatRelativeTimeRU"   "SettingsScreen has RU relative-time helper"

# Jest tests still green
(cd apps/mobile-rn && npx jest --testPathPattern='update' --silent) || { echo "❌ update tests failed"; exit 1; }
echo "✓ update tests still green"

# App.tsx wires the hook
must apps/mobile-rn/App.tsx "useUpdateCheckOnForeground" "App.tsx wires useUpdateCheckOnForeground"

echo ""
echo "🎉 mobile update flow smoke green"
