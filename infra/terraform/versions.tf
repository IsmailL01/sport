# Terraform + provider version pin (Phase 3 / 03-01).
# Reference: 03-RESEARCH.md §Standard Stack + 03-PATTERNS.md §main.tf/versions.tf.
#
# `>= 1.11` обязателен — backend S3 `use_lockfile = true` (native S3 locking
# через If-None-Match conditional writes) стабилизирован в Terraform 1.11
# (без него нужен внешний DynamoDB-like blob, которого у Hetzner Object
# Storage нет — см. 03-RESEARCH.md §Pitfall 2).
#
# Hetzner provider `~> 1.62`: latest stable как на 2026-05; включает поддержку
# hcloud_storage_box (если provider version ниже — Plan 03-01 Task 2 §I1
# escalation срабатывает: storage_box.tf переименовывается в .skipped).
terraform {
  required_version = ">= 1.11"

  required_providers {
    hcloud = {
      source  = "hetznercloud/hcloud"
      version = "~> 1.62"
    }
  }
}
