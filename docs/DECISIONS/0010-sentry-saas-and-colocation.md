# ADR-0010: Sentry SaaS over self-hosted + Loki/Grafana/Prom colocated with niko-prod on `srv1561293`

**Дата:** 2026-05-19
**Статус:** Accepted
**Контекст:** Phase 5 / OBS-01..08 (милестон v1.0 Production Readiness)
**Заменяет:** ADR-superseded sections of `.planning/phases/05-observability-backend/05-CONTEXT.md` — D-01..D-05 (Sentry topology) и D-30..D-31 (sentry-prep Ansible role + sentry-stack.service systemd). Полный список superseded D-XX в §«Что заменено».
**Связано с:** ADR-0006 (Mapbox token incident — same SOPS discipline), ADR-0007 (v1.0 release contract — same SCP-throughout principle).

---

## Контекст

Phase 5 (Observability backend) был спланирован в `.planning/phases/05-observability-backend/05-CONTEXT.md` с двумя жёсткими redline'ами:

1. **D-01 — «Sentry self-hosted на ОТДЕЛЬНОМ VPS, isolation non-negotiable»** — losing app + crash reports during incident unacceptable (RAII pattern: if app VPS dies, crash reports must still survive on independent infrastructure).
2. **D-03 — «4 vCPU / 16 GB RAM / 80 GB SSD minimum»** — Sentry self-hosted compose (Kafka + ClickHouse + Postgres + Redis + Snuba + Symbolicator) OOMs on <16 GB.

В момент execution (2026-05-19) user'у был доступен только один additional VPS: `srv1561293` (IPv4 `82.25.71.215`), который имеет два ограничения:

- **15 GB RAM total / no swap** — под 16 GB minimum, и уже 3 GB занято существующим Docker-стэком (см. ниже).
- **На VPS уже работает unrelated production-проект `niko-prod`** — 7 Docker containers (frontend / admin / api / signer / postgres / redis / rabbitmq) + системный nginx, листенящий на `0.0.0.0:80` + `0.0.0.0:443` как public TLS terminus. User гарантировал что niko-prod не должен быть тронут или сломан в процессе Phase 5 deploy.

Это создаёт три жёстких блокера для original-Plan:

| Блокер | Описание | Source |
|--------|----------|--------|
| **B-A: Resource ceiling** | 12 GB available после niko-prod, no swap — под 16 GB Sentry minimum. Kafka OOM risk на первый run (RESEARCH §P12). | `free -h` на VPS 2026-05-19 |
| **B-B: nginx owns :80/:443** | Existing nginx PID 3109923 листенит обе порта. Любая попытка Caddy/Let's Encrypt issuance конфликтует. ACME HTTP-01 requires :80, TLS-ALPN-01 requires :443, DNS-01 requires DNS provider API (sslip.io = no API). | `ss -tlnp` на VPS 2026-05-19 |
| **B-C: «не трогай»** | User directive: niko-prod containers + configs + nginx config — не модифицируем, не рестартим, не редиректим. | User message 2026-05-19 |

Original-Plan собирался deploy'ить Sentry self-hosted compose stack (~30 containers) + own Caddy + own ACME cert на этот VPS. Все три блокера активны.

Альтернативный VPS (second machine, ≥16 GB, fresh) у user'a нет.

## Решение

**1. Sentry → SaaS (sentry.io free tier, 5K events/mo).**
Reverses D-01 ("self-hosted") и D-02 ("getsentry/self-hosted edition"). Reasoning:

- SaaS preserves the **functional** intent of OBS-01 (crash reports available even when app VPS is down) — sentry.io's infrastructure is independent of `82.25.71.215` AND of `148.253.214.156` (prod VPS). The isolation invariant is maintained at the **operator** level, just not at the **operator-controlled** level.
- 5K events/month is comfortably above closed-beta event volume estimate (≤500 events/month per RESEARCH §1.10 mental model).
- v1.1 revisit: if event volume grows, either upgrade tier or migrate to dedicated VPS — both are reversible changes once a real second VPS exists.
- Sentry SaaS provides native Slack / Discord / Telegram alert integrations + Sentry's own dashboards — replaces the custom Go alerter service (originally D-24 / D-25), drops Plan 05-02 Task 2 complexity entirely.

