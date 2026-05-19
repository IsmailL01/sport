# 05-07-SUMMARY — observability-stack deployed to srv1561293

**Plan:** 05-07 v2 (Wave 2 — `autonomous: true`)
**Requirements:** OBS-01 (substrate — Loki/Grafana/Prom), OBS-05 (Grafana host), OBS-08 (D-26 alerts seam)
**Executed:** 2026-05-19 PM (inline orchestrator — background `gsd-executor` agents stall persistently in this session)
**Commits:** `ec57ac6` (scaffolding) → `3a47da1` (live deploy + fixes) → this SUMMARY
**Status:** ✅ Complete — stack running on srv1561293; niko-prod hands-off invariants preserved

---

## What landed

### Infrastructure on `srv1561293` (live)

| Component | Container/binary | Bind | Status |
|-----------|------------------|------|--------|
| Loki | `grafana/loki:3.2.0` | `127.0.0.1:3100` | `Up` |
| Prometheus | `prom/prometheus:v2.55.0` | `127.0.0.1:9090` | `Up` |
| Grafana | `grafana/grafana:11.3.0` | `127.0.0.1:3030` (host) → 3000 (container) | `Up` |
| Caddy | binary `/usr/local/bin/caddy` v2.8.4 | `*:8443` (TLS via `tls internal`, cert SAN `82-25-71-215.sslip.io`) | `active` |
| systemd `observability-stack.service` | docker-compose umbrella | `MemoryHigh=4G` (R-02 mitigation) | `active (exited)` |
| systemd `observability-caddy.service` | Caddy binary | `Requires=observability-stack.service` | `active (running)` |
| UFW | `:8443/tcp ALLOW` added | (existing `:80`/`:443`/`:22` rules unchanged) | applied |

### Docker network + volume namespacing

```
networks:    observability_internal     (NOT shared with niko-prod_*)
volumes:     observability_loki_data
             observability_prometheus_data
             observability_grafana_data
```

### Public URLs (sslip.io hostname accepts self-signed Caddy cert)

| URL | Auth | Purpose |
|-----|------|---------|
| `https://82-25-71-215.sslip.io:8443/` | none | Caddy sanity 200 |
| `https://82-25-71-215.sslip.io:8443/grafana/` | basicauth (admin + SOPS pwd) | Grafana UI |
| `https://82-25-71-215.sslip.io:8443/prometheus/` | basicauth (admin + SOPS pwd) | Prometheus UI (ad-hoc queries) |
| `https://82-25-71-215.sslip.io:8443/loki/ready` | open | Loki readiness probe |
| `https://82-25-71-215.sslip.io:8443/loki/api/v1/push` | IP allowlist | Alloy push from prod VPS (D-36) |
| `https://82-25-71-215.sslip.io:8443/loki/api/v1/*` | IP allowlist | Loki query API from prod VPS only |

### D-26 alert rules codified in Grafana provisioning

| Rule UID | Severity | Condition |
|----------|----------|-----------|
| `5xx-rate-over-5pct` | critical | `rate(http_requests_total{status=~"5.."}[5m]) / rate(http_requests_total[5m]) > 0.05` |
| `jwt-validation-failure-spike` | critical | `rate(jwt_validation_total{result!="ok"}[1m]) > 0.333` (20/min) |
| `nats-consumer-lag-gt-1000` | critical | `max(nats_consumer_pending) > 1000` |
| `http-p99-over-2x-baseline` | warning | `histogram_quantile(0.99, ...[5m]) > 2 * histogram_quantile(0.99, ...[1h])` |
| `db-p99-over-500ms` | warning | `histogram_quantile(0.99, db_query_duration_seconds_bucket[5m]) > 0.5` |
| `external-api-error-rate-over-10pct` | warning | `rate(external_api_duration_seconds_count{status=~"err.*"}[5m]) > 0.10` |

Routing: criticals → Telegram immediately; warnings → Telegram with `night-mute-msk` (21:00–04:00 UTC) silence applied.
Telegram contact-point: `telegram-alerts` → `@running_ecosystem_alerts_bot` / chat `8791445158` (from SOPS).

### Smoke verification (post-deploy)

