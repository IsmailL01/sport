# Object Storage bucket for Terraform state — DOCUMENTATION ONLY (Phase 3 / 03-01).
# Reference: 03-RESEARCH.md §Pattern 5 + Plan 03-01 §Task 1 user-action.
#
# Bucket `running-ecosystem-tfstate` создаётся ВРУЧНУЮ через Hetzner Console UI
# В TASK 1 USER-ACTION CHECKPOINT — НЕ через Terraform.
#
# REASON (chicken-and-egg):
#   - backend.tf ссылается на bucket = "running-ecosystem-tfstate".
#   - Этот же state хранит описание bucket'a, если бы он был TF resource.
#   - Bootstrap circular dependency → bucket создаётся out-of-band.
#
# CREATION STEPS (Task 1 user-action):
#   1. Hetzner Cloud Console → Object Storage → Create Bucket.
#      Name: running-ecosystem-tfstate; Location: fsn1; Visibility: Private.
#   2. Object Storage → Credentials → Generate.
#      Скопировать AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY в SOPS:
#      .secrets/<env>/hetzner.yaml через `EDITOR=vim sops`.
#
# DO NOT CREATE bucket'a TERRAFORM resource в этом файле — нарушит bootstrap
# и приведёт к state corruption при первом apply (state файл хранит описание
# bucket'a, в котором этот же state хранится).
