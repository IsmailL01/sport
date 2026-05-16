# Hetzner Cloud Firewall rules (Phase 3 / 03-01 / INFRA-05).
# Reference: 03-RESEARCH.md §Pattern 6 + 03-CONTEXT.md §D-06 §D-07 §D-08.
#
# DESIGN: 2 firewall instances для разделения blast-radius:
#   - hcloud_firewall.app    → attached к prod-app-01 + staging-app-01
#                              (single shared firewall — оба host'а run identical
#                              stack; ssh-allow list одна и та же).
#   - hcloud_firewall.sentry → attached к sentry-01 (отдельный VPS per D-09;
#                              Phase 5 install Sentry self-hosted поверх).
#
# RULES (INFRA-05 acceptance):
#   - 443/TCP from 0.0.0.0/0 + ::/0  — Caddy public (TLS terminated; HTTP→HTTPS
#                                       redirect через Caddy `redir 308`, не open 80).
#   - 22/TCP  from var.dev_admin_ips — SSH admin-only (D-19, /32 dev workstations).
#   - НЕ открыты: 80 (Caddy redir 308) / 4222 (NATS internal, D-07) /
#                 5432 (Postgres internal) / 6379 (Redis internal) /
#                 9000 (MinIO internal, exposed через Caddy s3.<host> на 443, D-08).
#   - Egress: default-allow (Hetzner Cloud Firewall — нет egress rules = разрешено всё).

resource "hcloud_firewall" "app" {
  name = "app-public"

  # 443/TCP — Caddy public TLS
  rule {
    direction  = "in"
    protocol   = "tcp"
    port       = "443"
    source_ips = ["0.0.0.0/0", "::/0"]
  }

  # 22/TCP — admin SSH (dev workstations only)
  rule {
    direction  = "in"
    protocol   = "tcp"
    port       = "22"
    source_ips = var.dev_admin_ips
  }

  labels = merge(local.common_labels, { role = "app-firewall" })
}

resource "hcloud_firewall" "sentry" {
  name = "sentry-public"

  # 443/TCP — Sentry web UI (Phase 5 installs Sentry self-hosted поверх)
  rule {
    direction  = "in"
    protocol   = "tcp"
    port       = "443"
    source_ips = ["0.0.0.0/0", "::/0"]
  }

  # 22/TCP — admin SSH
  rule {
    direction  = "in"
    protocol   = "tcp"
    port       = "22"
    source_ips = var.dev_admin_ips
  }

  labels = merge(local.common_labels, { role = "sentry-firewall" })
}
