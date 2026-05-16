# Terraform outputs — экспорты для Wave 2 Ansible inventory generation.
# Reference: 03-CONTEXT §dependencies Wave 2 + Plan 03-01 §Task 2.
#
# Wave 2 (Plan 03-02) консумирует:
#   `./tf-wrap.sh output -raw staging_app_ipv4` → inventory/staging/hosts.yml
#   `./tf-wrap.sh output -raw prod_app_ipv4`    → inventory/prod/hosts.yml
#   `./tf-wrap.sh output -raw sentry_ipv4`      → inventory/sentry/hosts.yml

output "prod_app_ipv4" {
  value       = hcloud_server.prod_app_01.ipv4_address
  description = "Public IPv4 of prod-app-01 (expected: 148.253.214.156 после import)."
}

output "staging_app_ipv4" {
  value       = hcloud_server.staging_app_01.ipv4_address
  description = "Public IPv4 of staging-app-01 (greenfield, IP назначается Hetzner'ом)."
}

output "sentry_ipv4" {
  value       = hcloud_server.sentry_01.ipv4_address
  description = "Public IPv4 of sentry-01 (greenfield; для DNS sentry.<ip>.sslip.io per D-09)."
}

output "storage_box_subuser" {
  value       = hcloud_storage_box.pgbackrest.username
  sensitive   = true
  description = "Storage Box subuser username (Phase 7 pgBackRest SFTP target). Sensitive: имя содержит numeric account ID."
}
