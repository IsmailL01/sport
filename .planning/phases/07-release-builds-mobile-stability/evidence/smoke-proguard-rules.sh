#!/usr/bin/env bash
set -euo pipefail
# Phase 7 Plan 07-01 Task 3 — proguard-rules.pro extension smoke
# Verifies all required keep rules present for Mapbox/MMKV/expo/Hermes
# (namespaces verified against installed node_modules @ 2026-05-21).

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

FILE=apps/mobile-rn/android/app/proguard-rules.pro
[ -f "$FILE" ] || { echo "FAIL: $FILE missing"; exit 1; }

# Existing reanimated keep preserved at top:
grep -q "com.swmansion.reanimated" "$FILE" || { echo "FAIL: reanimated keep missing"; exit 1; }

# Required keeps — verified namespaces:
REQUIRED=(
  "com.mapbox"                              # Mapbox SDK
  "com.rnmapbox.rnmbx"                      # @rnmapbox/maps bridge
  "com.margelo.nitro.mmkv"                  # MMKV@4.x (Nitro Modules — verified)
  "expo.modules.taskManager"                # expo-task-manager (camelCase M — verified)
  "expo.modules.location"                   # expo-location
  "expo.modules"                            # broader expo.modules.** safety net
  "com.facebook.hermes"                     # Hermes JS engine
  "com.facebook.jni"                        # JNI bindings
  "DoNotStrip"                              # @DoNotStrip annotation keep
  "KeepGettersAndSetters"                   # @KeepGettersAndSetters annotation keep
)

MISSING=()
for required in "${REQUIRED[@]}"; do
  grep -q "$required" "$FILE" || MISSING+=("$required")
done

if [ ${#MISSING[@]} -gt 0 ]; then
  echo "FAIL: proguard-rules.pro missing keep(s) for:"
  printf '  - %s\n' "${MISSING[@]}"
  exit 1
fi

# Minimum line count check (must_haves.artifacts min_lines: 40)
LINES=$(wc -l < "$FILE")
[ "$LINES" -ge 40 ] || { echo "FAIL: proguard-rules.pro has $LINES lines, expected >= 40"; exit 1; }

echo "✓ proguard-rules.pro has all 10 required keeps + $LINES lines (Mapbox + MMKV + expo + Hermes)"