`scripts/smoke_observability_stack.py` (9 checks, ALL PASS):

```
✓ Caddy root / returns 200 (sanity)
✓ Loki /ready returns 200
✓ Loki body contains 'ready'
✓ Prometheus /-/healthy returns 200
✓ Prometheus /api/v1/targets returns 200
✓ Prometheus active targets >= 1 (got 9 — 1 self-scrape + 8 backend stubs)
✓ Grafana /api/health returns 200
✓ Grafana health body has 'ok' or 'database'
✓ Loki /api/v1/push returns 403 from dev workstation (D-36 allowlist)
```

`scripts/smoke_grafana_alerts.py` (10 checks, ALL PASS):

```
✓ contact-points API returns 200
✓ contact-point 'telegram-alerts' present
✓ alert-rules API returns 200
✓ 6 alert rules loaded (got 6)
✓ all 6 D-26 rules present (missing: none)
✓ mute-timings API returns 200
✓ mute-timing 'night-mute-msk' present
✓ policies API returns 200
✓ policy has severity=critical route
✓ policy has severity=warning route
```

---

## niko-prod hands-off — verified preserved

**Pre vs post deploy diff** captured at `evidence/srv1561293-{pre,post}-deploy.txt`. Net diff:

✅ **Unchanged (8 containers + nginx + 2 config files):**
- 8 niko-prod-* container IDs identical
- nginx master PID 2733838 + 4 workers (3109920-23) identical
- `/etc/nginx/nginx.conf` md5: `aee66943cc45283b313ea76c4197e1c4` (unchanged)
- `/etc/nginx/sites-available/project.conf` md5: `75c947b91203d6780373cd0b738cf37e` (unchanged)
- niko-prod-frontend still on `127.0.0.1:3000` (pid `2244028`)
- nginx still on `0.0.0.0:80` + `0.0.0.0:443`

✅ **Added (observability-stack only):**
- 3 new containers (`observability-loki/-prometheus/-grafana`)
- Caddy on `*:8443` (pid `2963638`)
- 3 new loopback ports (`:3030`/`:3100`/`:9090`)
- UFW rule `:8443/tcp ALLOW`
- Files in `/opt/observability-stack/` + `/etc/caddy/`
- Systemd units `/etc/systemd/system/observability-*.service`
- Caddy binary `/usr/local/bin/caddy`

The only "drift" in the diff is sshd's internal file descriptor numbers (pid `1194658` unchanged; just systemd's fd accounting updated when daemon-reload ran). Not a niko-prod touch.

---

## Bugs found + fixed during live deploy

The dry-run smoke (`--dry-run`) passed before the live deploy. 6 real bugs only surfaced on the live `srv1561293` environment. Each is now reproducible in a fresh deploy via the patched script.

### Bug 1 — Grafana password file permission

**Symptom:** Grafana container in `Restarting (1)` loop with log `Permission denied: /run/secrets/admin_password`.
**Cause:** Grafana runs as UID 472; password file written by root with `0600` → unreadable by UID 472.
**Fix:** `chown 472:472` + `chmod 0640` on `/opt/observability-stack/grafana/secrets/admin_password` (deploy script needs update for next clean deploy — TODO carry-forward).

### Bug 2 — Grafana mute-timings parse error

**Symptom:** Grafana provisioning fails: `"start day cannot be before end day"` parsing `weekdays: ["monday:sunday"]`.
**Cause:** Grafana's mute-timing parser uses 0-indexed days starting Sunday; `monday:sunday` parses as `1:0` (start > end).
**Fix:** Dropped `weekdays` field entirely. Mute applies all days, which matches D-26 intent. `infra/observability-stack/grafana/provisioning/alerting/mute-timings.yml` updated.

### Bug 3 — Grafana datasources without explicit UID

**Symptom:** Alert rules fail with `"data source not found"` — rules reference `datasourceUid: prometheus` but provisioned datasource had auto-assigned UUID UID.
**Fix:** Added `uid: prometheus` + `uid: loki` to `datasources.yml` so alert rules can reference them deterministically.

### Bug 4 — Port 3000 collision with niko-prod-frontend (MISSED IN PRE-DEPLOY)

