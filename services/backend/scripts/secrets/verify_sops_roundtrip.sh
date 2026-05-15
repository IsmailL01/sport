#!/usr/bin/env bash
#
# verify_sops_roundtrip.sh — Smoke-test SOPS encrypt/decrypt round-trip with
# special focus on `--output-type=dotenv` regressions (RESEARCH Pitfall 1:
# known sops issues #724/#784/#1435/#1951 around multi-line values and shell
# interpolation).
#
# Phase 2 / SEC-02. Run before any 02-04 prod-secret population to catch
# Pitfall 1 BEFORE real values land. Exit 0 on success; non-zero with a
# slog-style message on failure.
#
# Usage:
#   verify_sops_roundtrip.sh [--env dev|staging|prod]
#
# Default env is `dev`. Requires `$SOPS_AGE_KEY_FILE` to point at a valid
# age private-key file containing an identity matching one of the recipients
# in `.sops.yaml`.

set -euo pipefail

# -------- arg parsing --------
ENV_NAME="dev"
while [ $# -gt 0 ]; do
  case "$1" in
    --env)
      ENV_NAME="$2"
      shift 2
      ;;
    --env=*)
      ENV_NAME="${1#--env=}"
      shift
      ;;
    -h|--help)
      sed -n 's/^# \{0,1\}//; 1,/^$/p' "$0"
      exit 0
      ;;
    *)
      printf 'verify_sops_roundtrip: ERROR unknown arg: %s\n' "$1" >&2
      exit 2
      ;;
  esac
done

case "$ENV_NAME" in
  dev|staging|prod) ;;
  *)
    printf 'verify_sops_roundtrip: ERROR --env must be one of: dev, staging, prod (got %s)\n' "$ENV_NAME" >&2
    exit 2
    ;;
esac

# -------- prerequisites --------
for bin in sops age openssl; do
  if ! command -v "$bin" >/dev/null 2>&1; then
    printf 'verify_sops_roundtrip: ERROR missing required binary: %s\n' "$bin" >&2
    exit 3
  fi
done

if [ -z "${SOPS_AGE_KEY_FILE:-}" ]; then
  if [ -r "$HOME/.config/sops/age/keys.txt" ]; then
    export SOPS_AGE_KEY_FILE="$HOME/.config/sops/age/keys.txt"
  else
    printf 'verify_sops_roundtrip: ERROR SOPS_AGE_KEY_FILE not set and ~/.config/sops/age/keys.txt missing\n' >&2
    exit 4
  fi
fi

# -------- workspace + cleanup --------
WORK="$(mktemp -d -t sops-roundtrip-XXXXXX)"
cleanup() {
  if [ -d "$WORK" ]; then
    # Best-effort secure delete (BSD `rm -P` overwrites before unlink).
    # Fall back to plain rm if `rm -P` isn't supported.
    find "$WORK" -type f -print0 | xargs -0 -I{} sh -c 'rm -P "{}" 2>/dev/null || rm "{}"' || true
    rmdir "$WORK" 2>/dev/null || rm -rf "$WORK"
  fi
}
trap cleanup EXIT INT TERM

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

log_info()  { printf 'verify_sops_roundtrip: INFO  %s\n' "$1"; }
log_error() { printf 'verify_sops_roundtrip: ERROR %s\n' "$1" >&2; }

fail() {
  log_error "$1"
  exit 1
}

# -------- check 1: real per-env files round-trip via --output-type=dotenv --------
expected_min_lines() {
  # Returns the minimum number of KEY=value lines expected per group file.
  case "$1" in
    shared) echo 10 ;;  # 7 *_DB_URL + IDENTITY_JWT_SECRET + 2 S3_*
    mapbox) echo 2 ;;   # PUBLIC + SECRET tokens
    oauth)  echo 4 ;;   # STRAVA_CLIENT_ID/SECRET + GOOGLE + APPLE
    *)      echo 0 ;;
  esac
}