**2. Loki + Grafana + Prometheus stay self-hosted — on `srv1561293`, colocated with niko-prod.**
Reverses D-27/D-28/D-29 location ("on sentry VPS") to "on `srv1561293`". Reasoning:

- These are operational tooling for OUR backend; sentry.io doesn't ship Prom scrape or Loki. Self-hosting these is unavoidable for OBS-05 / OBS-06 runtime / OBS-08.
- Colocation with niko-prod is acceptable for **read-only operational tooling** (Prom scrapes prod VPS metrics endpoints; Loki receives logs from prod VPS Alloy) — neither writes to niko-prod's state, neither shares Docker networks, neither requires editing niko-prod's nginx.
- Resource pressure mitigated by: bind everything to `127.0.0.1`, dock Loki retention to 14 days (down from D-27's 30) for v1.0, accept memory ceiling risk + add monitoring (see Risk Register below).

**3. Public access path = Caddy on alt port `:8443` (HTTPS, self-signed cert).**
Replaces D-04 ("sentry.<sentry-ip>.sslip.io with own ACME cert") with: Caddy binds `0.0.0.0:8443` ONLY (does NOT touch :80/:443 — existing nginx undisturbed). Caddy serves:

- `https://82.25.71.215:8443/grafana/` — basicauth-gated (Grafana admin UI for devs)
- `https://82.25.71.215:8443/loki/api/v1/push` — gated by Caddy `@allowed_loki { remote_ip 148.253.214.156/32 }` matcher; 403 from any other source IP (prod VPS Alloy is the only writer)
- `https://82.25.71.215:8443/prometheus/` — basicauth (rarely needed; for ad-hoc Prom queries; Grafana is the primary consumer)

TLS is self-signed (Caddy's `tls internal` directive — auto-generates a cert on a local CA Caddy maintains itself). Trade-offs:

- ❌ Browser warning on first dev visit — accept-once, then OK
- ❌ Alloy on prod VPS needs `tls_config { insecure_skip_verify true }` или explicitly trusts Caddy's local CA
- ✅ No Let's Encrypt rate-limit risk (RESEARCH §P19) — irrelevant for self-signed
- ✅ Existing nginx :80/:443 untouched — niko-prod undisturbed
- ✅ No DNS provider lock-in — `https://82.25.71.215:8443/...` works without DNS

**4. UFW allowlist preserved as defense-in-depth — `8443/tcp` open public, but `@allowed_loki` matcher restricts /loki/* to prod-VPS source IP only.** D-28 (UFW :3100 from prod-VPS) is replaced by Caddy-level matcher (Plan 05-07 v2 owns this).

## Что заменено

Из `.planning/phases/05-observability-backend/05-CONTEXT.md`:

| D-XX | Original (CONTEXT.md) | Disposition |
|------|----------------------|-------------|
| D-01 | Sentry self-hosted на separate VPS | **SUPERSEDED** — SaaS preserves isolation intent at operator level (sentry.io is independent of both VPSes) |
| D-02 | `getsentry/self-hosted` 26.5.0 | **SUPERSEDED** — sentry.io SaaS |
| D-03 | 4 vCPU / 16 GB / 80 GB sentry VPS | **SUPERSEDED** — no dedicated VPS; SaaS has no sizing concern |
| D-04 | `sentry.<sentry-ip>.sslip.io` DNS | **SUPERSEDED** — `https://o<org>.ingest.sentry.io/api/<id>/envelope/` (SaaS-provided); Grafana/Loki/Prom via `https://82.25.71.215:8443/...` self-signed |
| D-05 | No subdomain wildcard yet | **MOOT** — sentry.io domain handles it; v1.1 dedicated VPS may revisit |
| D-06 | 4 Sentry projects (env × platform) | **PRESERVED** — applies to sentry.io projects equally (user creates 4 in sentry.io UI) |
| D-07 | SOPS slot `.secrets/{prod,staging}/sentry.yaml` | **PRESERVED** — same slot, populated with sentry.io DSNs + Grafana admin password + Telegram bot creds |
| D-08 | Mobile DSN passthrough (Phase 17 consumes) | **PRESERVED** — same flow, sentry.io DSNs |
| D-09..D-14 | slog handler / PII deny-list / OTP fix / CI grep | **PRESERVED — already shipped in Plan 05-03** (commits 6dfcef3, 320975c, ea1e65d, 183beb0) |
| D-15..D-19 | Prometheus client_golang + middleware + cardinality budget | **PRESERVED** — applies to self-hosted Prom on `srv1561293` |
| D-20 | OpenTelemetry SDK + OTLP/HTTP to Sentry | **PRESERVED** — endpoint URL changes from sslip.io-derived to `https://o<org>.ingest.sentry.io/api/<id>/envelope/` (still OTLP/HTTP, same auth header construction from DSN per RESEARCH §1.3 — DSN URL parser is generic) |
| D-21 | OTel span PII scrub mirrors slog deny-list | **PRESERVED** |
| D-22..D-23 | X-Debug-Session header + featureflag + JWT (mobile UX = Phase 17) | **PRESERVED** |
| D-24 | Telegram bot alerts (NOT PagerDuty) | **PRESERVED on Grafana side**; **REPLACED on Sentry side** by sentry.io native Slack/Discord/Telegram integration (configured in sentry.io UI, no Go alerter service needed) |
| D-25 | Sentry alerts → Telegram via webhook | **REPLACED** — sentry.io native Telegram integration |
| D-26 | Alert rule scope (3 critical + 3 warning) | **PRESERVED** — sentry.io rules + Grafana rules together cover the set |
| D-27 | Loki on sentry VPS, promtail on prod VPS | **AMENDED** — Loki on `srv1561293` (this VPS), Alloy on prod VPS shipping to `https://82.25.71.215:8443/loki/api/v1/push` |
| D-28 | UFW 3100/tcp from prod-VPS source | **REPLACED** by Caddy `@allowed_loki { remote_ip 148.253.214.156/32 }` matcher; UFW exposes only :8443 publicly |
| D-29 | Alloy on prod VPS (was Promtail; RESEARCH §1.6) | **PRESERVED** |
| D-30 | sentry-prep Ansible role | **SCRAPPED** — no Sentry stack to deploy |
| D-31 | sentry-stack.service systemd | **SCRAPPED** |
| D-32 | Per-service main.go bootstrap (D-32 pattern) | **PRESERVED** — already partially shipped in Plan 05-03 (slog seam); rest lands in 05-04 / 05-05 / 05-06 with SaaS DSN |

### New decisions introduced by this ADR (codified into CONTEXT.md amendment alongside this ADR):

| D-XX | Decision |
|------|----------|
| **D-33** | Sentry → SaaS (sentry.io free tier). Reverses D-01..D-05; rationale §«Решение/1». v1.1 revisit checkpoint when event volume crosses 4K/mo or dedicated VPS becomes available. |
| **D-34** | Loki + Grafana + Prometheus co-located on `srv1561293` (with niko-prod) — bound to `127.0.0.1` only; Docker networks namespaced separately from `niko-prod_*`. |
| **D-35** | Caddy on `srv1561293:8443` ONLY (self-signed via `tls internal`); existing system nginx on :80/:443 untouched. niko-prod no-touch invariant. |
| **D-36** | Caddy-level `@allowed_loki { remote_ip <prod-vps-ip>/32 }` matcher enforces D-28 invariant; UFW open only :8443 + :22. |
| **D-37** | v1.0 closed-beta accepts self-signed cert + browser warning on Grafana access; v1.1 either migrates to a dedicated VPS with Let's Encrypt or accepts pinned-cert-trust workflow for devs. |

## Risk Register

| ID | Risk | Likelihood | Impact | Mitigation | Trigger for revisit |
|----|------|-----------|--------|------------|---------------------|
| **R-01** | sentry.io free-tier event quota exhausted (5K/mo) — events dropped silently | LOW (closed-beta ≤500/mo expected) | MEDIUM (loses incident visibility for the month) | Sentry dashboards have quota usage alerts; configure email notification at 80% | When monthly event volume crosses 4K (≈80% headroom warning) |
| **R-02** | `srv1561293` resource contention — niko-prod stack + observability-stack OOM | MEDIUM (12 GB available, no swap, ClickHouse-free arch lowers risk vs self-hosted Sentry but Loki + Prom + Grafana still substantial) | HIGH (either niko-prod OR observability could crash) | Bind all to `127.0.0.1`, dock Loki retention to 14 days, add `MemoryHigh=` systemd directive to observability-stack.service, add 4 GB swap file at deploy time (one-time `fallocate /swap` — does NOT touch niko-prod) | At first OOM event OR when memory pressure crosses 80% sustained for 30 min |
| **R-03** | Self-signed cert friction — devs / Alloy can't connect cleanly | MEDIUM | LOW (UX annoyance, not data loss) | Document trust-the-cert procedure in `docs/RUNBOOKS/observability.md`; Alloy uses `insecure_skip_verify` initially; v1.1 fix | Annoyance > engineering value to fix |
| **R-04** | Caddy on :8443 publicly reachable — port scan + brute-force on basicauth | LOW (random IP scan against :8443 is uncommon; basicauth has rate-limit via Caddy) | MEDIUM (Grafana admin compromise → Loki query → operational log access) | Caddy basicauth + UFW allowlist on :8443 from dev workstation IPs only (NOT 0.0.0.0); rotate Grafana admin password monthly via SOPS rotation playbook | At first abuse signal in Caddy access logs |
| **R-05** | niko-prod admin or operator changes the existing nginx config to also bind :8443 — unplanned collision | LOW | HIGH (Phase 5 stack stops working silently) | Document the :8443 reservation in `docs/RUNBOOKS/observability.md`; periodic `ss -tlnp` smoke check in observability-stack.service ExecStartPre | Detected via smoke alert |
| **R-06** | sentry.io T&C changes / free-tier removal | LOW (sentry.io has had free tier ~10 years) | MEDIUM (forces SaaS upgrade OR migration to self-hosted) | ADR-0010 v1.1 revisit checkpoint already includes "if SaaS terms change unfavorably, evaluate self-hosted-on-dedicated-VPS path" | sentry.io product announcement |

## Последствия

**Positive:**
- Phase 5 v1.0 deliverable in <1 day instead of multi-day Sentry self-hosted bring-up.
- No tax on existing user / no nginx-touch / no resource bring-up.
- sentry.io's UI / mobile SDK ecosystem / alert integrations are battle-tested; we get them for free.

**Negative:**
- D-01 isolation redline relaxed (operator-level isolation only).
- v1.1 will need a real second VPS + Let's Encrypt + likely Sentry-self-hosted-rebuild if scale crosses SaaS free tier. Estimated effort: 2-3 days additional Phase 5.x work.
- Self-signed TLS friction for devs.

**Neutral:**
- Plan 05-03 (already shipped) is unaffected — slog handler / PII deny-list / OTP fix / CI grep all preserved.
- Plans 05-04, 05-05, 05-06 require surgical edits only (OTLP endpoint URL changes; otherwise identical).

## Amendment 2026-05-19 (PM) — Sentry SDK activation deferred to post-v1.0

**Status change:** D-33 (Sentry → SaaS) is *infrastructure-deferred* for v1.0 deploy. The SDK code paths from Plans 05-05 + 05-06 (sentry-go + `@sentry/react-native` init, `captureException` calls, OTel span export to Sentry OTLP) remain in the codebase. They are **wired but dormant** — gated by empty `SENTRY_DSN_BACKEND` (Go) and empty `EXPO_PUBLIC_SENTRY_DSN` (mobile) env vars.

**Activation path** (post-v1.0, no code redeploy required):

1. Create sentry.io org + 4 projects (Plan 05-02 Task 1, deferred — playbook lives in `docs/RUNBOOKS/sentry-ops.md §1` shipped intact during v1.0)
2. `sops edit .secrets/prod/sentry.yaml` — replace `SENTRY_DSN_BACKEND: ""` placeholder with the real DSN string from sentry.io UI
3. Redeploy backend services (`make deploy` or equivalent) — `/run/sport.env` re-renders from SOPS, services restart and pick up the populated env var, sentry-go SDK initializes normally on next start
4. (Mobile) Update EAS profile env, rebuild + ship the mobile app — Phase 17 territory

**Why defer:** v1.0 deploy is unblocked from Sentry account ops. Reduces v1.0 cutover surface area (no sentry.io org provisioning, no DSN rotation playbook needed live, no Sentry-side Telegram integration wiring). Functional intent of OBS-01 ("crash reporting available") becomes "*reachable* once DSN populated" — a one-line SOPS edit away. R-06 (sentry.io T&C changes) becomes irrelevant for v1.0 — we don't depend on the service yet.

**Idiomatic SDK behavior** (sentry-go + `@sentry/react-native` both): empty DSN string → `sentry.Init` returns without error, but events are silently dropped at capture time (see [Go DSN docs](https://docs.sentry.io/platforms/go/configuration/options/#dsn) + [React Native DSN docs](https://docs.sentry.io/platforms/react-native/configuration/options/#dsn)). Defense-in-depth: Plan 05-05 will add an explicit `if dsn == "" { ... return no-op shutdown }` guard at the top of `MustInitSentry` + `MustInitTracer` so the dormant state is observable (logs a `slog.Info "observability.sentry: disabled — empty DSN"` line on boot).

**Risk register updates:**
- R-01 (event quota) → not applicable while deferred
- R-06 (T&C changes) → not applicable while deferred
- **R-07 NEW** — deferral becomes permanent by neglect: the act of creating the sentry.io org never gets prioritized post-v1.0, and we ship to closed beta with no crash visibility. Mitigation: dated TODO in `.secrets/prod/sentry.yaml` next to the empty DSN placeholder + Phase 21 (Staging E2E) acceptance gate flags it.

**Phase 5 acceptance reframe:**
- ROADMAP §Phase 5 Criterion 1 (Sentry self-hosted on separate VPS with own ACME) was relaxed to "operator-level isolation via SaaS" in the original ADR-0010 §Решение/1; this amendment further relaxes it to "**SDK wired + DSN-activatable**". Phase 5 ships the substrate; activation is a Phase 21 / post-v1.0 follow-up.

**Implementation footprint** (delta from ADR-0010 v1.0):

- **Plan 05-02 v3:** Tasks 1 + 5 (sentry.io UI work) → DEFERRED; Tasks 2 + 3 + 4 + 6 still ship (Grafana/Telegram for the observability-stack — independent of Sentry). `.secrets/prod/sentry.yaml` keeps `SENTRY_DSN_BACKEND: ""` + `SENTRY_DSN_MOBILE: ""` placeholders with `# TODO: populate after sentry.io org created (ADR-0010 amendment)` comments.
- **Plan 05-05:** explicit empty-DSN guard at top of `MustInitSentry` + `MustInitTracer`. Both log `slog.Info("observability.sentry: disabled — empty DSN", "next_step": "see ADR-0010 amendment 2026-05-19 PM")` line on boot. Tests extend to cover the no-op path explicitly.
- **Plan 05-06 acceptance walkthrough:** drop "Sentry UI accessible" + "Sentry test Telegram alert" steps for v1.0. Grafana panels + 3 probes + Grafana-side Telegram alert (Plan 05-07 D-26 rules) remain. Acceptance step 8 swaps from "Sentry-side Telegram test" to "Grafana-side Telegram test via synthetic 5xx triggering D-26 `5xx_rate_over_5pct` rule".

**No SDK code removal.** All `sentry.CaptureException`, `Sentry.captureException`, OTel SDK imports stay put. The deferral is a config gate, not a code gate.

## История пересмотров

- **v1.0** (2026-05-19): Initial — accepting Sentry SaaS + colocation per user direction after VPS inspection revealed nginx-collision + resource ceiling.
- **v1.1** (2026-05-19 PM): Amendment — Sentry SDK activation deferred to post-v1.0; code paths preserved as wired-and-dormant; activation = SOPS edit + redeploy. R-07 added to risk register.

---

*ADR-0010 — Sentry SaaS over self-hosted + Loki/Grafana/Prom colocated with niko-prod*