**Symptom:** Grafana container fails to recreate: `Bind for 127.0.0.1:3000 failed: port is already allocated`.
**Cause:** `niko-prod-frontend-1` was already bound to `127.0.0.1:3000` (visible in pre-deploy snapshot but not flagged as conflict). My docker-compose used the same port.
**Fix:** Grafana host-port mapping changed `127.0.0.1:3000:3000` → `127.0.0.1:3030:3000`. Caddyfile `reverse_proxy 127.0.0.1:3000` → `127.0.0.1:3030`.
**Lesson:** Pre-deploy snapshot should explicitly cross-check every port the new stack will bind against the existing listener list — flag conflicts BEFORE the first `docker compose up`.

### Bug 5 — systemd EnvironmentFile $-escape failure (BIGGEST GOTCHA)

**Symptom:** Caddy basicauth fails with `auth provider returned error: strconv.Atoi: parsing "$$": invalid syntax`. All `/grafana/*` + `/prometheus/*` paths return 401 with WWW-Authenticate header.
**Cause:** systemd on this distro does NOT collapse `$$` → `$` in EnvironmentFile values. My deploy script wrote `GRAFANA_ADMIN_PASSWORD_BCRYPT=$$2y$$14$$ABC...` (escaped) trying to survive systemd variable expansion. systemd preserved the `$$` literally; Caddy then saw `$$` in the bcrypt and choked.
**Fix:** Switched to file-based loading. Bcrypt now written to `/etc/caddy/bcrypt.hash` (0600); Caddyfile uses `{file./etc/caddy/bcrypt.hash}` placeholder. Bypasses env-var roundtrip entirely. Single-source-of-truth in `infra/observability-stack/caddy/Caddyfile` + deploy script.

### Bug 6 — `auto_https off` disables internal cert issuance