for group in shared mapbox oauth; do
  file="$REPO_ROOT/.secrets/$ENV_NAME/$group.yaml"
  if [ ! -f "$file" ]; then
    fail "missing encrypted file: $file"
  fi

  log_info "decrypting $file (--output-type=dotenv) ..."
  dotenv_out="$WORK/$ENV_NAME-$group.env"
  if ! sops -d --output-type=dotenv "$file" > "$dotenv_out" 2>"$WORK/sops.stderr"; then
    log_error "sops -d failed for $file:"
    cat "$WORK/sops.stderr" >&2
    exit 5
  fi

  # Count KEY=value lines (ignore comments / blanks). KEY pattern must allow
  # digits (e.g. S3_ACCESS_KEY starts with `S3`), so we use [A-Z0-9_] with a
  # leading non-digit guard (`[A-Z_][A-Z0-9_]*`) — env vars cannot start with
  # a digit per POSIX.
  key_lines=$(grep -cE '^[A-Z_][A-Z0-9_]*=.+$' "$dotenv_out" || true)
  min=$(expected_min_lines "$group")
  if [ "$key_lines" -lt "$min" ]; then
    fail "$file: expected >= $min KEY=value lines, got $key_lines"
  fi
  log_info "  $group: $key_lines KEY=value lines (>= $min required)"

  # Pitfall 1 regression guards — never log the values themselves.
  # Guard A: no literal space inside a value line (would indicate dotenv
  # mangled a multi-line value — sops #724/#784).
  if awk -F= 'NR>0 && /^[A-Z_][A-Z0-9_]*=/ { v=$0; sub(/^[A-Z_][A-Z0-9_]*=/,"",v); if (v ~ / /) { print NR; exit 99 } }' "$dotenv_out" 2>/dev/null; then
    # awk returned non-99 means no space found.
    :
  else
    rc=$?
    if [ "$rc" = "99" ]; then
      fail "$file: a KEY=value line contains a literal space (Pitfall 1 dotenv multi-line mangle) — switch to YAML output for that key"
    fi
  fi
  # Guard B: no literal `${` (would indicate shell-interpolation risk if the
  # consumer ever `source`'d the dotenv directly).
  if grep -qE '\$\{' "$dotenv_out"; then
    fail "$file: a KEY=value line contains \${...} — shell-interpolation risk on naive source-load"
  fi
done

# -------- check 2: synthetic encrypt + dotenv-decrypt with multi-line + $-payload --------
# This is the canonical Pitfall 1 regression guard. We craft a value that
# WOULD trip sops #724/#784/#1435/#1951 if those bugs regress, then assert
# the dotenv output round-trips cleanly under our v1.0 single-line constraint.
log_info "synthetic round-trip: encrypting a sample value containing '\$' and assert dotenv output ..."
SYNTH_PLAIN="$WORK/synth-plain.yaml"
SYNTH_ENC="$WORK/synth-enc.yaml"
SYNTH_DOTENV="$WORK/synth.env"

# Single-line value containing `$VAR_LIKE` literal — must NOT be interpolated
# by sops or any downstream consumer in dotenv mode.
cat > "$SYNTH_PLAIN" <<'PLAIN'
SAMPLE_PASSWORD: "p4ssw0rd-with-$dollar-sign-and-spaces-not-here"
SAMPLE_BASE64: "abc/def+ghi=jkl"
PLAIN

# `.sops.yaml` creation_rules only fire on `.secrets/**` — for an arbitrary
# path we pass the recipient explicitly.
RECIPIENT="$(grep -oE 'age1[a-z0-9]{50,}' "$REPO_ROOT/.sops.yaml" | head -1)"
if [ -z "$RECIPIENT" ]; then
  fail "could not extract age recipient from $REPO_ROOT/.sops.yaml"
fi

# Use `--config /dev/null` so SOPS does NOT consult `.sops.yaml`
# (which only has creation_rules for `.secrets/**`). With an explicit `--age`
# recipient, SOPS encrypts without needing a matching creation rule.
if ! sops --config /dev/null --encrypt --age "$RECIPIENT" \
       --input-type yaml --output-type yaml \
       "$SYNTH_PLAIN" > "$SYNTH_ENC" 2>"$WORK/sops.stderr"; then
  log_error "sops --encrypt failed on synthetic payload:"
  cat "$WORK/sops.stderr" >&2
  exit 6
fi

if ! sops --config /dev/null -d --input-type yaml --output-type dotenv \
       "$SYNTH_ENC" > "$SYNTH_DOTENV" 2>"$WORK/sops.stderr"; then
  log_error "sops -d --output-type=dotenv failed on synthetic ciphertext:"
  cat "$WORK/sops.stderr" >&2
  exit 7
fi

# Assert: SAMPLE_PASSWORD value contains the literal `$` and survives intact.
# We do NOT log the value itself — only confirm the line presence + shape.
if ! grep -qE '^SAMPLE_PASSWORD=.+\$.+$' "$SYNTH_DOTENV"; then
  fail "synthetic round-trip: SAMPLE_PASSWORD line missing or '\$' was stripped — Pitfall 1 regression"
fi
if ! grep -qE '^SAMPLE_BASE64=.+$' "$SYNTH_DOTENV"; then
  fail "synthetic round-trip: SAMPLE_BASE64 line missing"
fi
# Guard: no `${` interpolation marker appeared in the dotenv output.
if grep -qE '\$\{' "$SYNTH_DOTENV"; then
  fail "synthetic round-trip: dotenv output contains \${...} (Pitfall 1 — interpolation risk)"
fi
log_info "  synthetic round-trip: dotenv preserves '\$' literal AND no '\${' interpolation marker — Pitfall 1 guard green"

# -------- summary --------
log_info "OK env=$ENV_NAME — all sops dotenv round-trip checks passed"
exit 0
