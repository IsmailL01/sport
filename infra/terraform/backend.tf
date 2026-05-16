# Remote state backend → Hetzner Object Storage (S3-compatible) (INFRA-04).
# Reference: 03-RESEARCH.md §Pattern 5 + §Pitfall 2 + 03-CONTEXT.md §D-05.
#
# WHY Object Storage (not Storage Box):
#   - Storage Box = SFTP/WebDAV, нет conditional writes → state locking невозможен.
#   - Object Storage = S3-compatible с поддержкой If-None-Match → нативный
#     `use_lockfile = true` через Terraform 1.11+ → safe concurrent apply.
#   - 03-CONTEXT.md §D-05 (deferred → researcher → resolved): Object Storage win.
#
# CRITICAL: 4 skip-флага + use_lockfile + force_path_style — без них init
# зависает 30s на "Retrieving AWS account details" (HashiCorp issue #36924
# + Hetzner Object Storage не имеет STS endpoint). См. §Pitfall 2.
#
# BOOTSTRAP: bucket `running-ecosystem-tfstate` создаётся ВРУЧНУЮ через
# Hetzner Console UI ДО первого `terraform init` (chicken-and-egg: backend
# ссылается на bucket, который сам должен где-то храниться, но ещё нет state).
# См. Plan 03-01 Task 1 user-action checkpoint.
#
# AUTH: AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY экспортируются tf-wrap.sh
# из SOPS .secrets/<env>/hetzner.yaml — никогда не в backend block hardcoded.

terraform {
  backend "s3" {
    bucket = "running-ecosystem-tfstate"

    # Hetzner Object Storage endpoint — region-prefixed.
    # fsn1 = Falkenstein (Germany); регион выбирается user'ом в Task 1
    # (рекомендуется тот же регион, что и app VPS, для latency parity).
    endpoint = "https://fsn1.your-objectstorage.com"
    key      = "infra/prod.tfstate"

    # Hetzner-specific S3-compat региональный label (НЕ AWS region).
    region = "main"

    # CRITICAL skip-флаги для не-AWS S3-compat backends:
    skip_credentials_validation = true
    skip_metadata_api_check     = true
    skip_region_validation      = true
    skip_requesting_account_id  = true # без этого `terraform init` виснет — issue #36924

    # Native S3 locking через If-None-Match (Terraform 1.11+).
    # Заменяет legacy DynamoDB lock table (которого у Hetzner нет).
    use_lockfile = true

    # Ceph-S3 совместимость — Hetzner Object Storage не поддерживает
    # virtual-hosted-style (`<bucket>.endpoint`); требует path-style
    # (`endpoint/<bucket>`).
    force_path_style = true
  }
}
