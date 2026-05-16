# Input variables (Phase 3 / 03-01).
# Reference: 03-RESEARCH.md §Standard Stack + Plan 03-01 §B1 fix.
#
# DESIGN NOTE (B1 fix): prod_server_id / prod_server_type / prod_location /
# prod_image НЕ имеют defaults и НЕ дублируются в terraform.tfvars. Они
# приходят ИСКЛЮЧИТЕЛЬНО из `imported.auto.tfvars`, который user заполняет
# в Task 1 после `hcloud server describe prod-app-01 -o json | jq ...`.
# Terraform автоматически загружает любые `*.auto.tfvars` без `-var-file`.
# Если файла нет → plan fails fast → executor не может выбрать литерал →
# устранён risk destroy+recreate prod-app-01 (T-03-05 mitigation).

variable "hcloud_token" {
  type        = string
  sensitive   = true
  description = "Hetzner Cloud API token (read+write). Source: SOPS .secrets/<env>/hetzner.yaml через tf-wrap.sh. НИКОГДА не commit'ить в terraform.tfvars."
}

variable "dev_admin_ips" {
  type        = list(string)
  description = "List of /32 IPv4 CIDRs от dev workstations — единственные source IPs для SSH (port 22) per INFRA-05. Заполняется в terraform.tfvars; gitignored."
}

variable "dev_ssh_pubkeys" {
  type        = map(string)
  description = "Map of dev_name → ssh-ed25519 public key. Installed на VPS через hcloud_ssh_key resources. DEV_B carry-over per Phase 2 follow-up #5."
}

# --- prod-app-01 attributes (B1 fix — sourced из imported.auto.tfvars) ---
#
# Эти 4 variables НЕ имеют defaults — Terraform требует значения через
# auto.tfvars или CLI -var. `imported.auto.tfvars` (gitignored) — единственный
# source of truth; заполняется в Task 1 user-action из `hcloud server describe`.

variable "prod_server_id" {
  type        = string
  description = "Existing prod-app-01 numeric server ID (для terraform import). Source: imported.auto.tfvars (Task 1 user-action)."
}

variable "prod_server_type" {
  type        = string
  description = "Existing prod-app-01 server_type (e.g. cx22 / cx32). Source: imported.auto.tfvars (B1 fix — eliminates non-deterministic literal in servers.tf which could trigger destroy+recreate)."
}

variable "prod_location" {
  type        = string
  description = "Existing prod-app-01 location (nbg1 | fsn1 | hel1). Source: imported.auto.tfvars (B1 fix)."
}

variable "prod_image" {
  type        = string
  description = "Existing prod-app-01 image (e.g. ubuntu-24.04). Source: imported.auto.tfvars (B1 fix)."
}
