#!/usr/bin/env bash
set -euo pipefail
# Phase 7 Plan 07-01 Task 4 — gradle.properties + build.gradle config smoke
# Verifies R8 minify + shrinkResources flipped on + arm64-v8a single-ABI.

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

GP=apps/mobile-rn/android/gradle.properties
BG=apps/mobile-rn/android/app/build.gradle

[ -f "$GP" ] || { echo "FAIL: $GP missing"; exit 1; }
[ -f "$BG" ] || { echo "FAIL: $BG missing"; exit 1; }

# gradle.properties checks — keys use `android.` prefix per build.gradle line 69 + 141.
grep -q "^android.enableMinifyInReleaseBuilds=true$" "$GP" \
  || { echo "FAIL: android.enableMinifyInReleaseBuilds not =true"; exit 1; }
grep -q "^android.enableShrinkResourcesInReleaseBuilds=true$" "$GP" \
  || { echo "FAIL: android.enableShrinkResourcesInReleaseBuilds not =true"; exit 1; }
grep -q "^reactNativeArchitectures=arm64-v8a$" "$GP" \
  || { echo "FAIL: reactNativeArchitectures not =arm64-v8a (single-ABI)"; exit 1; }

# Negative check: must NOT still have the multi-ABI line.
if grep -q "armeabi-v7a,arm64-v8a,x86,x86_64" "$GP"; then
  echo "FAIL: gradle.properties still has multi-ABI reactNativeArchitectures line"
  exit 1
fi

# build.gradle checks — abiFilters block inside defaultConfig.
grep -q "abiFilters 'arm64-v8a'" "$BG" \
  || { echo "FAIL: build.gradle missing arm64-v8a abiFilter"; exit 1; }
# Verify it's inside an ndk { } block (Groovy DSL).
grep -B 1 "abiFilters 'arm64-v8a'" "$BG" | grep -q "ndk {" \
  || { echo "FAIL: abiFilters not wrapped in ndk { } block"; exit 1; }

echo "✓ gradle.properties + build.gradle config OK (minify + shrinkResources enabled; single-ABI arm64-v8a)"
