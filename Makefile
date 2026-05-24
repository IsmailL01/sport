# Top-level Makefile — Phase 4 / CICD-04 rollback automation.
#
# Wraps the manual rollback procedure из docs/RUNBOOKS/deploy.md §6
# (git checkout + golang-migrate down + ansible-playbook redeploy +
# smoke probe) into one atomic Make target.
#
# Scope: cross-cutting rollback ops (code + DB + infra). Separate из
# services/backend/Makefile (which scopes только к dev ops: build/run/test).
#
# References:
#   - docs/RUNBOOKS/deploy.md §6 (manual rollback procedure)
#   - .planning/phases/04-ci-cd-pipeline/04-03b-PLAN.md (this plan's scaffold)
#   - .planning/phases/04-ci-cd-pipeline/04-04-PLAN.md (live drill execution)
#   - .planning/phases/04-ci-cd-pipeline/04-RESEARCH.md §Code Examples §F + Pattern 5
#
# Drill scenario (Plan 04-04):
#   1. Tag A (v1.0.0-rc.test-a) at commit с migration 9990 (ADD users.metadata)
#   2. Deploy A via ansible-playbook + verify metadata column present
#   3. Tag B (v1.0.0-rc.test-b) at commit с migration 9991 (DROP users.metadata)
#   4. Deploy B + verify metadata column absent
#   5. `make rollback v=v1.0.0-rc.test-a` — reverts code + runs `migrate down 1`
#      (which executes 9991_drill_drop_metadata_col.down.sql → re-adds column)
#   6. Verify metadata column present → drill PASS.

.PHONY: help rollback rollback-drill drill-clean

# Overridable env (для future staging support deferred к v1.1)
VPS_HOST ?= deploy@148.253.214.156
SMOKE_URL ?= https://148-253-214-156.sslip.io/healthz

help:
	@echo "Top-level Makefile — Phase 4 rollback automation (CICD-04)."
	@echo ""
	@echo "Targets:"
	@echo "  rollback v=<tag>     — rollback prod к specified tag/SHA. Wraps git checkout +"
	@echo "                         golang-migrate down 1 + ansible-playbook redeploy + smoke probe."
	@echo "  rollback-drill       — execute full CICD-04 drill scenario (tag A → tag B → rollback к A → assert)."
	@echo "  drill-clean          — delete drill tags v1.0.0-rc.test-{a,b} (local + remote)."
	@echo ""
	@echo "Env overrides:"
	@echo "  VPS_HOST=$(VPS_HOST)"
	@echo "  SMOKE_URL=$(SMOKE_URL)"
	@echo ""
	@echo "Dev-ops targets (build/run/test): see services/backend/Makefile"

