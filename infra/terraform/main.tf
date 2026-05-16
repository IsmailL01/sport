# Provider config + common labels (Phase 3 / 03-01).
# Reference: 03-RESEARCH.md §Code Examples + 03-PATTERNS.md §main.tf.
#
# HCLOUD_TOKEN никогда не хардкодится здесь — приходит из SOPS-encrypted
# .secrets/<env>/hetzner.yaml через tf-wrap.sh (decrypt → export → exec
# terraform). См. infra/terraform/tf-wrap.sh + docs/RUNBOOKS/sops-edit.md §9.

provider "hcloud" {
  token = var.hcloud_token
}

locals {
  # Labels приклеиваются ко всем managed Hetzner Cloud resources — отличают
  # Terraform-managed от manual'ных ресурсов (audit pivot) + facilitate
  # `hcloud server list -l managed_by=terraform` filtering.
  common_labels = {
    managed_by = "terraform"
    milestone  = "v1.0"
  }
}
