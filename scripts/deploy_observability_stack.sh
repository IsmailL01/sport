#!/usr/bin/env bash
# Phase 5 / Plan 05-07 v2 — Deploy Loki+Prom+Grafana stack to srv1561293
# Idempotent: re-running this script applies deltas; safe for repeat invocations.
#
# Pre-reqs:
#   - SOPS_AGE_KEY_FILE set (or ~/.config/sops/age/keys.txt findable)
#   - `ssh myvps` works passwordless
#   - infra/observability-stack/ staged in repo (Plan 05-07 Tasks 1-3)
#
# Usage:
#   ./scripts/deploy_observability_stack.sh           # full deploy
#   ./scripts/deploy_observability_stack.sh --dry-run # stage locally only; no scp/ssh
#
# niko-prod hands-off invariants (verified post-deploy):
#   - System nginx PID unchanged (master PID 2733838 + 4 workers)
#   - 8 niko-prod-* container IDs unchanged
#   - /etc/nginx/*.conf md5sums unchanged
#   - Only :8443 added to public UFW (no :80/:443 touched)
#   - Docker network `observability_internal` separate from niko-prod_*

set -euo pipefail

# ---------- CONFIG ----------
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCAL_STAGING="$REPO_ROOT/infra/observability-stack"
REMOTE_TARGET="myvps:/opt/observability-stack"
PROD_VPS_IP="${PROD_VPS_IP:-148.253.214.156}"
AGE_RECIPIENT="age1ph7d4a62n9ngghvt5lzgh4eywfayzgrzx9mq6rfzpgp9sme0eg0snl33my"
CADDY_VERSION="2.8.4"

DRY_RUN=false
if [ "${1:-}" = "--dry-run" ]; then DRY_RUN=true; fi

# ---------- PREFLIGHT ----------
echo "[preflight] Checking environment..."

if [ -z "${SOPS_AGE_KEY_FILE:-}" ]; then
    if [ -f "$HOME/.config/sops/age/keys.txt" ]; then
        export SOPS_AGE_KEY_FILE="$HOME/.config/sops/age/keys.txt"
        echo "  SOPS_AGE_KEY_FILE auto-set to: $SOPS_AGE_KEY_FILE"
    else
        echo "ABORT: SOPS_AGE_KEY_FILE not set and ~/.config/sops/age/keys.txt missing" >&2
        exit 1
    fi
fi

test -d "$LOCAL_STAGING" || { echo "ABORT: $LOCAL_STAGING missing — run from repo root" >&2; exit 1; }
test -f "$REPO_ROOT/.secrets/prod/sentry.yaml" || { echo "ABORT: .secrets/prod/sentry.yaml missing — run Plan 05-02 first" >&2; exit 1; }
command -v sops >/dev/null || { echo "ABORT: sops binary not found" >&2; exit 1; }
command -v rsync >/dev/null || { echo "ABORT: rsync not found" >&2; exit 1; }

if ! $DRY_RUN; then
    ssh -o BatchMode=yes -o ConnectTimeout=5 myvps 'echo ok' >/dev/null 2>&1 || {
        echo "ABORT: ssh myvps not reachable" >&2; exit 1
    }
fi

echo "  preflight OK"

# ---------- SOPS-DECRYPT secrets (local, ephemeral shell vars) ----------
echo "[secrets] Decrypting .secrets/prod/sentry.yaml on controller (delegate_to: localhost pattern)..."

PROD_SECRETS=$(sops --decrypt "$REPO_ROOT/.secrets/prod/sentry.yaml")
extract() { echo "$PROD_SECRETS" | awk -v key="$1" 'BEGIN{FS=": "} $1==key {gsub(/^"|"$/, "", $2); print $2}'; }

GRAFANA_PWD=$(extract GRAFANA_ADMIN_PASSWORD)
GRAFANA_BCRYPT=$(extract GRAFANA_ADMIN_PASSWORD_BCRYPT)
TELEGRAM_TOKEN=$(extract TELEGRAM_BOT_TOKEN)
TELEGRAM_CHAT_ID=$(extract TELEGRAM_CHAT_ID)

