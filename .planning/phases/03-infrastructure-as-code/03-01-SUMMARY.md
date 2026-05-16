---
phase: 03-infrastructure-as-code
plan: 01
subsystem: infra
tags: [terraform, hetzner-cloud, sops, ansible, iac, hcl, state-backend, s3]

# Dependency graph
requires:
  - phase: 02-secrets-and-config-hardening
    provides: SOPS slot pattern (.secrets/<env>/<group>.yaml), age-recipient regex `.secrets/.*\.yaml$`, sops-edit.md §9 deploy seam pattern (umask 077 + trap shred + tmpfs), pre-commit gitleaks hook (allow-lists encrypted .secrets/**)
provides:
  - Terraform scaffold для Hetzner Cloud (11 .tf files + tf-wrap.sh + lock)
  - 3 SOPS slots `.secrets/{dev,staging,prod}/hetzner.yaml` с REPLACE_ME placeholders
  - .gitignore patches под Terraform artifacts (state, tfvars, imported.auto.tfvars, *.tfplan)
  - Local tooling: Terraform 1.13.1 (~/.local/bin direct binary install) + ansible-core 2.20.5 (brew) + 3 ansible-galaxy collections
affects: [03-02 ansible scaffold, 03-03a sport-stack, 03-03b sentry-prep, 03-04 cutover, 07-pgbackrest]

# Tech tracking
tech-stack:
  added:
    - "terraform 1.13.1 (HashiCorp official binary — Homebrew BSL excluded)"
    - "hetznercloud/hcloud provider v1.63.0 (lock-pinned)"
    - "ansible-core 2.20.5 + community.sops 2.3.0 + community.docker 5.2.0 + hetzner.hcloud 6.8.0"
  patterns:
    - "tf-wrap.sh decrypt-via-process-env (inherits Phase 2 deploy.sh §9 SOPS pattern)"
    - "B1 fix: prod-server attrs ИЗ imported.auto.tfvars (gitignored, runtime-generated) — устраняет non-determinism литералов в servers.tf"
    - "skip_requesting_account_id + use_lockfile + force_path_style — обязательный набор для не-AWS S3-compat backends (HashiCorp issue #36924)"
    - "lifecycle.ignore_changes на prod-app-01 — image/user_data/ssh_keys drift не trigger'ит recreate (§Pitfall 7)"

key-files:
  created:
    - infra/terraform/versions.tf
    - infra/terraform/main.tf
    - infra/terraform/backend.tf
    - infra/terraform/variables.tf
    - infra/terraform/terraform.tfvars.example
    - infra/terraform/firewall.tf
    - infra/terraform/servers.tf
    - infra/terraform/storage_box.tf
    - infra/terraform/object_storage_state.tf
    - infra/terraform/outputs.tf
    - infra/terraform/tf-wrap.sh
    - infra/terraform/.terraform.lock.hcl
    - .secrets/dev/hetzner.yaml
    - .secrets/staging/hetzner.yaml
    - .secrets/prod/hetzner.yaml
  modified:
    - .gitignore

key-decisions:
  - "Terraform 1.13.1 via direct HashiCorp binary в ~/.local/bin (Homebrew core dropped Terraform за BSL; HashiCorp tap blocked by outdated Xcode CLT)"
  - "D-05 confirmed via terraform validate: hcloud_storage_box supported в hcloud provider v1.63.0 → I1 escalation NOT triggered, storage_box.tf stays canonical (НЕ .skipped)"
  - "D-11 corrected applied: sentry-01 = cx42 (16 GB RAM), не cx32 — Sentry self-hosted 2026 минимум"
  - "B1 fix applied: prod_app_01 server_type/location/image приходят из var.prod_* (sourced из imported.auto.tfvars в Task 1) — НИ ОДНОГО литерала cx22/cx32/nbg1/ubuntu-24.04 в prod block"

patterns-established:
  - "Pattern A inheritance: tf-wrap.sh повторяет deploy.sh §9 umask+SOPS-decrypt-via-eval+tmpfs pattern (no plaintext credentials lands on disk; .terraform/-isolated)"
  - "Pattern C inheritance: .sops.yaml regex `.secrets/.*\\.yaml$` автопокрывает новые SOPS slots — никаких изменений config не требуется (Phase 2 Mapbox precedent)"
  - "HCL-first ordering: все .tf написаны ДО любого `terraform init`/`import`/`apply` — §Pitfall 10 enforced"
  - "B1 fix pattern: existing-resource attrs приходят из *.auto.tfvars (auto-loaded), не из executor-chosen literals — устраняет class of destroy+recreate bugs для imported resources"

requirements-completed: []  # INFRA-02/INFRA-04/INFRA-05 ЧАСТИЧНО (HCL scaffold готов, но не apply'ено — закрытие после Task 1 human-action + Task 3 init/import/apply)

# Metrics
duration: ~10 min (Task 0 + Task 2; Task 1 ожидает human-action; Task 3 не запущен)
completed: 2026-05-16
---

# Phase 3 Plan 01: Infrastructure as Code (Wave 1 / Terraform scaffold) Summary

**Terraform scaffold (11 .tf файлов + tf-wrap.sh + provider lock) под Hetzner Cloud готов; SOPS slot pattern inherited из Phase 2; ХАЛТ на Task 1 human-action checkpoint (Hetzner Console API token + Object Storage bucket + hcloud server describe для prod-app-01 attrs).**

## Performance

- **Duration:** ~10 min (Wave 0 + Task 2 scaffold; Task 1 human-action блокирует Task 3 init/import/apply)
- **Started:** 2026-05-16 (worktree-agent-a3105aec3440ccf87)
- **Status at HALT:** Task 0 ✅ committed · Task 2 ✅ committed · Task 1 ⏸ awaiting human-action · Task 3 ⬜ pending
- **Tasks completed (executor):** 2 / 4 (Task 1 = checkpoint, не executable)
- **Files modified:** 16 (15 created + 1 modified)

## Accomplishments

- **Wave 0 prereqs зелёные:** Terraform 1.13.1 (>= 1.11), ansible-core 2.20.5 (>= 2.16), все 3 ansible-galaxy collections (community.sops 2.3.0, community.docker 5.2.0, hetzner.hcloud 6.8.0). `.gitignore` патчи закрывают INFRA-04 T-03-01 mitigation (state never в repo).
- **3 SOPS slots `.secrets/{dev,staging,prod}/hetzner.yaml`** созданы и encrypted под DEV_A age key; decrypt roundtrip green для всех 3. Содержат REPLACE_ME placeholders (user заполняет в Task 1). `.sops.yaml` regex `.secrets/.*\.yaml$` автопокрыл новый slot — никаких изменений config (Pattern C inheritance, Phase 2 Mapbox precedent).
- **Terraform scaffold (11 файлов) синтаксически валидный:** `terraform fmt -check` clean, `terraform validate` green против hcloud provider 1.63.0. Все 4 critical skip-флага + use_lockfile + force_path_style в backend.tf (без них init виснет — HashiCorp issue #36924).
- **B1 fix applied:** servers.tf prod_app_01 block ссылается на `var.prod_server_type`/`var.prod_location`/`var.prod_image` — НИ ОДНОГО литерала cx22/cx32/nbg1/fsn1/hel1/ubuntu-24.04. Значения придут из `imported.auto.tfvars` (gitignored, runtime-generated в Task 1 user-action). variables.tf декларирует prod_* без defaults → plan fails fast если файла нет.
- **D-11 correction applied:** sentry-01 = cx42 (16 GB RAM минимум для Sentry self-hosted 2026), не cx32 (8 GB → OOM).
- **D-05 resolution applied + I1 NOT triggered:** `hcloud_storage_box` resource подтверждён доступным в hcloud provider v1.63.0 через `terraform validate` (deliberate fake-resource test показал, что validate действительно verifies resource types против schema). storage_box.tf остаётся канонический — НЕ переименован в .skipped.
- **`tf-wrap.sh` wrapper готов:** наследует Phase 2 deploy.sh §9 pattern (`umask 077` + SOPS decrypt в process env через `eval`); fail-fast guard блокирует REPLACE_ME placeholder (user должен закрыть Task 1 первым).

## Task Commits

1. **Task 0 — Wave 0 prereqs (.gitignore + 3 SOPS slots + tooling install)** — `63a0c14` (chore)
2. **Task 2 — Terraform scaffold (11 .tf + tf-wrap.sh + lock)** — `697e53b` (feat)
3. **Task 1 — USER ACTION** — ⏸ AWAITING CHECKPOINT (no commit; human must paste Hetzner creds + capture prod attrs)
4. **Task 3 — terraform init + import + apply** — ⬜ BLOCKED on Task 1 (cannot run until SOPS slots contain real creds and imported.auto.tfvars exists)

## Files Created/Modified

### Created (15 files)

**Terraform scaffold** (`infra/terraform/`):
- `versions.tf` — Terraform >= 1.11 + hcloud ~> 1.62 pin
- `main.tf` — provider config (token из var.hcloud_token) + locals.common_labels
- `backend.tf` — S3 backend против `running-ecosystem-tfstate` bucket в Falkenstein
- `variables.tf` — 7 vars; prod_* без defaults (B1 fix)
- `terraform.tfvars.example` — placeholder dev_admin_ips + dev_ssh_pubkeys
- `firewall.tf` — 2 firewalls (app + sentry), ТОЛЬКО 443+22 открыты
- `servers.tf` — prod_app_01 (var-driven, B1) + staging_app_01 (cx22 greenfield) + sentry_01 (cx42 D-11)
- `storage_box.tf` — bx10 для Phase 7 pgBackRest target
- `object_storage_state.tf` — docs-only комментарий (bucket out-of-band)
- `outputs.tf` — 4 outputs для Wave 2 inventory generation
- `tf-wrap.sh` — wrapper c SOPS decrypt (executable)
- `.terraform.lock.hcl` — provider lock (commitable)

**SOPS slots** (`.secrets/`):
- `dev/hetzner.yaml`, `staging/hetzner.yaml`, `prod/hetzner.yaml` — encrypted под DEV_A age key

### Modified (1 file)

- `.gitignore` — 5 Terraform patterns + директория .terraform/

## Decisions Made

- **Terraform install via direct HashiCorp binary в ~/.local/bin** — `brew install terraform` НЕ работает (Terraform удалён из homebrew/core за BSL licensing); `brew install hashicorp/tap/terraform` блокирован устаревшим Xcode CLT на этой машине. Fall-back: `curl -O terraform_1.13.1_darwin_arm64.zip` от releases.hashicorp.com → unzip → ~/.local/bin/terraform. Решение dev-workstation-local, не в repo (Rule 3 auto-fix — blocking issue с alternative solution).
- **D-05 confirmation (Object Storage не Storage Box для TF state)** — следуем RESEARCH §Pattern 5 решению; backend.tf использует S3 backend, storage_box.tf отдельно для Phase 7 pgBackRest.
- **D-11 correction applied** — sentry-01 = cx42 в servers.tf (16 GB RAM), не cx32; пометил в commit message.
- **B1 fix applied** — variable "prod_server_type"/"prod_location"/"prod_image" объявлены без defaults; servers.tf ссылается на var.prod_*; никаких литералов cx22/cx32/nbg1/fsn1/hel1/ubuntu-24.04 в prod_app_01 block. Это гарантирует, что после Task 3 import, plan показывает 0 diff на этих attributes (не destroy+recreate prod).
- **I1 escalation НЕ triggered** — `terraform validate` (с deliberate fake-resource control test) подтвердил, что `hcloud_storage_box` доступен в hcloud provider v1.63.0; storage_box.tf остаётся канонический.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Terraform install via direct HashiCorp binary (Homebrew core dropped Terraform)**
- **Found during:** Task 0 (`brew install terraform ansible`)
- **Issue:** Homebrew core больше не содержит Terraform (HashiCorp BSL re-license). `brew install hashicorp/tap/terraform` (official tap) blocked на этой машине из-за outdated Xcode Command Line Tools (`Your Command Line Tools are too outdated`).
- **Fix:** Direct binary download from `releases.hashicorp.com/terraform/1.13.1/terraform_1.13.1_darwin_arm64.zip`; unzip → `~/.local/bin/terraform`; chmod +x; verified `terraform version` = 1.13.1 (>= 1.11 required).
- **Files modified:** None в repo; install only local на dev workstation в `~/.local/bin/`.
- **Verification:** `terraform version` shows `Terraform v1.13.1`; `terraform fmt -check` + `terraform validate` exit 0 against scaffold.
- **Committed in:** Documented в `63a0c14` commit message.
- **Future work:** Document в `docs/RUNBOOKS/deploy.md §1 Dev workstation setup` (Plan 03-04 или earlier hygiene plan).

**2. [Rule 1 — Bug] `terraform fmt` auto-fix in storage_box.tf (alignment drift)**
- **Found during:** Task 2 (post-Write `terraform fmt -check -recursive`)
- **Issue:** Initial storage_box.tf had inline comments на 1-space spacing; fmt requires 11-space alignment to match longest key.
- **Fix:** Ran `terraform fmt -recursive` once; re-verified `terraform fmt -check` clean. (Idempotent; just whitespace alignment.)
- **Files modified:** `infra/terraform/storage_box.tf`.
- **Verification:** `terraform fmt -check` exit 0.
- **Committed in:** `697e53b` (same Task 2 commit; fmt fix baked in).

---

**Total deviations:** 2 auto-fixed (1 Rule 3 — blocking install issue, 1 Rule 1 — whitespace formatting bug)
**Impact on plan:** Neither affects scope or design. Terraform binary install is operationally documented; storage_box.tf fmt is cosmetic.

## Issues Encountered

- **None blocking.** All Task 0 + Task 2 verify gates green.
- **First sops -e attempt** wrote zero-byte files because `sops` was reading `.sops.yaml` from `/tmp/` (no matching creation_rules). **Fix:** Cleanup empty files; copy plaintext into target `.secrets/<env>/hetzner.yaml` FIRST, then `sops -e -i` (in-place) — путь файла теперь внутри repo, `.sops.yaml` resolved correctly via regex `.secrets/.*\.yaml$`. Same approach используется в `.secrets/README.md` standard guidance.

## Hetzner Console Reality Check (Task 1 — pending user action)

⏸ **NOT YET CAPTURED** — Task 1 (human-action checkpoint) ожидает действия пользователя в Hetzner Cloud Console:
- API token (read+write scope, description `terraform-v1.0`)
- Object Storage bucket `running-ecosystem-tfstate` (Falkenstein/Nuremberg, Private) + S3 credentials
- `hcloud server describe prod-app-01 -o json | jq ...` для server_id + server_type + location + image
- Paste 3 credentials в SOPS `.secrets/{dev,staging,prod}/hetzner.yaml` (replace REPLACE_ME)
- Заполнить `infra/terraform/imported.auto.tfvars` 4 строками (B1 source-of-truth)

После closure Task 1 → Task 3 (terraform init/plan/import/apply) runs автоматически.

## Phase 2 Inheritance Confirmed

- **SOPS slot pattern** (Pattern C): `.sops.yaml` regex `.secrets/.*\.yaml$` auto-covered `hetzner.yaml` slot — NO config change. Подтверждает Phase 2 design choice (regex over explicit per-file rules).
- **tf-wrap.sh inherits deploy.sh §9 pattern** (Pattern A): umask 077 + SOPS decrypt в process env (`eval $(sops -d --output-type=dotenv ... | sed 's/^/export /')`). НЕ landing на disk → satisfies T-03-02 mitigation (HCLOUD_TOKEN leaked).
- **Pre-commit gitleaks** прошёл оба commit'a — `.secrets/**` allow-listed для encrypted ciphertext (Phase 2 SEC-08).

## B1 / I1 Closure Evidence

- **B1 (prod-attr non-determinism):** ✅ CLOSED. `servers.tf` `hcloud_server.prod_app_01` block содержит ТОЛЬКО `var.prod_server_type`, `var.prod_location`, `var.prod_image` — никаких литералов. variables.tf declares их без defaults. imported.auto.tfvars (gitignored) — single source of truth, заполняется в Task 1 пользователем. Verify:
  ```bash
  grep -E '(cx22|cx32|nbg1|fsn1|hel1|ubuntu-24\.04)' infra/terraform/servers.tf | grep -v '#\|cx42\|staging_app_01\|sentry_01'
  # Expected: empty (no matches in prod_app_01 block)
  ```
- **I1 (storage_box silent degradation):** ✅ NOT TRIGGERED. `terraform validate` (с control test) подтвердил `hcloud_storage_box` resource доступен в hcloud provider v1.63.0. `storage_box.tf` остаётся канонический (НЕ `.skipped`); plan execution continues normally.

## Threat Model Compliance

| Threat ID | Status | Evidence |
|-----------|--------|----------|
| T-03-01 (state-in-repo) | mitigate ✅ | `.gitignore` patches: state*, tfvars, imported.auto.tfvars |
| T-03-02 (HCLOUD_TOKEN leak) | mitigate ✅ | SOPS encrypted; tf-wrap.sh decrypt в process env via eval, не на disk; `sensitive = true` on hcloud_token var |
| T-03-03 (open 22) | mitigate ✅ | firewall.tf rule 22/TCP `source_ips = var.dev_admin_ips` |
| T-03-04 (state corruption) | mitigate ✅ | backend.tf `use_lockfile = true` (Terraform 1.11+ native S3 locking) |
| T-03-05 (prod recreate) | mitigate ✅ | B1 fix (var.prod_* sourcing) + `lifecycle.ignore_changes` |
| T-03-06 (state audit) | accept ✅ | Per CONTEXT — pre-commit gitleaks + Object Storage logging covers |

## CHECKPOINT REACHED — TASK 1 HUMAN-ACTION

**Plan execution HALTED at Task 1 (hard human-action checkpoint).** Task 3 (terraform init/import/apply) cannot proceed until user closes:

1. Hetzner Cloud Console: API token + Object Storage bucket `running-ecosystem-tfstate` + S3 credentials.
2. `hcloud server describe prod-app-01` → capture server_id, server_type, location, image.
3. Paste real Hetzner creds в SOPS via `EDITOR=vim sops .secrets/{dev,staging,prod}/hetzner.yaml` (replace REPLACE_ME for all 3 keys, all 3 envs).
4. Заполнить `infra/terraform/imported.auto.tfvars` 4 строками (gitignored).
5. Resume signal: `"credentials pasted + imported.auto.tfvars filled"`.

После resume — orchestrator spawn'нет continuation agent для Task 3.

## Next Phase Readiness

- ⏸ **Wave 1 НЕ закрыта** до Task 3 completion (INFRA-02/04/05 partial — HCL scaffold готов, но не apply'ено).
- ⬜ **Wave 2 (Plan 03-02 ansible scaffold)** BLOCKED на Wave 1 closure (Ansible inventory нуждается в `tf output -raw <ipv4>` для staging-app-01 + sentry-01).
- ✅ **Wave 0 baseline зелёная:** все tooling installed, SOPS slots ready, `.gitignore` purged — никаких ремediation работ перед resume.

---
*Phase: 03-infrastructure-as-code*
*Plan: 01*
*Status: PARTIAL — Tasks 0 + 2 done, Task 1 awaiting human-action, Task 3 blocked*
*Completed (executor passes): 2026-05-16*

## Self-Check: PASSED

**Files verified exist:**
- `.gitignore` ✓ (modified)
- `.secrets/dev/hetzner.yaml` ✓
- `.secrets/staging/hetzner.yaml` ✓
- `.secrets/prod/hetzner.yaml` ✓
- `infra/terraform/versions.tf` ✓
- `infra/terraform/main.tf` ✓
- `infra/terraform/backend.tf` ✓
- `infra/terraform/variables.tf` ✓
- `infra/terraform/terraform.tfvars.example` ✓
- `infra/terraform/firewall.tf` ✓
- `infra/terraform/servers.tf` ✓
- `infra/terraform/storage_box.tf` ✓
- `infra/terraform/object_storage_state.tf` ✓
- `infra/terraform/outputs.tf` ✓
- `infra/terraform/tf-wrap.sh` ✓ (executable)
- `infra/terraform/.terraform.lock.hcl` ✓

**Commits verified:**
- `63a0c14` ✓ (Task 0 — Wave 0 prereqs)
- `697e53b` ✓ (Task 2 — Terraform scaffold)
