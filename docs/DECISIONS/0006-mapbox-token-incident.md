# ADR-0006: Mapbox Token Incident & Full Reset

**Дата:** 2026-05-16
**Статус:** Accepted
**Контекст:** Phase 2 / SEC-03..04 (Milestone v1.0 Production Readiness)
**Решение:** Полный reset всех Mapbox-токенов как treated-as-compromise incident. Новые `sk.` (CI/build-time) + `pk.` (runtime, per-env) с Bundle ID + Android SHA-256 restrictions (либо fallback: scope minimization + URL restrictions + 6-month rotation per RESEARCH Pitfall 9). SOPS-зашифрованные `.secrets/{dev,staging,prod}/mapbox.yaml` — единственное canonical-хранилище.

## Контекст

В пред-v1.0 Phase 1 (план `01-08`, archived `.planning/phases/_archive/pre-v1.0-territory-refactors/01-08-SUMMARY.md`) при настройке Mapbox-доступа Phase 0 были созданы и использовались 5 access-токенов на личном аккаунте `iassd` / `dragon2015516@gmail.com`. Из них **три однажды передавались в чат с AI-ассистентом** (CONTEXT D-15 carry-over; `docs/SECRETS.md` §«Известные проблемы текущего стейта» #4):

| Имя в дашборде  | Фактический префикс | Должен быть     | Каналы утечки                              |
| --------------- | ------------------- | --------------- | ------------------------------------------ |
| `dev-public`    | `pk.…`              | Public (`pk.`)  | Phase 0 P0-A-01 — обсуждение scope-ошибки  |
| `prod-public`   | `pk.…`              | Public (`pk.`)  | Phase 0 P0-B-01 — настройка `.env` примера |
| `server-secret` | `pk.…` ⚠️ ошибка    | Secret (`sk.…`) | Phase 0 P0-B-02 — диагностика 403 на /tiles/ |

Дополнительные два токена (`dev-public-v2`, `dev-downloads`) на дату аудита не входят в inventory утечек, но в рамках treated-as-compromise политики **все 5 ротируются разом** — для чистого reset'а без частичного риска и для синхронизации schema с новой SOPS-схемой хранения.

### Почему treated-as-compromise

Канал утечки — chat с AI-ассистентом — обладает **неотзывной chain-of-custody**:

- Получатель (вендор AI + его training data ingestion + история incident'ов) **вне нашего контроля**.
- Mapbox API не предоставляет публичного Tokens API для глобального revoke или enumeration usage по period'у — мониторинг квоты выявляет **lagging indicator**, а не точную атрибуцию.
- Tokens API quota anomaly уведомления не выставлены (out-of-scope для v1.0).

Любая модель «возможно не утекло за пределы вендора» требует доверительных предположений к AI-вендору, которые мы не можем верифицировать. **Treated-as-compromise — это единственный ответ, не требующий trust-assumptions.**

### Связанные требования

- **SEC-03** — ротация всех Mapbox-токенов как реакция на pre-v1.0 leak.
- **SEC-04** — задокументировать инцидент через ADR + Incident Log.
- **SEC-07** — playbook ротации в `docs/SECRETS.md` (extended, не replaced — per CONTEXT D-18).

### Связанные плоскости защиты

- `apps/mobile-rn/eslint.config.js` — ESLint v9 token-secret guard (pre-v1.0 Plan 08): rejects `EXPO_PUBLIC_*_SECRET` env-var names + bare `^sk\.[40,]` literal patterns.
- `.gitleaks.toml` + `.pre-commit-config.yaml` + `.trufflehog/config.yaml` (Phase 2 / 02-03): repo-wide pre-commit + full-history scan (160 commits на `feat/cursona-redesign` — ZERO findings on 2026-05-16, см. `docs/{gitleaks,trufflehog}-history-scan.json`).
- `.sops.yaml` + `.secrets/{dev,staging,prod}/mapbox.yaml` (Phase 2 / 02-01): age-encrypted at-rest canonical хранилище.

## Решение

**Полный reset всех 3 утёкших токенов + создание 4 новых токенов с правильной классификацией:**

| Назначение            | Имя                                  | Префикс | Scope                                                                                | Где хранится                                                    | Restrictions                                                                       |
| --------------------- | ------------------------------------ | ------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| CI/build-time (SDK)   | `sport-mobile-build-sk-2026-05`      | `sk.`   | `DOWNLOADS:READ` + `STYLES:READ` + `FONTS:READ` + `TILES:READ` + `DATASETS:LIST` + `DATASETS:READ` | `.secrets/{dev,staging,prod}/mapbox.yaml` → `MAPBOX_DOWNLOADS_TOKEN` | Без restrictions (sk. не использует URL/Bundle ID — auth по самому токену)         |
| Runtime — prod        | `sport-mobile-runtime-pk-prod-2026-05`    | `pk.`   | `STYLES:READ` + `FONTS:READ` + `DATASETS:READ` + `VISION:READ` (БЕЗ secret-scopes)   | `.secrets/prod/mapbox.yaml` → `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN`     | Bundle ID `com.runningecosystem.mobile` + Android SHA-256 (если UI доступна; иначе fallback per §Митигации) |
| Runtime — staging     | `sport-mobile-runtime-pk-staging-2026-05` | `pk.`   | Same as prod                                                                         | `.secrets/staging/mapbox.yaml` → `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN`  | Same shape; отдельный токен изолирует staging-leakage от prod-квоты                |
| Runtime — dev         | `sport-mobile-runtime-pk-dev-2026-05`     | `pk.`   | Same as prod                                                                         | `.secrets/dev/mapbox.yaml` → `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN`      | Без restrictions (local dev only); scope minimization — primary defense            |

**Revoke (после verified-работающих новых)** — три предыдущих токена в dashboard:

- `dev-public` → Delete
- `prod-public` → Delete
- `server-secret` → Delete

Остальные два предыдущих токена (`dev-public-v2`, `dev-downloads`) также revoke'нутся в рамках full-reset, чтобы оставить аккаунт с чистым inventory из 4 новых токенов.

**Canonical хранилище** — `.secrets/{dev,staging,prod}/mapbox.yaml`, age-зашифрованные через `.sops.yaml` (D-01 / D-02 / D-05). Локальные dev-копии (`~/.netrc` / `~/.gradle/gradle.properties`) синхронизируются ИЗ SOPS, не наоборот.

**Деплой** — `sops -d --output-type=dotenv` в short-lived tmpfs `.env`-файл, потребляемый `docker-compose --env-file` (D-06; см. `docs/RUNBOOKS/sops-edit.md` §«Deploy sequence»).

## Альтернативы

1. **Частичная ротация — только `server-secret`** (тот что mistakenly был `pk.` вместо `sk.`).
   **Отклонено.** Все 3 токена touched chat-with-AI. Любой leaked токен — это раздельный риск; ротировать «только тот, который наиболее очевидно ломан по типу» = оставить два других утёкших активными.

2. **No-op + Mapbox usage monitoring.**
   **Отклонено.** Mapbox dashboard show'ит usage в виде агрегатной квоты (calls per period), не per-source. Spike в трафике — lagging indicator (минимум 24h delay в reporting), и attacker может балансировать использование под радар. Lagging detection ≠ prevention.

3. **Полный reset с сохранением имён старых токенов (overwrite в dashboard).**
   **Отклонено.** Mapbox dashboard не поддерживает atomic rotate-in-place — токен создаётся и удаляется отдельно. Сохранение имён даёт visual confusion в audit-логе; новые имена с датой `2026-05` ясно идентифицируют ротированную партию.

4. **Полный reset (принято).**
   Полный reset + clean classification + restrictions per Pitfall 9 verdict + SOPS-only canonical store + revoke в dashboard ПОСЛЕ verified-работающих новых токенов.

## Обоснование

Chain-of-custody через chat с AI-ассистентом **не отзывается** — невозможно вызвать API «удали всё, что ты получал от меня». Это отличает chat-leak от, например, leak в публичную ветку git, где revoke + force-rewrite (мы не делаем — D-12) + scan-allow покрывают сценарий через детерминированный набор шагов.

**Treat-as-compromise** = единственный response, который:

- Не требует доверительных предположений о вендоре AI («я надеюсь, что они не используют это для training»).
- Не требует точной attribution канала утечки во временном окне.
- Не зависит от того, сработают ли downstream-protection'ы (gitleaks, ESLint) — потому что мы уже знаем, что utечка состоялась.

**Альтернатива «no-op»** требует одной из двух trust-предпосылок:

- AI-вендор не сохраняет, не использует, не подверг compromise полученные данные → unverifiable.
- Mapbox quota anomaly detection поймает абуз → lagging, в любом случае требует ротации потом.

Полный reset стоит ~15 минут user-времени в dashboard + автоматическую SOPS-перезапись через Claude. Cost-vs-risk матрица overwhelmingly favors reset.

**Почему отдельный токен per env (prod / staging / dev) для pk.:**

- Изолирует blast radius: staging-leak не пожирает prod-квоту.
- Restrictions могут отличаться (prod = Bundle ID strict; dev = unrestricted локально).
- Ротация per-env — независимая (например, dev-токен можно ротировать при смене разработчика без перетряхивания prod).

**Почему shared `sk.` для CI/build-time across envs:**

- Mapbox SDK — один артефакт независимо от target env (тот же `.framework` / `.aar`).
- Per-env `sk.` separation — v1.1 ergonomic improvement, не security-critical (RESEARCH Pitfall 10).
- Один `sk.` упрощает CI pipeline (Phase 11/12 EAS Build).

## Последствия

### Положительные

- **Clean slate.** Все историческое наследие Phase 0 inventory занулено; новые токены созданы со строгой type-classification (pk. ↔ sk.) и явным naming (`sport-mobile-<role>-<env>-<date>`).
- **SOPS-only canonical store.** Один источник истины (encrypted-at-rest) вместо трёх (Mapbox dashboard, локальный `.env`, локальный `~/.netrc`). Локальные копии становятся derived state — sync-from-SOPS, не sync-to-SOPS.
- **Layered defense на recurrence.**
  - ESLint v9 token-secret guard (mobile TS — pre-v1.0 Plan 08): rejects bare `sk.…` literals + `EXPO_PUBLIC_*_SECRET` env-var names.
  - `.gitleaks.toml` + pre-commit hook (Phase 2 / 02-03): repo-wide staged-files scan на каждый commit; full-history scan (160 commits на `feat/cursona-redesign` — verified ZERO findings 2026-05-16).
  - `.trufflehog/config.yaml` + Phase 4 CI integration: --only-verified режим для full-history scan каждого PR.
- **ADR-trail.** Документ фиксирует решение, причины, mitigations, scenarios пересмотра — debuggable для будущей команды.

### Отрицательные / риски

- **CI build downtime (~10 min)** во время propagation нового `sk.` в:
  1. Локальный `~/.netrc` каждого dev'а (для iOS `pod install`).
  2. Локальный `~/.gradle/gradle.properties` каждого dev'а (для Android `./gradlew assemble`).
  3. EAS Build env vars (Phase 11/12 deferred — Phase 2 закрывает только canonical SOPS-store).
- **Operator awareness burden.** Любая ошибка в Bundle ID restriction (опечатка в `com.runningecosystem.mobile`, неверный SHA-256 fingerprint) → токен работает локально, ломается в production-сборке. Smoke-тест перед revoke старых токенов — обязательная страховка (Task 4 plan'а).
- **Brief plaintext window в чате.** При user-action ротации (Task 3 plan'а) новые токены показываются user'у в Mapbox dashboard "shown once" → paste в chat → SOPS-write. Mitigation: paste-once, не echo back, и user-side инструкция «scrub chat after rotation confirmed».
- **Резервная копия `sk.` не делается.** Если dev потеряет `~/.netrc` И `.secrets/<env>/mapbox.yaml` decrypt-ability одновременно — будет ротация заново. Acceptable risk: SOPS-canonical store + age recipient list — двухконтурная backup'нутая защита через `docs/RUNBOOKS/sops-edit.md` §«Recovery — Lost age key».
- **Текущий Mapbox-аккаунт всё ещё личный** (`iassd` / `dragon2015516@gmail.com`). Перенос на team-аккаунт — `docs/SECRETS.md` TODO; вне scope этого ADR.

## Митигации

### Phase A (документ-only, на момент написания ADR)

- **Scope minimization** — единственная гарантированная защита, не зависящая от UI Mapbox dashboard:
  - `pk.` runtime-токены: ТОЛЬКО `STYLES:READ`, `FONTS:READ`, `DATASETS:READ`, `VISION:READ`. **БЕЗ** `OFFLINE:READ`, `TILESETS:READ`, `DOWNLOADS:READ` (secret-scopes на public-токене сломаны в Mapbox — урок P0-A-01).
  - `sk.` build-time токен: ТОЛЬКО `DOWNLOADS:READ` + `STYLES:READ` + `FONTS:READ` + `TILES:READ` + `DATASETS:LIST` + `DATASETS:READ`. Никаких WRITE-scopes.
- **Layered repo-wide detection.** ESLint v9 token-secret guard (mobile) + `.gitleaks.toml` (repo-wide) + `.pre-commit-config.yaml` pinned `gitleaks v8.30.1` + `.trufflehog/config.yaml` (Phase 4 CI). Full-history scan ZERO findings зафиксирован в `docs/{gitleaks,trufflehog}-history-scan.json`.
- **6-месячный календарный график ротации** (если Bundle ID restriction UI окажется недоступной — fallback per Pitfall 9): rotation triggered manually по календарной задаче «Mapbox token rotation» на 2026-11-15. Записывается в `docs/SECRETS.md` §«Rotation Log» по completion.
- **Per-env pk. separation** ограничивает blast radius — staging-leak не пожирает prod-квоту, dev-leak не trash'ит staging.
- **Mapbox account hygiene** (вне scope этого ADR, но referenced):
  - 2FA на Mapbox-аккаунте — рекомендация владельцу проекта.
  - Credentials аккаунта (`iassd` / `dragon2015516@gmail.com`) хранятся в 1Password — out-of-scope SOPS, но cross-referenced.

### Phase B — VERIFIED 2026-05-16 (Plan 02-04 Task 1 closeout)

✅ **Verdict (A) — Available as documented.** Bundle ID + Android SHA-256 restriction UI подтверждена user'ом 2026-05-16 в `https://account.mapbox.com/access-tokens` → **Create a token** → Restrictions section:

- iOS Bundle ID field: present (text input, формат reverse-DNS — будет выставлен `com.runningecosystem.mobile`)
- Android Application Restrictions field: present (text input, accepts SHA-256 fingerprint — будут выставлены debug + production keystore SHA-256)

**Применение в Task 3 этого плана:** все три новых runtime-pk. токена (`sport-mobile-runtime-pk-prod-2026-05`, `sport-mobile-runtime-pk-staging-2026-05`, `sport-mobile-runtime-pk-dev-2026-05`) создаются с обоими restrictions включёнными. Build-time `sk.` токен — без URL/Bundle restrictions (sk. живёт только в CI/build environment).

**Закрытие Pitfall 9 (RESEARCH §Pitfall 9):** MEDIUM confidence flipped to **HIGH confidence** на дату 2026-05-16. Fallback ветви (B/C) больше не активны для v1.0 — но остаются документированными ниже на случай, если Mapbox изменит UI в будущем (тогда — `Сценарии пересмотра` ниже).

**Архив отброшенных fallback-ов** (для historical context, на случай UI-deprecation):

- _(B) Partial fallback (NOT APPLIED):_ только одна из двух платформ имеет restriction → URL fallback для missing-платформы.
- _(C) No-restriction fallback (NOT APPLIED):_ только scope minimization + 6-month calendar rotation + Phase 4 CI gitleaks + ESLint v9 guard.

Verdict + дата записаны в `02-04-SUMMARY.md` Phase B closeout. `docs/SECRETS.md` §«Текущий стейт токенов» отражает статус restrictions после Task 4 завершения.

## Сценарии пересмотра

| Trigger                                                                          | Действие                                                                                                                                          |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Публичный launch v1.5 (GDPR audit / first 1k MAU)                                | Пересмотреть весь Mapbox storage architecture: team-аккаунт, billing-isolation, IP-restrictions на server-side вызовы (если появятся), HSM-backed master key для SOPS. |
| Mapbox tier change (free → commercial)                                            | Пересмотреть scope-minimization — Commercial tier может требовать дополнительные scopes; добавляем явно с pre-commit allowlist update.            |
| Любая будущая leak-detection (gitleaks CI fires, dashboard quota anomaly, etc.)  | Trigger полного reset по этому же playbook'у (см. `docs/SECRETS.md` §«Rotation Playbook — Mapbox»); создать ADR-006.X amendment или ADR-N с инцидент-датой. |
| Removing existing dev (например, dev B уходит из проекта)                         | Trigger `sops updatekeys` recipient rotation (см. `docs/RUNBOOKS/sops-edit.md` §«Rotate recipients») — отдельный от Mapbox-token rotation.        |
| Mapbox 11.x SDK migration (Phase 13)                                             | Verify, что новый SDK всё ещё использует `MAPBOX_DOWNLOADS_TOKEN` env-var name; if changed → update SOPS-key + playbook.                          |
| EAS Build adoption (Phase 11/12)                                                  | Sync `sk.` from SOPS-canonical store в `eas secret:create` env var; document в `docs/SECRETS.md` §Mapbox playbook §Шаг 3.                          |

## Ссылки

- [docs/SECRETS.md §Rotation Playbook — Mapbox sk.](../SECRETS.md) — canonical playbook (extended в Plan 02-04 / SEC-07 с дополнительными 9 playbook'ами).
- [docs/SECRETS.md §Incident Log](../SECRETS.md) — table инцидентов; rotation completion entry добавляется в Phase B (Task 5b этого плана).
- [docs/RUNBOOKS/sops-edit.md](../RUNBOOKS/sops-edit.md) — workflow для `sops edit` / `sops -d --output-type=dotenv` / `sops updatekeys`.
- `.secrets/dev/mapbox.yaml`, `.secrets/staging/mapbox.yaml`, `.secrets/prod/mapbox.yaml` — encrypted-at-rest canonical store (SOPS + age, см. `.sops.yaml`).
- `.planning/phases/_archive/pre-v1.0-territory-refactors/01-08-SUMMARY.md` — pre-v1.0 Phase 1 Plan 08 (исходный inventory утёкших токенов: §"Известные проблемы текущего стейта" #4).
- `.planning/phases/02-secrets-and-config-hardening/02-CONTEXT.md` §D-15..D-17 — Phase 2 carry-over decisions для этого инцидента.
- `.planning/phases/02-secrets-and-config-hardening/02-RESEARCH.md` §Pitfall 9 — MEDIUM-confidence verification для Bundle ID + SHA-256 restriction UI.
- [docs/DECISIONS/0001-framework-react-native.md](./0001-framework-react-native.md) — ADR-0001, source шаблона section-structure (RU headings).
- [docs/DECISIONS/0007-v1.0-release-contract.md](./0007-v1.0-release-contract.md) — ADR-0007, sibling-фаза Phase 1 (REL-01..05).

---

_Phase: 02 Secrets & Config Hardening._
_Подписано: 2026-05-16. Поправки append-only — отдельный ADR (например 0006.1 или новый N) если sub-decision требует material revision (например, после Phase B Task 3 verdict)._