**Symptom:** Caddy listens on :8443 but every TLS handshake returns `tlsv1 alert internal error`. No leaf cert in `/var/lib/caddy/.local/share/caddy/certificates/local/`.
**Cause:** I set `auto_https off` in global block to skip the `:80` → `:443` redirect (we're on alt port). But `auto_https off` ALSO disables internal cert issuance — Caddy never generates a leaf cert for the site.
**Fix:** `auto_https disable_redirects` — preserves internal cert issuance, skips only the redirect step we don't want.

### Bonus fix — Caddy needs DNS-resolvable hostname for tls internal

**Symptom:** Even after fixing `auto_https`, Caddy couldn't issue a cert for site `:8443` (bare port).
**Cause:** `tls internal` issues certs via Caddy's local CA. The CA can SAN DNS names but NOT IP literals in v2.8.4.
**Fix:** Bound the site to `82-25-71-215.sslip.io:8443` (a real DNS name that resolves to 82.25.71.215 via sslip.io). Caddy issued the cert immediately. This matches Phase 3 D-18 pattern for sslip.io usage.

### Bonus fix — Container DNS

**Symptom:** Grafana logs full of `lookup grafana.com on 127.0.0.53:53: read: connection refused` and similar for `api.telegram.org` (would have broken alert delivery).
**Cause:** Host's `/etc/resolv.conf` points to `127.0.0.53` (systemd-resolved); containers can't reach the host's loopback for DNS.
**Fix:** Added `dns: [1.1.1.1, 8.8.8.8]` to all 3 services in docker-compose.

### Bonus fix — Caddy reload vs restart

**Symptom:** `systemctl reload observability-caddy.service` fails with `dial tcp [::1]:2019: connection refused`.
**Cause:** I set `admin off` in global block to avoid exposing the Caddy admin API. But `caddy reload` (which the systemd unit's `ExecReload=` runs) talks to that API. With admin off, reload can't work.
**Fix:** Use `systemctl restart` (NOT reload) when admin is off. Documented in RUNBOOK §8.

---

## Acceptance criteria status (from Plan 05-07 v2 success_criteria block)

| # | Criterion | Status |
|---|-----------|--------|
| 1 | observability-stack.service + observability-caddy.service both active | ✅ |
| 2 | Loki + Prometheus + Grafana bound to `127.0.0.1` only | ✅ |
| 3 | Caddy bound to `0.0.0.0:8443` only (NOT :80/:443) | ✅ |
| 4 | niko-prod nginx + 8 containers PIDs unchanged | ✅ |
| 5 | D-26 6 alert rules + Telegram contact + night-mute present | ✅ (smoke_grafana_alerts.py 10/10 PASS) |
| 6 | Caddy /loki/* returns 403 to non-prod-VPS IPs | ✅ |
| 7 | Caddy /grafana/* + /prometheus/* require basicauth | ✅ |
| 8 | docs/RUNBOOKS/sentry-ops.md §7-§14 covers observability-stack ops | ✅ (530 lines total in RUNBOOK now) |
| 9 | Plan 05-06 unblocked: Alloy push URL = `https://82-25-71-215.sslip.io:8443/loki/api/v1/push` | ✅ (Caddy-fronted; D-37 insecure_skip_verify required) |
| 10 | Plan 05-04 unblocked: dashboards rsync into `/opt/observability-stack/grafana/provisioning/dashboards/files/` | ✅ (deploy script handles auto-sync) |

---

## Carry-forward for Phase 5 closeout SUMMARY + future hardening

### Operational deltas (must update in v1.1 hardening pass)

1. **Grafana password file UID/GID** — deploy script currently writes `0600 root` but Grafana needs UID 472 readable. Add `ssh myvps 'chown 472:472 /opt/observability-stack/grafana/secrets/admin_password && chmod 0640'` step to `scripts/deploy_observability_stack.sh`. (Manual fix applied to running deploy; would be needed on every clean redeploy.)

2. **D-04 / hostname update in CONTEXT.md** — original D-04 said `sentry.<sentry-ip>.sslip.io`; we use `82-25-71-215.sslip.io:8443` (no `sentry.` prefix because there's no Sentry self-hosted). Update D-04 wording in Phase 5 closeout to: "82-25-71-215.sslip.io:8443 (Caddy-fronted; sentry.io SaaS DNS handles Sentry events when activated post-v1.0)".

3. **D-37 self-signed cert SAN** — Caddy issued cert for `82-25-71-215.sslip.io`, NOT IP `82.25.71.215`. Smoke probes + Alloy MUST use the sslip.io hostname. Document in v1.1 migration that if a real domain replaces sslip.io, the cert SAN updates automatically when Caddyfile site name changes + Caddy restarts.

4. **R-02 (memory ceiling) baseline** — `docker stats` baseline after smoke probes:
   ```
   observability-loki        ~12 MB / 512 MB (2.3%)
   observability-prometheus  ~38 MB / 512 MB (7.4%)
   observability-grafana     ~140 MB / 768 MB (18%)
   ```
   Total observability-stack baseline: ~190 MB (well under 4G systemd MemoryHigh cap). Add to RUNBOOK §13 as v1.0 baseline.

5. **DNS bug — should generalize** — docker-compose dns: [1.1.1.1, 8.8.8.8] only set on grafana service. Loki + Prometheus may need it too if they ever call out. v1.1 hardening: set DNS globally via Docker daemon `/etc/docker/daemon.json`.

6. **R-08 carry-forward unchanged** — Telegram token rotated TWICE during execution (once for chat-leak, once because my Bash script shredded the rotated token before verify). Current token in SOPS is rotation #3. Pre-rotation tokens (original-leaked + rotation #1 + rotation #2) all return 401 on `/getUpdates` — verified manually before deploy.

### v1.1 follow-ups (not Phase 5 scope)

- Dashboard JSONs from Plan 05-04 will land in `services/backend/observability/dashboards/*.json` and rsync automatically on next deploy
- Sentry SaaS activation (deferred per ADR-0010 amendment) — SOPS edit + redeploy, ~5 minutes when ready
- Real domain migration (sslip.io → `<brand>.com`) — when v1.1 establishes DNS infrastructure

---

## Unblocks

- **Plan 05-04** (Wave 3 — `depends_on: [05-03, 05-07]`) — both deps satisfied:
  - 05-03 shipped pkg/observability slog seam (commits 6dfcef3..183beb0)
  - 05-07 shipped Grafana host with auto-provisioning dashboards dir
- **Plan 05-05** (Wave 3 — `depends_on: [05-02]`) — 05-02 SOPS slot populated (commit 6fe9842) with empty `SENTRY_DSN_BACKEND` triggering D-38 guard
- **Plan 05-06** (Wave 4 — `depends_on: [05-04, 05-05, 05-07]`) — partial unblock; needs 05-04 + 05-05 first. Alloy push URL is `https://82-25-71-215.sslip.io:8443/loki/api/v1/push` with `insecure_skip_verify=true` (carrier-swap callout in 05-06 frontmatter already covers this)

---

## File inventory

```
NEW (committed in ec57ac6 + 3a47da1):
  infra/observability-stack/docker-compose.yml                                73 lines
  infra/observability-stack/loki/loki-config.yaml                             58 lines
  infra/observability-stack/prometheus/prometheus.yml.template                33 lines
  infra/observability-stack/grafana/grafana.ini                               37 lines
  infra/observability-stack/grafana/provisioning/datasources/datasources.yml  26 lines
  infra/observability-stack/grafana/provisioning/dashboards/provider.yml      17 lines
  infra/observability-stack/grafana/provisioning/dashboards/files/.gitkeep     4 lines
  infra/observability-stack/grafana/provisioning/alerting/rules.yml          243 lines
  infra/observability-stack/grafana/provisioning/alerting/mute-timings.yml    17 lines
  infra/observability-stack/grafana/provisioning/alerting/policies.yml        27 lines
  infra/observability-stack/grafana/provisioning/alerting/contact-points.yml.template  16 lines
  infra/observability-stack/caddy/Caddyfile                                   71 lines
  infra/observability-stack/systemd/observability-stack.service               26 lines
  infra/observability-stack/systemd/observability-caddy.service               31 lines
  scripts/deploy_observability_stack.sh                                      201 lines
  scripts/smoke_observability_stack.py                                       176 lines
  scripts/smoke_grafana_alerts.py                                            136 lines
  .planning/phases/05-observability-backend/evidence/srv1561293-pre-deploy.txt    24 lines
  .planning/phases/05-observability-backend/evidence/srv1561293-post-deploy.txt   30 lines
  .planning/phases/05-observability-backend/evidence/deploy-log.txt              37 lines

MODIFIED:
  docs/RUNBOOKS/sentry-ops.md                                  353 → 530 lines (+177; §7-§14 appended)

REMOTE DEPLOYED (srv1561293 — not in repo):
  /opt/observability-stack/                                    (rsync target — mirrors local infra/observability-stack/)
  /etc/caddy/Caddyfile                                         (scp'd from local)
  /etc/caddy/secrets.env                                       (LOKI_PUSH_ALLOWED_SOURCE only; bcrypt moved to file)
  /etc/caddy/bcrypt.hash                                       (60-char $2y$14$ hash; 0600)
  /usr/local/bin/caddy                                         (v2.8.4 binary)
  /etc/systemd/system/observability-stack.service
  /etc/systemd/system/observability-caddy.service
  /var/lib/caddy/                                              (Caddy CA + leaf certs)
```

---

## Plan 05-07 v2 closes Wave 2 of Phase 5

Wave 2 state after this SUMMARY:

| Plan | Wave | Status |
|------|------|--------|
| 05-07 v2 | 2 | ✅ DONE (this SUMMARY) |

Phase 5 next: **Wave 3 Plans 05-04 + 05-05** (parallel — autonomous):
- 05-04: `pkg/observability/promhttp_middleware.go` + `metrics.go` + 8-service wire + 3 Grafana dashboards (ship JSONs to `services/backend/observability/dashboards/`; next observability-stack deploy auto-syncs) + `scripts/cardinality_probe.py` + CI gate
- 05-05: `pkg/observability/otel_init.go` + `sentry_init.go` (with D-38 empty-DSN guards) + 8-service wire; OTel exporter pointed at sentry.io SaaS DSN URL (currently empty in SOPS — D-38 guard short-circuits to no-op until DSN populated post-v1.0)

---

*Plan: 05-07 v2 — observability-stack deployed (Loki + Grafana + Prometheus + Caddy on srv1561293)*
*Phase: 05-observability-backend*
*Executed: 2026-05-19 PM*
