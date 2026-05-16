#!/usr/bin/env bash
# tf-wrap.sh — Terraform wrapper c SOPS decrypt (Phase 3 / 03-01).
# Reference: 03-PATTERNS.md §Pattern A + docs/RUNBOOKS/sops-edit.md §9.
#
# Inherits Phase 2 deploy seam pattern:
#   1. umask 077 — блокирует other-UID readers любых temp files.
#   2. SOPS_AGE_KEY_FILE из XDG path (`~/.config/sops/age/keys.txt`) default.
#   3. SOPS decrypt в process env через `eval` (НЕ landing на disk —
#      tf-wrap process inherit env; terraform получает HCLOUD_TOKEN +
#      AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY через ENV).
#   4. exec terraform "$@" — process-substitute, no parent shell остаётся.
#
# WHY eval + dotenv:
#   - `sops -d --output-type=dotenv <file>` выдаёт `KEY=VALUE` lines.
#   - `sed 's/^/export /'` prepend'ит `export ` → shell-loadable.
#   - `eval "$(...)"` грузит в текущий процесс ENV — terraform читает через
#     `var.hcloud_token = HCLOUD_TOKEN` + S3 backend читает AWS_* нативно.
#
# USAGE:
#   ./infra/terraform/tf-wrap.sh init
#   ./infra/terraform/tf-wrap.sh plan
#   ./infra/terraform/tf-wrap.sh apply
#   TF_ENV=staging ./infra/terraform/tf-wrap.sh plan   # override env
#
# Default env: prod (single Hetzner project per CONTEXT D-02 — same token
# для всех 3 env'ов; разные SOPS slots на случай ротации per-env в будущем).

set -euo pipefail
umask 077

ENV="${TF_ENV:-prod}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

export SOPS_AGE_KEY_FILE="${SOPS_AGE_KEY_FILE:-$HOME/.config/sops/age/keys.txt}"

SECRETS_FILE="${REPO_ROOT}/.secrets/${ENV}/hetzner.yaml"
if [ ! -f "${SECRETS_FILE}" ]; then
  echo "FATAL: SOPS secrets file not found: ${SECRETS_FILE}" >&2
  echo "Expected env=${ENV}; available: $(ls -1 ${REPO_ROOT}/.secrets/ 2>/dev/null | tr '\n' ' ')" >&2
  exit 1
fi

# Decrypt SOPS → exported env vars в текущий процесс.
# `eval` нужен потому что `sops --output-type=dotenv` выдаёт KEY=VALUE строки
# которые надо превратить в `export KEY=VALUE` для shell.
# no_log equivalent: stderr только при ошибке (terraform автоматически
# маскирует sensitive=true variable values в plan output).
if ! eval "$(sops -d --output-type=dotenv "${SECRETS_FILE}" | sed 's/^/export /')"; then
  echo "FATAL: SOPS decrypt failed for ${SECRETS_FILE}" >&2
  echo "Check: SOPS_AGE_KEY_FILE=${SOPS_AGE_KEY_FILE} exists и содержит DEV_A age key." >&2
  exit 1
fi

# Fail-fast guard: убедиться что после decrypt все 3 credentials в env.
# REPLACE_ME = placeholder; user должен заполнить реальные значения в Task 1.
for key in HCLOUD_TOKEN AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY; do
  val="${!key:-}"
  if [ -z "${val}" ] || [ "${val}" = "REPLACE_ME" ]; then
    echo "FATAL: ${key} not set or still REPLACE_ME in ${SECRETS_FILE}." >&2
    echo "Run Plan 03-01 Task 1 (human-action checkpoint) — paste real Hetzner creds via:" >&2
    echo "  EDITOR=vim sops ${SECRETS_FILE}" >&2
    exit 1
  fi
done

# Terraform reads HCLOUD_TOKEN через variable "hcloud_token" в variables.tf.
# Передаём через TF_VAR_* convention (Terraform автоматически maps env →
# variable.<lowercase>).
export TF_VAR_hcloud_token="${HCLOUD_TOKEN}"

cd "${SCRIPT_DIR}"
exec terraform "$@"