# === Rollback target ===
# Atomicity: each shell step `|| (echo ...; exit 1)` per RESEARCH §Architecture Pattern 5.
# Failure messages cite deploy.md §7 failure-mode table для recovery.
# Plan 04-04 Wave 4 change — `make rollback` reuses image already-loaded on prod from
# the previous deploy. `docker compose down` (and the systemd Stop unit) DO NOT delete
# images; `docker system prune` or explicit `docker image rm` would. The rollback
# target checks if the target tag's images exist on prod and, if missing, instructs
# the operator to re-transfer via `ansible-playbook ... -e sport_stack_tag=<v>` first.
rollback:
	@test -n "$(v)" || (echo "Usage: make rollback v=<version-tag-or-sha>"; exit 1)
	@command -v ansible-playbook >/dev/null 2>&1 || { echo "ansible-playbook not installed. brew install ansible"; exit 1; }
	@command -v curl >/dev/null 2>&1 || { echo "curl not installed (system tool, this should not happen)"; exit 1; }
	@command -v ssh >/dev/null 2>&1 || { echo "ssh not installed"; exit 1; }
	@git rev-parse --verify $(v) >/dev/null 2>&1 || (echo "Tag/SHA $(v) not found (git rev-parse failed)"; exit 1)
	@echo "==> [1/6] Checkout $(v) (detached HEAD)..."
	git checkout $(v) || (echo "git checkout failed; recover per deploy.md §7"; exit 1)
	@echo "==> [2/6] Pre-flight — assert target images present on prod (no re-transfer needed)..."
	@SEMVER_TAG=$$(echo "$(v)" | sed 's/^v//'); \
	  COUNT=$$(ssh $(VPS_HOST) "sudo docker images --format '{{.Repository}}:{{.Tag}}' | grep -c '^ghcr.io/ismaill01/.*:'\"$$SEMVER_TAG\"'$$'" 2>/dev/null || echo 0); \
	  if [ "$$COUNT" -lt 8 ]; then \
	    echo "Pre-flight FAIL: only $$COUNT/8 images for tag $$SEMVER_TAG present on prod."; \
	    echo "Run: cd infra/ansible && ansible-playbook -i inventory/prod --tags sport-stack site.yml -e sport_stack_tag=$(v)"; \
	    echo "Then re-run: make rollback v=$(v)"; \
	    exit 1; \
	  fi; \
	  echo "Pre-flight OK: 8/8 images for $$SEMVER_TAG already on prod (no re-transfer)."
	@echo "==> [3/6] Run migrate down 1 on prod (undoes most recent migration)..."
	@# /run/sport.env contains placeholder values w/ literal '<', '>' (e.g. APPLE_SIGN_IN_CLIENT_SECRET=<deferred-v1.1>)
	@# that break `set -a; . file` sourcing. Extract POSTGRES_PASSWORD via grep (single line, no shell
	@# interpretation) and rebuild DATABASE_URL inline; matches the URL pattern used in compose YAML.
	ssh $(VPS_HOST) "PASSWD=\$$(grep '^POSTGRES_PASSWORD=' /run/sport.env | cut -d= -f2-) && cd /opt/sport/services/backend && sudo docker compose --env-file /run/sport.env -f docker-compose.prod.yml run --rm migrations -path /migrations -database \"postgres://re:\$${PASSWD}@postgres:5432/running_ecosystem?sslmode=disable\" down 1" || (echo "DB rollback failed — recover per deploy.md §7"; exit 1)
	@echo "==> [4/6] Ansible re-deploy sport-stack on prod (tag pin → systemd restart)..."
	@# --skip-tags=run-migrations: we just ran `migrate down 1` explicitly in step [3/6]; ansible's
	@# `migrate up` would re-apply the rolled-back migration because rsync delete:false leaves the
	@# new (post-rollback obsolete) migration files on prod. Skip the migrations task during rollback.
	cd infra/ansible && ansible-playbook -i inventory/prod --tags sport-stack --skip-tags=run-migrations site.yml -e sport_stack_tag=$(v) || (echo "Ansible re-deploy failed; recover per deploy.md §7"; exit 1)
	@echo "==> [5/6] Smoke probe ($(SMOKE_URL))..."
	@curl -fsS -o /dev/null -w "HTTP %{http_code}\n" $(SMOKE_URL) || (echo "Smoke probe failed; investigate immediately (deploy.md §7 troubleshooting)"; exit 1)
	@echo "==> [6/6] Rollback к $(v) complete ✓"

# === Drill target (Plan 04-04 invokes этот) ===
# Steps map к Plan 04-04 Task 2/3/4 sequence.
# Drill uses `git tag -f` intentionally (drill may repeat). NOT а force-push к main.
rollback-drill:
	@echo "==> [Drill 1/7] Tag A (v1.0.0-rc.test-a)..."
	git tag -f v1.0.0-rc.test-a
	git push -f origin v1.0.0-rc.test-a
	@echo ""
	@read -p "==> [Drill 2/7] Press Enter после backend-cd green publishes images for v1.0.0-rc.test-a: " _
	@echo "==> [Drill 3/7] Deploy A via ansible..."
	cd infra/ansible && ansible-playbook -i inventory/prod --tags sport-stack site.yml -e sport_stack_tag=v1.0.0-rc.test-a
	@echo "==> [Drill 4/7] Assert users.metadata IS PRESENT (A's schema state)..."
	bash services/backend/scripts/drill_assert_schema.sh expect-present
	@echo ""
	@echo "==> [Drill 5/7] Tag B (v1.0.0-rc.test-b)..."
	git tag -f v1.0.0-rc.test-b
	git push -f origin v1.0.0-rc.test-b
	@read -p "==> [Drill 5/7] Press Enter после backend-cd green publishes images for v1.0.0-rc.test-b: " _
	@echo "==> [Drill 5/7] Deploy B via ansible..."
	cd infra/ansible && ansible-playbook -i inventory/prod --tags sport-stack site.yml -e sport_stack_tag=v1.0.0-rc.test-b
	bash services/backend/scripts/drill_assert_schema.sh expect-absent
	@echo ""
	@echo "==> [Drill 6/7] THE DRILL — make rollback v=v1.0.0-rc.test-a..."
	$(MAKE) rollback v=v1.0.0-rc.test-a
	@echo ""
	@echo "==> [Drill 7/7] Post-rollback assert users.metadata IS PRESENT (A's schema restored)..."
	bash services/backend/scripts/drill_assert_schema.sh expect-present
	@echo ""
	@echo "==> DRILL PASS ✓ — CICD-04 acceptance: real DB migration rollback proven."

# === Drill cleanup ===
drill-clean:
	-git tag -d v1.0.0-rc.test-a v1.0.0-rc.test-b
	-git push origin :refs/tags/v1.0.0-rc.test-a :refs/tags/v1.0.0-rc.test-b
	@echo "Drill tags cleaned (drill migrations 9990/9991 remain в tree per user preference — see 04-04-SUMMARY)."
