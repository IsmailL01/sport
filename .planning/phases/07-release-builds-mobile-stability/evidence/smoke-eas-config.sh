#!/usr/bin/env bash
set -euo pipefail
# Phase 7 Plan 07-01 Task 2 — eas.json production.android.env smoke
# Verifies Path A keystore env injection block + iOS production untouched per Amendment 3.

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

python3 - <<'PY'
import json, sys

d = json.load(open('apps/mobile-rn/eas.json'))

# Production profile must exist.
assert 'production' in d['build'], 'build.production missing'
prod = d['build']['production']

# Android: Path A env block + buildType app-bundle.
android = prod['android']
assert android.get('buildType') == 'app-bundle', \
    f"buildType expected 'app-bundle', got {android.get('buildType')!r}"
env = android.get('env', {})
assert env.get('RUNNING_ECO_RELEASE_STORE_FILE') == 'release.keystore', \
    f"STORE_FILE env wrong: {env.get('RUNNING_ECO_RELEASE_STORE_FILE')!r}"
assert env.get('RUNNING_ECO_RELEASE_KEY_ALIAS') == 'runningecosystem-release', \
    f"KEY_ALIAS env wrong: {env.get('RUNNING_ECO_RELEASE_KEY_ALIAS')!r}"

# iOS: production block must still exist with resourceClass (DEFERRED-untouched per Amendment 3).
ios = prod.get('ios', {})
assert 'resourceClass' in ios, \
    "iOS production.resourceClass missing — DEFERRED block must stay intact per ADR-0011 Amendment 3"

print('✓ eas.json production.android.env block OK; iOS production untouched per Amendment 3')
PY
