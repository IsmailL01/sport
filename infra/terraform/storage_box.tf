# Hetzner Storage Box (Phase 3 / 03-01 / Phase 7 pgBackRest carry-over).
# Reference: 03-RESEARCH.md §D-05 resolution + 03-CONTEXT.md §D-04.
#
# WHY Storage Box (NOT TF state backend):
#   - 03-CONTEXT §D-05 deferred → resolved: Storage Box = SFTP/WebDAV, нет
#     conditional writes → TF state locking невозможен → TF state живёт
#     в Object Storage (backend.tf). Storage Box получает Phase 7
#     pgBackRest target role (SFTP push from prod-app-01 → encrypted backups).
#
# SIZE: bx10 = 1 TB, ~€3/mo — минимально достаточно для нескольких месяцев
# pgBackRest full+incremental retention для closed-beta scale (≤10 users).
#
# I1 fix (Plan 03-01 Task 2):
#   Если hcloud_storage_box resource НЕ поддержан в текущей provider версии
#   (`hetznercloud/hcloud ~> 1.62`) — этот файл renaming'ится в
#   `storage_box.tf.skipped` и plan execution aborts с WARN (no silent
#   degradation INFRA-04).
#
#   Verify через `terraform providers schema -json | jq '... hcloud_storage_box'`
#   после Task 3 init step.

resource "hcloud_storage_box" "pgbackrest" {
  name             = "pgbackrest-prod"
  location         = "fsn1"           # Falkenstein — близко к app VPS (prod region)
  storage_box_type = "bx10"           # 1 TB, ~€3/mo
  password         = var.hcloud_token # placeholder — Phase 7 wires реальный SFTP password
  labels = merge(local.common_labels, {
    role    = "pgbackrest-target"
    purpose = "phase7-backup"
  })
}
