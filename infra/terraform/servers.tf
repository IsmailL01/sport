# Hetzner Cloud Servers + SSH keys (Phase 3 / 03-01 / INFRA-02).
# Reference: 03-RESEARCH.md §Pattern 4 + §Code Examples + Plan 03-01 §B1 fix
# + §Pitfall 7 (ignore_changes) + §Pitfall 1 (sentry sizing).
#
# THREE servers:
#   1. prod_app_01    — EXISTING 148.253.214.156, imported (NOT recreated).
#                       Все attrs (server_type/location/image) приходят из
#                       var.prod_* (sourced из imported.auto.tfvars) — B1 fix.
#   2. staging_app_01 — NEW cx22 (greenfield, литералы OK).
#   3. sentry_01      — NEW cx42 (16 GB RAM минимум для Sentry self-hosted,
#                       cx32=8GB OOM-killed — §Pitfall 1 / D-11 correction).
#
# SSH keys: hcloud_ssh_key resource per dev (for_each по var.dev_ssh_pubkeys).
# Один и тот же набор ключей attached ко всем 3 серверам (D-19).

resource "hcloud_ssh_key" "devs" {
  for_each   = var.dev_ssh_pubkeys
  name       = "dev-${each.key}"
  public_key = each.value
  labels     = merge(local.common_labels, { role = "dev-ssh" })
}

# ============================================================================
# prod-app-01 — EXISTING server (148.253.214.156).
# ============================================================================
# B1 fix (Plan 03-01): server_type/location/image НЕ литералы — приходят
# из var.prod_* (imported.auto.tfvars). Гарантия: после terraform import
# (Task 3) plan показывает 0 diff на этих attributes — невозможно destroy+
# recreate prod из-за non-deterministic literal mismatch.
#
# Pitfall 7 mitigation: lifecycle.ignore_changes — image/user_data/ssh_keys
# drift (например, cloud-init re-run) не trigger'ит recreate.

resource "hcloud_server" "prod_app_01" {
  name = "prod-app-01"

  # B1 fix — ВСЕ 3 attrs из var.prod_* (imported.auto.tfvars):
  server_type = var.prod_server_type
  image       = var.prod_image
  location    = var.prod_location

  ssh_keys     = [for k in hcloud_ssh_key.devs : k.id]
  firewall_ids = [hcloud_firewall.app.id]

  labels = merge(local.common_labels, {
    env  = "prod"
    role = "app"
  })

  # Pitfall 7 — иначе любой post-create image/user_data drift trigger'ит
  # destroy+recreate prod (catastrophic). ssh_keys тоже игнорируем (если
  # dev key set меняется, перепривяжем явно через otдельный command).
  lifecycle {
    ignore_changes = [image, user_data, ssh_keys]
  }
}

# ============================================================================
# staging-app-01 — NEW greenfield server.
# ============================================================================
# Литералы здесь OK (это greenfield create, не import). Размер cx22 ≈ €4/mo;
# та же location, что и prod (var.prod_location) — latency parity для smoke
# probes из dev workstation.

resource "hcloud_server" "staging_app_01" {
  name        = "staging-app-01"
  server_type = "cx22"
  image       = "ubuntu-24.04"
  location    = var.prod_location # follow prod region

  ssh_keys     = [for k in hcloud_ssh_key.devs : k.id]
  firewall_ids = [hcloud_firewall.app.id]

  labels = merge(local.common_labels, {
    env  = "staging"
    role = "app"
  })
}

# ============================================================================
# sentry-01 — NEW greenfield observability server.
# ============================================================================
# CRITICAL: server_type = "cx42" (8 vCPU / 16 GB RAM) per RESEARCH §Pitfall 1
# + 03-CONTEXT §D-11 correction. Sentry self-hosted 2026 требует 16 GB RAM
# минимум; cx32 (8 GB) → OOM-killed контейнеры → restart loop.
# Phase 3 provisioning лишь host + Caddy + 443; Phase 5 install Sentry stack.

resource "hcloud_server" "sentry_01" {
  name        = "sentry-01"
  server_type = "cx42" # 16 GB RAM минимум — D-11 correction
  image       = "ubuntu-24.04"
  location    = var.prod_location # follow prod region

  ssh_keys     = [for k in hcloud_ssh_key.devs : k.id]
  firewall_ids = [hcloud_firewall.sentry.id]

  labels = merge(local.common_labels, {
    env  = "sentry"
    role = "observability"
  })
}