# Validate (no value echo)
[ -n "$GRAFANA_PWD" ]    || { echo "ABORT: GRAFANA_ADMIN_PASSWORD empty in SOPS" >&2; exit 1; }
[ -n "$GRAFANA_BCRYPT" ] || { echo "ABORT: GRAFANA_ADMIN_PASSWORD_BCRYPT empty in SOPS" >&2; exit 1; }
[ -n "$TELEGRAM_TOKEN" ] || { echo "ABORT: TELEGRAM_BOT_TOKEN empty in SOPS" >&2; exit 1; }
[ -n "$TELEGRAM_CHAT_ID" ] || { echo "ABORT: TELEGRAM_CHAT_ID empty in SOPS" >&2; exit 1; }
echo "  secrets extracted (4 non-empty values; never echoed)"

# ---------- BUILD render dir (substituted templates) ----------
RENDER_DIR=$(mktemp -d /tmp/observability-stack-render.XXXXXX)
trap "rm -rf $RENDER_DIR" EXIT

echo "[render] Building substituted configs in $RENDER_DIR..."

# Mirror the source dir tree
rsync -a --exclude='*.template' "$LOCAL_STAGING/" "$RENDER_DIR/"

# Substitute templates
sed "s|{{PROD_VPS_IP}}|$PROD_VPS_IP|g" \
    "$LOCAL_STAGING/prometheus/prometheus.yml.template" \
    > "$RENDER_DIR/prometheus/prometheus.yml"

# Telegram contact-point — substitute token + chat_id (using a different delim to avoid / in URLs)
sed "s|{{TELEGRAM_BOT_TOKEN}}|$TELEGRAM_TOKEN|g; s|{{TELEGRAM_CHAT_ID}}|$TELEGRAM_CHAT_ID|g" \
    "$LOCAL_STAGING/grafana/provisioning/alerting/contact-points.yml.template" \
    > "$RENDER_DIR/grafana/provisioning/alerting/contact-points.yml"

# Remove template files from render output (only keep rendered .yml versions)
rm -f "$RENDER_DIR/prometheus/prometheus.yml.template"
rm -f "$RENDER_DIR/grafana/provisioning/alerting/contact-points.yml.template"

