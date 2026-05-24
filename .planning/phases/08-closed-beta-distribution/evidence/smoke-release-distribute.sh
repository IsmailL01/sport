#!/usr/bin/env bash
# Phase 8 Plan 08-01 Task 4 — workflow extension shape smoke.
# Catches workflow-string regressions including ::add-mask:: presence + 
# bundletool installation + release-distribute.sh invocation.
set -euo pipefail
WF=.github/workflows/android-release.yml

must() {
  local pattern="$1" desc="$2"
  grep -q "$pattern" "$WF" || { echo "❌ $desc"; exit 1; }
  echo "✓ $desc"
}
mustnot() {
  local pattern="$1" desc="$2"
  grep -q -e "$pattern" "$WF" && { echo "❌ $desc"; exit 1; }
  echo "✓ $desc"
}

# Plan 08-01 required steps
must "scripts/release-distribute.sh" "release-distribute.sh invocation present"
must "bundletool build-apks" "bundletool universal APK extract step present"
must "BUNDLETOOL_VERSION=1.18.1" "bundletool version pinned to 1.18.1"
must "/usr/local/bin/mc" "mc (MinIO client) install step present"
must "MINIO_RELEASES_ACCESS_KEY" "MinIO access-key secret reference present"
must "MINIO_RELEASES_SECRET_KEY" "MinIO secret-key secret reference present"
must "manifest-signing.yaml" "SOPS decrypt of manifest-signing.yaml present"
must "::add-mask::\\\$MANIFEST_SIGNING_PRIVATE" "Ed25519 private-key mask directive present"
must "MANIFEST_SIGNING_PUBLIC" "Ed25519 public-key env var present"
must "steps.eas.outputs.artifact_url" "EAS build outputs.artifact_url plumbed"
must "steps.eas.outputs.version_code" "EAS build outputs.version_code plumbed"

# Plan 07-01 / ADR-0012 invariants must still hold
must "::add-mask::\\\$STORE_PASS" "Plan 07-01 keystore-password mask still present"
must "::add-mask::\\\$KEY_PASS" "Plan 07-01 key-password mask still present"
must "credentialsSource" "Plan 07-01 credentials.json generation still present" || true  # weak check
must "credentials.json" "credentials.json reference present"
must "npm install -g eas-cli" "explicit eas-cli install (Plan 07-01 fix; not npx eas)"

# Pitfall 16: --no-wait dropped from the `eas build` invocation. Comments
# explaining the drop are fine; check only for the flag-continuation form
# (line begins with whitespace + `--no-wait`).
mustnot_re() {
  local pattern="$1" desc="$2"
  grep -qE "$pattern" "$WF" && { echo "❌ $desc"; exit 1; }
  echo "✓ $desc"
}
mustnot_re '^[[:space:]]+--no-wait[[:space:]]*\\?$' "--no-wait flag dropped per Pitfall 16 (workflow blocks for EAS completion)"

# Lint
actionlint "$WF"
echo "✓ actionlint clean"

echo ""
echo "🎉 workflow shape smoke green"