# Sync dashboard JSONs from services/backend/observability/dashboards/ if Plan 05-04 has shipped them
DASH_SRC="$REPO_ROOT/services/backend/observability/dashboards"
DASH_DST="$RENDER_DIR/grafana/provisioning/dashboards/files"
mkdir -p "$DASH_DST"
if [ -d "$DASH_SRC" ] && [ -n "$(ls -A "$DASH_SRC" 2>/dev/null)" ]; then
    cp -v "$DASH_SRC"/*.json "$DASH_DST/" 2>/dev/null || true
    echo "  $(ls -1 "$DASH_DST" | grep -c '\.json$') dashboard JSONs synced"
else
    echo "  no dashboards in $DASH_SRC yet (Plan 05-04 ships them)"
fi

# Write Grafana admin password file
echo -n "$GRAFANA_PWD" > "$RENDER_DIR/grafana/secrets/admin_password"
chmod 600 "$RENDER_DIR/grafana/secrets/admin_password"

# Write Caddy bcrypt hash to a separate file (Caddyfile uses {file./etc/caddy/bcrypt.hash})
# Avoids systemd EnvironmentFile $-escaping (this systemd version does NOT collapse $$ → $,
# Caddy then sees literal $$ and fails basicauth parsing).
CADDY_BCRYPT=$(mktemp /tmp/caddy-bcrypt.hash.XXXXXX)
chmod 600 "$CADDY_BCRYPT"
printf '%s' "$GRAFANA_BCRYPT" > "$CADDY_BCRYPT"

# Write Caddy secrets.env for non-bcrypt env vars (Loki IP allowlist — safe from $ issues)
CADDY_SECRETS=$(mktemp /tmp/caddy-secrets.env.XXXXXX)
chmod 600 "$CADDY_SECRETS"
cat > "$CADDY_SECRETS" <<EOF
LOKI_PUSH_ALLOWED_SOURCE=$PROD_VPS_IP/32
EOF

echo "  templates substituted + render dir ready ($(du -sh "$RENDER_DIR" | cut -f1))"

if $DRY_RUN; then
    echo
    echo "[DRY RUN] Would rsync the following to $REMOTE_TARGET:"
    find "$RENDER_DIR" -type f | sed "s|$RENDER_DIR/||"
    echo
    echo "[DRY RUN] Would scp $CADDY_SECRETS → myvps:/etc/caddy/secrets.env"
    echo "[DRY RUN] Would install systemd units + caddy binary + enable services"
    echo "[DRY RUN] Skipping ssh/scp; render dir preserved at $RENDER_DIR for inspection"
    trap - EXIT  # don't auto-cleanup render dir on dry-run
    rm -f "$CADDY_SECRETS"
    exit 0
fi

# ---------- REMOTE DEPLOY ----------
echo "[remote] Preparing remote dirs on myvps..."
ssh myvps 'mkdir -p /opt/observability-stack /etc/caddy /var/lib/caddy /var/log/caddy && chmod 700 /etc/caddy /var/lib/caddy'

echo "[remote] rsync $RENDER_DIR → $REMOTE_TARGET ..."
rsync -az --delete \
    --exclude='*.template' \
    --exclude='.gitkeep' \
    "$RENDER_DIR/" "$REMOTE_TARGET/"

echo "[remote] scp Caddy secrets.env + bcrypt.hash → /etc/caddy/"
scp -q "$CADDY_SECRETS" myvps:/etc/caddy/secrets.env
scp -q "$CADDY_BCRYPT" myvps:/etc/caddy/bcrypt.hash
ssh myvps 'chmod 600 /etc/caddy/secrets.env /etc/caddy/bcrypt.hash'
rm -P "$CADDY_SECRETS" "$CADDY_BCRYPT" 2>/dev/null || rm -f "$CADDY_SECRETS" "$CADDY_BCRYPT"

echo "[remote] scp Caddyfile → /etc/caddy/Caddyfile"
scp -q "$RENDER_DIR/caddy/Caddyfile" myvps:/etc/caddy/Caddyfile

# Install Caddy binary if absent
echo "[remote] Ensuring caddy binary at /usr/local/bin/caddy ..."
ssh myvps "which caddy >/dev/null 2>&1 || (
    cd /tmp &&
    curl -fsSL 'https://github.com/caddyserver/caddy/releases/download/v${CADDY_VERSION}/caddy_${CADDY_VERSION}_linux_amd64.tar.gz' -o caddy.tgz &&
    tar -xzf caddy.tgz caddy &&
    mv caddy /usr/local/bin/caddy &&
    chmod +x /usr/local/bin/caddy &&
    rm caddy.tgz &&
    /usr/local/bin/caddy version
)"

# Install systemd units
echo "[remote] Installing systemd units..."
scp -q "$RENDER_DIR/systemd/observability-stack.service" myvps:/etc/systemd/system/observability-stack.service
scp -q "$RENDER_DIR/systemd/observability-caddy.service" myvps:/etc/systemd/system/observability-caddy.service
ssh myvps 'systemctl daemon-reload'

# UFW: open :8443 if not already
echo "[remote] Ensuring UFW allows :8443/tcp ..."
ssh myvps 'ufw status | grep -q "8443/tcp" || ufw allow 8443/tcp comment "observability-stack Caddy (Phase 5)"'

# Enable + start
echo "[remote] Enabling + starting observability-stack.service ..."
ssh myvps 'systemctl enable --now observability-stack.service'

# Wait for containers up
echo "  waiting 15s for containers to come up..."
sleep 15

echo "[remote] Enabling + starting observability-caddy.service ..."
ssh myvps 'systemctl enable --now observability-caddy.service'

sleep 3
echo
echo "=== systemctl status (oneliner) ==="
ssh myvps 'systemctl is-active observability-stack.service observability-caddy.service'

echo
echo "=== docker ps observability containers ==="
ssh myvps 'docker ps --filter "name=observability-" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"'

echo
echo "[deploy] Done. Run scripts/smoke_observability_stack.py + scripts/smoke_grafana_alerts.py to verify."
