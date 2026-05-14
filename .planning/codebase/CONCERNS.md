# Codebase Concerns

**Analysis Date:** 2026-05-14

Scope: mobile (`apps/mobile-rn/`) + backend (`services/backend/`). Built on top of two existing internal audit documents — `docs/AUDIT.md` and `docs/REVIEW_ROUNDS_1-3.md` — extended with fresh inspection of state after Phase 8 / M9–M10 (feed ranking, people search, tracking stats, SQLite relations cache, realtime/comments fixes, R1–R8 review fixes) per `STATUS.md`.

R-numbers (R1–R18) in this document map to the codified findings in `docs/REVIEW_ROUNDS_1-3.md`. Most R1–R8 are listed as **resolved** in `STATUS.md` and `CHANGELOG.md`; what is captured below are residual / not-yet-addressed items + new concerns discovered during this audit.

---

## Tech Debt

**Orphaned backend Feed / Stories service (ADR-0004 «do-nothing»):**
- Issue: Mobile Feed and Stories were ripped out in Round 1 (`src/modules/feed/`, `src/modules/stories/`, all `screens/feed/*`, push deep-links, realtime event dispatch removed). Backend `feed` service still ships and runs in prod, with NATS subjects `feed.*` registered.
- Files: `services/backend/feed/cmd/server/main.go`, `services/backend/feed/internal/handler/posts.go`, `services/backend/feed/internal/service/posts.go`, `services/backend/feed/internal/repository/postgres/posts.go`, `services/backend/feed/internal/repository/postgres/stories.go`, migrations `services/backend/migrations/0016_stories.up.sql`, `services/backend/migrations/0017_feed_posts.up.sql`. Mobile residual: SQLite migrations v11 (`stories`, `story_views`) and v12 (`feed_posts`, `feed_comments`) in `apps/mobile-rn/src/storage/database.ts:258-344` remain deprecated-but-present.
- Impact: Unauthenticated attack surface on prod (mobile no longer calls these endpoints, but they remain reachable behind Caddy / gateway). CI builds and tests a dead service. Postgres tables consume backup space.
- Fix approach: When ADR-0004 triggers fire (90 days, security audit, resource pressure, or decision to abandon Feed for good), create ADR-0005, back up Postgres tables to S3/MinIO, drop NATS subjects, remove `feed` service from `services/backend/docker-compose.prod.yml`, then DROP TABLE with 7-day wait between deploy phases (rollback safety) per ADR-0004 §«Когда пересмотреть».

**Deferred Guest mode (ADR-0002):**
- Issue: Spec requires «Гостевой режим с локальным хранением», not implemented. ADR-0002 documents the design (local anonymous user with `isGuest=true` flag, sessions written with `guest-<uuid>` user_id, sync engine short-circuits). UI button «Без регистрации» is NOT in `AuthStack`.
- Files: `docs/DECISIONS/0002-guest-mode.md`, `apps/mobile-rn/src/state/auth.ts` (no `isGuest` field on `AuthUser`), `apps/mobile-rn/src/navigation/AuthStack.tsx` (no guest button), `apps/mobile-rn/src/sync/syncEngine.ts` (no guest short-circuit).
- Impact: Spec gap. Users without email/SMS access cannot use the app. Multi-tenant invariant in `CLAUDE.md` is enforced by absence of feature.
- Fix approach: Round 4+. Need: (a) add `isGuest: boolean` to `AuthUser`; (b) `guest-<uuid>` generator with MMKV persist; (c) gate social features (`feed/chats/realtime/notifications`) behind `!isGuest`; (d) migration path `UPDATE … SET user_id = ?` for all tables — must touch `wallet_transactions`, `wallet_balance`, `sessions`, `personal_records` (see R18 below — schema flaw), `social_relations`.

**Deferred OAuth Google/Apple (ADR-0003):**
- Issue: `AuthProvider` interface plus stub-safe `GoogleAuthProvider` and `AppleAuthProvider` shipped in Round 3 but neither completes a real sign-in. Google `signIn()` throws «Google sign-in реализация — Round 4+». Apple gets through `expo-apple-authentication` but caller can't exchange `identityToken` (Alert «backend ещё не подключён»). Apple is App Store release blocker.
- Files: `apps/mobile-rn/src/auth/authProviders.ts:71` (TODO Round 4 comment), `apps/mobile-rn/src/auth/authProviders.ts:118-145` (Apple provider, half-working), `apps/mobile-rn/src/ui/AuthScreen.tsx` (Alert stub).
- Impact: No iOS App Store release possible without «Sign in with Apple» if app offers third-party auth. Currently OK because Apple+Google buttons are hidden when `availableProviders()` is empty.
- Fix approach: Backend `/auth/oauth/google/exchange` and `/auth/oauth/apple/exchange` endpoints needed in `services/backend/identity/`; mobile finishes flow with `apiClient.identity()`; tokens go through normal `saveTokens()` path. Estimate Round 4.

**TODO/FIXME density (low, expected for current phase):**
- Mobile: 3 markers in `src/` (`apps/mobile-rn/src/auth/authProviders.ts:71`, `apps/mobile-rn/src/health/HealthAdapter.ts:13`, `apps/mobile-rn/src/domain/types.ts:37`). All three are intentional «next-phase» pointers, not debt-of-shame.
- Backend: 3 markers (`services/backend/realtime-gw/internal/gw/connection.go:105-106` for typing forwarding and ack persistence; `services/backend/notifications/internal/service/svc.go:73` for Expo Push collapse). All are clearly scoped to «Phase B+».
- Impact: Healthy for a project this young.
- Fix approach: Track these against actual Phase IDs in `STATUS.md`.

**Sync push does not carry `activityType` / `laps` (R10):**
- Issue: `syncEngine.listPendingSessions` selects `activity_type` correctly, but server schema / DTO are not aware of laps or activity type. When the backend catches up, mobile sync DTO needs version bump to v2.
- Files: `apps/mobile-rn/src/sync/syncEngine.ts:330-372`, mobile SQLite migration v17 (`activity_type`) and v18 (`laps`) in `apps/mobile-rn/src/storage/database.ts:443-473`.
- Impact: Server-side history will lack activity type and lap data for any future cross-device sync. Client-only for now → tolerable.
- Fix approach: When backend `activity-sync` migration adds these fields, bump `sessions/upload` DTO version; ensure server INSERT honors UPSERT idempotency on `(user_id, started_at)`.

**`useActivityStore` is becoming a god-store (R9):**
- Issue: ~466 LOC in `apps/mobile-rn/src/state/activity.ts`. Handles pipeline ingestion, pause detection, closure detection, area recompute, sensor aggregation, calories, records, wallet award, and lap finalization in a single store.
- Files: `apps/mobile-rn/src/state/activity.ts`.
- Impact: Tests for individual concerns become heavy to mock. New contributors must understand the entire store to change one slice.
- Fix approach: Split into `useActivityStore` (lifecycle) + `useLapTracking` + `useSessionFinalization` + `useAreaTracking`. Domain pure helpers already exist (`domain/lap.ts`, `domain/AreaCalculator.ts`, `domain/records.ts`, `domain/calories.ts`) so the split is mostly mechanical.

**Mock-only tests, no integration tests with real SQLite:**
- Issue: Jest 435/435 pass, but all storage tests run against in-memory mocks or pure-domain code paths. `walletRepository`, `lapRepository`, `socialRepository`, `pointRepository`, `recordsRepository`, `relationsRepository` are not exercised against a real `expo-sqlite` instance.
- Files: `apps/mobile-rn/src/__tests__/` (no `*repository*.test.ts` against real DB), `apps/mobile-rn/jest.config.js`.
- Impact: Bugs in JSON-meta-blob serialization, migration ordering, CHECK violations, transaction atomicity will not surface until runtime on a real device. R5 (added in Round 3) explicitly called out this gap.
- Fix approach: Add `better-sqlite3` as `devDependency`, configure jest to swap `expo-sqlite` → `better-sqlite3` for tests, write smoke `migrations.test.ts` (run all 19 migrations on fresh DB) and `walletRepository.integration.test.ts` (CHECK constraint trigger, ON CONFLICT semantics, transaction rollback on partial failure).

**Legacy wrappers in chat navigation:**
- Issue: `apps/mobile-rn/src/navigation/screens/chats/ChatScreen.tsx` and `apps/mobile-rn/src/navigation/screens/chats/CreateChatScreen.tsx` are «thin wrappers» around `src/ui/social/ChatScreen.tsx` (562 LOC, the legacy implementation).
- Files: `apps/mobile-rn/src/navigation/screens/chats/ChatScreen.tsx`, `apps/mobile-rn/src/navigation/screens/chats/CreateChatScreen.tsx`, `apps/mobile-rn/src/ui/social/ChatScreen.tsx`.
- Impact: Two surfaces for chat behavior. The legacy file is the real implementation; the new screens just import and forward. Confuses navigation.
- Fix approach: Move the body from `src/ui/social/ChatScreen.tsx` into `navigation/screens/chats/ChatScreen.tsx`, delete the legacy file. Same for `CreateChatScreen`.

**`DevPreviewScreen` still rooted in UI:**
- Issue: After RunCard/StoryRing deletion (R4 fix), `DevPreviewScreen` exists as a dev-only component playground. Not gated behind `__DEV__`.
- Files: `apps/mobile-rn/src/ui/DevPreviewScreen.tsx` (R16 in review docs).
- Impact: Dev-only screen ships in production bundle.
- Fix approach: Wrap export in `if (__DEV__) {…}` or remove from default route registry.

**No CI test enforcement of permission matrix sync:**
- Issue: Phase 8/K introduced parallel Go (`services/backend/pkg/permissions`) and TypeScript (`apps/mobile-rn/src/modules/permissions/`) RBAC matrices that must stay in sync. Unit tests verify each independently (16 Go + 29 TS as per STATUS.md). No test asserts the two stay aligned.
- Files: `services/backend/pkg/permissions/`, `apps/mobile-rn/src/modules/permissions/`.
- Impact: A new capability added on one side without the other will silently allow / deny actions that the other side enforces oppositely. Authorization drift bug.
- Fix approach: Either (a) generate one side from the other via a code-gen step, or (b) add a CI step that diffs the YAML/JSON capability list extracted from both packages.

---

## Known Bugs

**`personal_records` has no `user_id` column (R18, still unresolved):**
- Symptoms: All users on a device share the same `personal_records` rows; logout calls `clearAllRecords()` which wipes for everyone. If you log out user A and log in user B, B sees a clean slate but A's records are gone permanently.
- Files: `apps/mobile-rn/src/storage/recordsRepository.ts:1-69`, `apps/mobile-rn/src/storage/database.ts:370-388` (migration v14 — primary key is `kind` only, no user scoping).
- Trigger: Multi-user-on-device scenario; logout → re-login; future guest→real migration (ADR-0002).
- Workaround: Today, only one user uses the app per device. Symptoms manifest only if a second account is added.
- Fix approach: SQLite migration v20 — add `user_id TEXT NOT NULL` column with composite PRIMARY KEY (`user_id`, `kind`); update all `recordsRepository.*` to filter by `user_id`; backfill existing rows with current logged-in user from `useAuthStore`.

**`importRepo.importFromAdapter` uses `startedAt` as session PK (R14, still unresolved):**
- Symptoms: Two imported workouts that happen to share `startedAt` (Date.now ms-level) get the same primary key. `INSERT OR IGNORE` silently swallows the second one as duplicate. Wrong dedup outcome — `result.duplicates++` even though `external_uuid` differs.
- Files: `apps/mobile-rn/src/health/importRepo.ts:52` (`const sessionId = w.startedAt`), `apps/mobile-rn/src/storage/sessionRepository.ts:111` (sessions ordered by `started_at` so collision is silent).
- Trigger: Extremely rare in practice (concurrent timestamp at ms precision). Likeliest on bulk import of historical workouts from HealthKit / Strava if source rounded to seconds.
- Workaround: None at runtime; affected user re-imports and the second workout is permanently lost.
- Fix approach: Generate `sessionId = max(Date.now(), startedAt + N×1)` where N counts duplicates seen in this batch; or switch sessions to a separate AUTOINCREMENT PK and demote `startedAt` to a regular indexed column.

**Strava OAuth implementation is incomplete (R1 partial fix):**
- Symptoms: `client_secret` was removed from device per R1, but `requestPermissions` is a stub: `[Strava] requestPermissions: stub (no UI yet)` console.warn, returns `false`. Backend `/integrations/strava/exchange` and `/integrations/strava/refresh` endpoints do not exist. `isAvailable()` returns false in standard builds because `EXPO_PUBLIC_API_BASE` is unused (apiClient uses `EXPO_PUBLIC_API_URL`).
- Files: `apps/mobile-rn/src/health/StravaAdapter.ts:58-70` (stubbed `requestPermissions`), `apps/mobile-rn/src/health/StravaAdapter.ts:42` (`EXPO_PUBLIC_API_BASE` reference), `apps/mobile-rn/src/auth/apiClient.ts:13` (uses `EXPO_PUBLIC_API_URL`). No backend file under `services/backend/*` named `strava` exists.
- Trigger: User attempts Strava connect from any UI surface (none exists yet).
- Workaround: Strava integration not currently surfaced; adapter is dormant.
- Fix approach: Round 4 — implement `expo-auth-session` PKCE flow + `crypto.subtle.digest` SHA-256 code_challenge; build backend `POST /integrations/strava/{exchange,refresh}` using existing identity infra; unify env var naming (rename `EXPO_PUBLIC_API_BASE` → `EXPO_PUBLIC_API_URL` or document both).

**`AppleAuthProvider.signIn` returns null `email` if user denies sharing (R8 partial fix):**
- Symptoms: After R8 fix for displayName, `email` can still be `null` because Apple privacy policy only returns `email` on first sign-in. App may not realize this means the user must already exist server-side.
- Files: `apps/mobile-rn/src/auth/authProviders.ts:130-137`.
- Trigger: Second sign-in attempt by same Apple user, or user denies sharing email.
- Workaround: Cache email on first success per Apple's documentation; key off `idToken.sub` as primary identity.
- Fix approach: On backend exchange, derive `sub` from the `identityToken` JWT claims and treat that as the stable identity; email is supplementary. Document this in ADR-0003.

**`HealthKitAdapter.grantedScopes()` always reports full scope set after init (R12, documented as accepted limitation):**
- Symptoms: If user later revokes access in iOS Settings, `grantedScopes()` still returns the full list. App tries to read samples, gets denied, fails silently or logs a warning.
- Files: `apps/mobile-rn/src/health/HealthKitAdapter.ts:113-118` (per CHANGELOG citation; the comment notes Apple HealthKit privacy policy forbids readback).
- Trigger: User toggles HealthKit permission off in Settings → Privacy → Health.
- Workaround: Detect via failed read; show «Permissions revoked — re-grant in Settings» banner.
- Fix approach: Catch read errors in `importRepo` and surface a user-facing «Reconnect HealthKit» prompt.

**Pause detection toggles `isPaused` but does not pause the live UI dim correctly when phone is stationary:**
- Symptoms: Per `STATUS.md`/AUDIT, «map dim on pause» was added in Round 2 to satisfy spec §3, but auto-pause from `PauseDetector` interacts oddly with manual pause from the Pause/Stop button.
- Files: `apps/mobile-rn/src/pipeline/filters/PauseDetector.ts`, `apps/mobile-rn/src/state/activity.ts:112-117`, `apps/mobile-rn/src/navigation/screens/record/TrackerLiveScreen.tsx`.
- Trigger: Long stand-still during a recording, then resume.
- Workaround: Stop and start a new session.
- Fix approach: Separate `manualPause` from `autoPaused` flags; map dim should be tied to whichever is true.

---

## Security Considerations

**Token storage uses native keystore (good):**
- Files: `apps/mobile-rn/src/auth/tokenStorage.ts:1-30`.
- Status: ✅ Compliant with `CLAUDE.md` rule. Uses `expo-secure-store` (Keychain on iOS, EncryptedSharedPreferences on Android). Access and refresh tokens are stored via `SecureStore.setItemAsync`. Recommendations: none.

**Identity service defaults to DEV mode (`IDENTITY_DEV_MODE=true` by default):**
- Risk: In `services/backend/identity/cmd/server/main.go:47`, `devMode := envOr("IDENTITY_DEV_MODE", "true") == "true"`. If the operator forgets to set `IDENTITY_DEV_MODE=false` in production, two dangerous behaviors fire:
  - `/auth/request-code` returns the OTP code in the JSON response (`services/backend/identity/internal/handler/otp.go:46`).
  - `/auth/login-with-code` accepts any 6-digit code without a matching active OTP row (`services/backend/identity/internal/service/otp.go:106-138`, «dev-bypass: no active code, accepting»).
- Files: `services/backend/identity/cmd/server/main.go:45-73`, `services/backend/identity/internal/handler/otp.go:40-61`, `services/backend/identity/internal/service/otp.go:89-138`.
- Current mitigation: Comment in source reminds operator to flip the flag.
- Recommendations: **(P0)** Flip the default to `false`; require explicit `IDENTITY_DEV_MODE=true` opt-in for local development. Refuse to start if `ENV=production && DEV_MODE=true` (fail-closed safety).

**No rate limiting on `/auth/*` endpoints:**
- Risk: `pkg/ratelimit` (Phase 8/I) wires sliding-window Redis limits on `feed POST /posts`, `feed POST /posts/{id}/comments`, `feed POST /stories`, `social-graph POST /follows/{id}`, `social-graph POST /reports`, `messaging POST /conversations/{id}/messages`. Identity service is unprotected: `/auth/request-code`, `/auth/login-with-code`, `/auth/register`, `/auth/login`, `/auth/refresh`.
- Files: `services/backend/identity/internal/handler/http.go`, `services/backend/identity/internal/handler/otp.go`. No `ratelimit.Allow(...)` calls anywhere in `identity/`.
- Current mitigation: OTP service caps attempts at 5 per code (`services/backend/identity/internal/service/otp.go:36` `MaxOtpAttempts = 5`) and uses `subtle.ConstantTimeCompare` for the comparison.
- Recommendations: **(P0 before public release)** Wire `pkg/ratelimit` for `/auth/request-code` (5/hr per email, 30/hr per IP), `/auth/login-with-code` (10/min per email), `/auth/register` (3/hr per IP), `/auth/login` (10/min per email). Without this, an attacker can credential-stuff or DOS the OTP issuance pipeline.

**Strava client_secret rule documented but enforcement is implicit (R1 follow-up):**
- Risk: `docs/INTEGRATIONS.md §9 «Безопасность OAuth»` and ADR-0003 prohibit «никаких provider secrets на устройстве». No lint rule, no runtime check enforces this. If a developer adds `EXPO_PUBLIC_STRAVA_CLIENT_SECRET` to `.env`, Metro will bundle it without complaint.
- Files: `apps/mobile-rn/src/health/StravaAdapter.ts`, `docs/INTEGRATIONS.md`, `apps/mobile-rn/.eslintrc.json`.
- Current mitigation: `client_secret` is no longer referenced in `StravaAdapter.ts:36-46`.
- Recommendations: Add ESLint `no-restricted-syntax` rule rejecting any `EXPO_PUBLIC_*_SECRET` reference. Add CI grep guard: `git grep "EXPO_PUBLIC_.*SECRET" -- 'apps/mobile-rn/**'` → must return empty.

**WebSocket access-token in URL query string:**
- Risk: `apiClient.wsURL` puts `token=<accessToken>` and `device_id=<deviceID>` in the URL query, which gets logged by Caddy / reverse-proxy / WAF / any intermediate access log. Tokens are short-lived, but copies persist in log retention.
- Files: `apps/mobile-rn/src/auth/apiClient.ts:88-96`, `apps/mobile-rn/src/realtime/index.ts:13`.
- Current mitigation: Short access-token TTL means tokens expire before forensics typically need them.
- Recommendations: Configure Caddy access-log redaction (drop query string for `/ws` paths); migrate to WebSocket subprotocol-based auth (`Sec-WebSocket-Protocol: bearer.<token>`); or first-message auth handshake (server reads first frame as auth, then transitions).

**SQL injection: dynamic WHERE clause in `sensorRepository`:**
- Risk: `apps/mobile-rn/src/storage/sensorRepository.ts:43-46` builds the `WHERE` clause via string concatenation:
  ```ts
  const where = type
    ? `WHERE session_id = ? AND type = ? ORDER BY ts ASC`
    : `WHERE session_id = ? ORDER BY ts ASC`;
  ```
  The string is a literal, no user input is interpolated, and values still go through parameterized `?` placeholders. **Not a real injection vector**, but the pattern is fragile — any future contributor copy-pasting this style with user-controlled input creates a vulnerability.
- Files: `apps/mobile-rn/src/storage/sensorRepository.ts:38-57`.
- Current mitigation: Code review.
- Recommendations: Refactor to two named functions (`loadAllReadings` / `loadReadingsByType`) instead of dynamic SQL composition. Add ESLint rule against template literals containing `INSERT/UPDATE/DELETE/SELECT` that mix `${...}` with raw column names.

**Multi-tenant gaps (RLS-style not applicable to SQLite — but user_id discipline is uneven):**
- `personal_records` table has no `user_id` (see R18 / Known Bugs above). Other tables consistently include `user_id`:
  - ✅ `wallet_balance.user_id` PK (`apps/mobile-rn/src/storage/database.ts:391`)
  - ✅ `wallet_transactions.user_id` indexed (`apps/mobile-rn/src/storage/database.ts:411`)
  - ✅ `social_relations.viewer_id` part of PK (`apps/mobile-rn/src/storage/database.ts:361`)
  - ✅ `chats / messages / stories / feed_posts` — scoped by membership / authorship
  - ❌ `personal_records` — no `user_id` (R18 unresolved)
  - ⚠️ `sessions` — no `user_id` column either (single-user-on-device assumed). `apps/mobile-rn/src/storage/database.ts:74-90`. Same risk class as `personal_records`.
- Files: `apps/mobile-rn/src/storage/database.ts`.
- Current mitigation: Single-user-per-device assumption.
- Recommendations: Add `user_id` to `sessions` and `personal_records` before Guest mode lands. Without it, the ADR-0002 «UPDATE … SET user_id = ?» migration step cannot fix orphaned rows.

**`/admin/` HTML dashboard served as plain HTML/JS through Caddy:**
- Risk: `services/backend/gateway/admin/index.html` is mounted via Caddy with no CSRF protection. Login form posts directly to identity, then the resolve actions hit `/admin/reports/{id}/resolve`. Cookies for session, no SameSite check documented.
- Files: `services/backend/gateway/admin/index.html`, `services/backend/gateway/Caddyfile` (look up for `/admin/` route config).
- Current mitigation: Admin access is gated server-side by `profiles.global_role IN ('moderator','admin')`. Admin tokens are JWT bearer, not cookies — passed via `Authorization` header from JS. Reduces CSRF surface significantly.
- Recommendations: Document that admin tokens are bearer (not cookie). Add Caddy header rule `Strict-Transport-Security: max-age=63072000` and `Content-Security-Policy` for `/admin/*`.

**OTP code logged in stdout (`slog.InfoContext`):**
- Risk: `services/backend/identity/internal/service/otp.go:69-73` logs the OTP code with `slog.InfoContext`. Production-level stdout logs persist in container log aggregation (journald, Docker logs, Loki). Whoever has log access can replay a code within its 10-min TTL.
- Files: `services/backend/identity/internal/service/otp.go:57-78`.
- Current mitigation: Comment claims «Dev-mode logging only. В production не логируем code» but the log line is unconditional — only the response body redaction is gated by `devMode`.
- Recommendations: Gate the `slog.InfoContext(ctx, "otp issued", "code", code)` line behind `if devMode`. Production should log only `email` and `expires_at`.

---

## Performance Concerns

**Large GPS traces re-allocate full point array on every accept:**
- Problem: Every accepted GPS point triggers `set((s) => ({ points: [...s.points, point], ...}))` in `apps/mobile-rn/src/state/activity.ts:355-358`. After 5000 points, that's 5000 array copies, each O(N). `useMemo(() => pointsToLineString([...points]), [points])` in `TrackLayer.tsx:26` re-converts to GeoJSON on every `points` identity change. ZoneLayer and CorridorLayer have similar patterns.
- Files: `apps/mobile-rn/src/state/activity.ts:351-367`, `apps/mobile-rn/src/map/components/TrackLayer.tsx:20-41`, `apps/mobile-rn/src/map/components/CorridorLayer.tsx`, `apps/mobile-rn/src/map/components/ZoneLayer.tsx`.
- Cause: React reactivity model — Zustand triggers a re-render whenever the array identity changes. GeoJSON re-allocation is per-render.
- Improvement path:
  - Throttle UI subscriptions: separate raw collection (push to internal mutable buffer at full rate) from UI snapshot (update via setInterval at 1Hz).
  - Use ring buffer for last N points and store cumulative simplified track separately.
  - For TrackLayer specifically, apply Douglas-Peucker (`@turf/simplify` already a dep) to keep render <500 vertices when track exceeds threshold. This is exactly `P1-D-04` per `STATUS.md` (deferred to runtime FPS measurement).

**Pipeline cost on every raw point:**
- Problem: Each raw GPS event runs through AccuracyFilter → JumpFilter → MinSegmentFilter → KalmanFilter (2D predict + update) sequentially in `apps/mobile-rn/src/pipeline/Pipeline.ts`. Then PauseDetector observes. Then `acceptPoint` triggers React re-render with the closure detector recompute. For long tracks the closure detector re-scans many recent segments.
- Files: `apps/mobile-rn/src/pipeline/Pipeline.ts`, `apps/mobile-rn/src/pipeline/filters/KalmanFilter.ts`, `apps/mobile-rn/src/pipeline/filters/PauseDetector.ts`, `apps/mobile-rn/src/domain/ClosureDetector.ts`.
- Cause: Synchronous chain on JS thread. Closure detector runs per-point.
- Improvement path: Throttle closure detector to once per 10 points or every 5s; pre-allocate Kalman matrices instead of `new Array(...)` on each step.

**Map render perf — `useMemo` keyed on points array:**
- Problem: `useMemo(() => pointsToLineString([...points]), [points])` (`TrackLayer.tsx:26`) recomputes whenever the array identity changes. With 5000 points × 1Hz updates, that is 5000 GeoJSON FeatureCollection allocations per minute, each cloning the array. `HistoryTerritoryLayer` similar pattern.
- Files: `apps/mobile-rn/src/map/components/TrackLayer.tsx:26`, `apps/mobile-rn/src/map/components/HistoryTerritoryLayer.tsx`, `apps/mobile-rn/src/util/geojson.ts`.
- Cause: React render model + immutable updates.
- Improvement path: Memoize on length, not identity (`useMemo(..., [points.length])`); subscribe with selector to only the relevant slice (last point); maintain ShapeSource via imperative `setNativeProps` like Mapbox's source.update.

**SQLite query hot paths:**
- Problem: `flushBuffer` runs `INSERT INTO points` inside a transaction every 10 points (~10s). On long sessions (hours), this is fine. But `aggregateHrForSession` at session end runs `AVG/MAX/COUNT` over a session that may contain thousands of HR readings without an index covering `(session_id, type)`.
- Files: `apps/mobile-rn/src/storage/sensorRepository.ts:68-85`, `apps/mobile-rn/src/storage/database.ts:128-137` (index is `(session_id, ts)` not `(session_id, type)`).
- Cause: Composite index does not include `type`. SQLite must scan all readings of the session and filter by `type='hr'`.
- Improvement path: Add `CREATE INDEX idx_sensor_readings_session_type ON sensor_readings (session_id, type, ts);` in a v20 migration. For typical 1-hour runs (~3600 HR readings) the impact is small; for ultra runs it matters.

**Realtime subscriptions can multiply:**
- Problem: `useRealtimeStore.connect` clears its previous `unsubEvents` / `unsubStatus` listeners before registering new ones, but if `connect` is called concurrently (e.g., during fast logout/login), there's a window where two listeners could be active. `RealtimeAdapter.on` returns an unsubscribe function but the adapter keeps a `Set<RealtimeListener>` (`apps/mobile-rn/src/realtime/adapters/WebSocketRealtimeAdapter.ts:23-25`).
- Files: `apps/mobile-rn/src/state/social/useRealtimeStore.ts:22-94`, `apps/mobile-rn/src/realtime/adapters/WebSocketRealtimeAdapter.ts:19-71`.
- Cause: `connect` is `async` but the listener teardown is synchronous before await.
- Improvement path: Idempotency token (increment counter, only the latest counter's listener stays active); or assert at construction time that no other connect is in flight.

**Feed ranking / people search server load (Phase 8/M9.7–M9.8):**
- Problem: Feed ranking and trigram people search query Postgres on every refresh. No mention of Redis caching for these queries in `STATUS.md`. Cursor pagination exists, but the ranking compute (chronological merge of self+followees with secondary sort) is O(N×followee_count) per request.
- Files: `services/backend/feed/internal/service/posts.go`, `services/backend/feed/internal/handler/posts.go`, `services/backend/social-graph/` (people search).
- Cause: Naive merge query.
- Improvement path: Materialize per-user feed via NATS fanout on publish (fan-in-on-write). Or cache the merge result in Redis for 30s TTL. Track latency in Prometheus.

---

## Fragile Areas

**OAuth flow (Apple half-implemented, Google placeholder):**
- Files: `apps/mobile-rn/src/auth/authProviders.ts:107-145` (Apple), `:58-78` (Google).
- Why fragile: Apple part will silently fail without backend exchange endpoint. The `Alert` stub will mislead testers into thinking the path is wired. Google `signIn()` is a throw.
- Safe modification: Do not enable buttons in UI until both backend endpoint and Apple/Google config plugin are in EAS development build. Currently buttons hidden via `availableProviders()`.
- Test coverage: Provider matrix has 0 tests (R5 noted «Auth providers: stub-safe behavior»). Add `authProviders.test.ts` with `isAvailable` matrix: iOS+native+env / iOS+native+no-env / Android / Web.

**Strava import dedup (multi-source race):**
- Files: `apps/mobile-rn/src/health/importRepo.ts:34-92`, `apps/mobile-rn/src/health/importSanity.ts`, `apps/mobile-rn/src/health/importPlan.ts`.
- Why fragile: Uses `INSERT OR IGNORE` keyed on `(source, external_uuid)` unique index (migration v16). Same workout pulled from both HealthKit and Strava has different `external_uuid` → both inserted as separate sessions. Dedup is per-source, not cross-source.
- Safe modification: After insert, run cross-source merge query that flags overlapping `[startedAt, endedAt]` windows from different sources.
- Test coverage: `importPlan.test.ts` covers single-source dedup (6 tests). Cross-source merge edge case is enumerated in R5 but no test exists.

**Lap state machine (race-fixed in R7, but still subtle):**
- Files: `apps/mobile-rn/src/state/activity.ts:443-456` (markLap), `apps/mobile-rn/src/domain/lap.ts` (lapFromRange), `apps/mobile-rn/src/storage/lapRepository.ts` (atomic DELETE+INSERT).
- Why fragile: R7 fix used functional `set((s) => ...)` to close the read-write race with `acceptPoint`. But the closure detector callback (`apps/mobile-rn/src/state/activity.ts:119-130`) also mutates state during render; rapid Stop+markLap can still interleave. The stop() path also finalizes a trailing lap (`apps/mobile-rn/src/state/activity.ts:287-302`) and the «lap from points[lapStartIdx..end]» calculation can include fewer than 2 points if user immediately stops after markLap.
- Safe modification: Defensive `if (points.length - lapStart >= 2)` guard already present (line 292). Recommend disabling lap button in UI for 500ms after Stop is pressed to make the race invisible.
- Test coverage: `lap.test.ts` covers `lapFromRange` (7 tests). No test for `markLap` action under rapid taps or stop-during-mark.

**Wallet transaction atomicity:**
- Files: `apps/mobile-rn/src/storage/walletRepository.ts:46-97`, `apps/mobile-rn/src/state/wallet.ts:73-116`, `apps/mobile-rn/src/domain/walletDomain.ts` (validation + InsufficientBalanceError).
- Why fragile: `recordTransaction` runs INSERT tx + UPDATE balance in one SQLite transaction. CHECK (coins >= 0) (migration v19) guards balance underflow. The pre-flight `validateTransaction` reads balance, then writes — a race exists between read and transaction start (only relevant if there are concurrent JS callers, which currently is not the case in RN single-threaded JS, but `useWalletStore.awardForSession` could be called from multiple stop() paths if user double-taps Stop).
- Safe modification: Idempotency via `hasTransactionForSession` (UNIQUE INDEX `idx_wallet_tx_session_unique` on `(user_id, source_session_id)`, migration v15) protects against double-credit per session. The wallet store check at `useWalletStore.awardForSession`:75 reads `hasTransactionForSession` before writing.
- Test coverage: `walletDomain.test.ts` (11) and `walletStore.test.ts` (6) added in R5. Integration test against real SQLite still missing.

**Recording / pause state machine:**
- Files: `apps/mobile-rn/src/state/activity.ts:178-465`, `apps/mobile-rn/src/pipeline/filters/PauseDetector.ts`, `apps/mobile-rn/src/navigation/screens/record/TrackerLiveScreen.tsx`.
- Why fragile: Three orthogonal axes — `state: 'idle' | 'recording' | 'stopped'`, `isPaused: boolean` (auto-pause from PauseDetector), and the implicit "manual Pause" button which currently maps onto `isPaused` directly. Closure can fire while paused; markLap is disabled on pause but `acceptPoint` still pushes if pipeline accepts.
- Safe modification: Type `state` as a full state machine — `idle | recording | auto-paused | manually-paused | stopped`. Use XState-like discriminated union; reject point ingestion in `paused-*` states.
- Test coverage: Pipeline (93%) and area (95%) are well-tested. Full state machine including pause transitions has no dedicated test.

**Crash recovery (`recoverLast`):**
- Files: `apps/mobile-rn/src/state/activity.ts:405-441`, `apps/mobile-rn/src/storage/sessionRepository.ts:121-128` (`findActiveSession` — picks most recent session with `ended_at IS NULL`).
- Why fragile: If a session was never finalized (app killed mid-recording), `findActiveSession` returns it. But `recoverLast` sets `state: 'stopped'` (not `'recording'`) — the user must explicitly resume or discard. There's no resume path implemented; only «view as if stopped». This was deferred per `P1-J-05` in `STATUS.md`.
- Safe modification: Add an explicit «Resume recording» button on the recovery dialog; alternatively auto-finalize with `ended_at = lastPoint.ts` on recovery.
- Test coverage: No `recoverLast.test.ts`. Manual P1-M field tests pending.

**Phone-E.164 validation is loose (R11, documented):**
- Files: `apps/mobile-rn/src/state/settings.ts:147` (`normalizePhoneE164`).
- Why fragile: Accepts `1234567` → `+1234567`. Real validation requires libphonenumber. Loose validation OK because phone field is local-only (used as UX hint for «my number» comparison in chat search).
- Safe modification: Add libphonenumber-js (~140KB gzipped) if/when phone-based contact discovery ships; for current scope it's fine.
- Test coverage: None for the validator.

---

## Scaling Limits

**Mobile SQLite point storage:**
- Current capacity: ~50K points per session before query latency degrades (no benchmark — extrapolation).
- Limit: SQLite scales to millions of rows without trouble; the limit is JS-side memory when `loadPointsForSession` returns the full array.
- Scaling path: Page point load by ts ranges; for map preview, sample at zoom-appropriate density.

**Realtime WebSocket fanout:**
- Current capacity: Phase 8/H ships with `cap=1000` followers per story (celebrity-pull beyond that goes through refresh). Backend `feed.story.published` does N×SQL fetch.
- Limit: For a high-follow user (>10K followers), realtime delivery degrades to «check on next refresh».
- Scaling path: Push fanout to a worker pool with rate-limited send to NATS; have notifications service handle delivery throttling.

**Backend rate limits already calibrated for Phase 8 traffic:**
- See `pkg/ratelimit` settings in STATUS.md Phase I — these are conservative defaults. Re-tune as traffic data arrives.

---

## Dependencies at Risk

**Mapbox SDK pinned to `^10.3` (`@rnmapbox/maps`):**
- Risk: Major version upgrade required when SDK 11 lands; API changes around layer style props and OfflineManager (per typical Mapbox release cadence).
- Impact: Visual regressions on TrackLayer / ZoneLayer / CorridorLayer; offline pack manager API may change shape.
- Migration plan: All Mapbox usage is contained in `apps/mobile-rn/src/map/` (per CLAUDE.md ESLint rule). Upgrade is a one-package change confined to ~10 files.

**`expo-sqlite` migrating to «new architecture»:**
- Risk: Expo SDK 54+ uses the new architecture; legacy sync API (`getFirstSync`, `runSync`, `withTransactionSync`) used throughout `apps/mobile-rn/src/storage/*` may receive breaking changes.
- Impact: All repository files would need to adopt async equivalents.
- Migration plan: Wrap all `getDatabase()` calls in an internal adapter; introduce async variants gradually behind feature flag.

**`expo-file-system/legacy`:**
- Files: `apps/mobile-rn/src/sync/mediaUpload.ts:15`, `apps/mobile-rn/src/media/adapters/ExpoMediaAdapter.ts:6`.
- Risk: «legacy» suffix telegraphs deprecation. Expo SDK is moving to the unified `expo-file-system` API.
- Impact: Build fails when legacy export is removed (Expo SDK 55+).
- Migration plan: Switch to new API in the same release cycle as Expo SDK upgrade.

---

## Missing Critical Features

**Lap support in field-tested run (P1-M is open):**
- Problem: Lap UI shipped Round 2 but field testing (`P1-M-01..15` in `STATUS.md`) on iPhone / Pixel / Chinese-Android pending.
- Blocks: Phase 1 acceptance per ТЗ §3.15.

**Resume from crash:**
- Problem: `recoverLast` shows recovered session in `stopped` state. No «Resume» path.
- Blocks: Spec §3 «фоновая запись GPS» robustness story.

**Offline tile cap (Mapbox 6000 tiles per pack):**
- Problem: `apps/mobile-rn/src/map/offline.ts` downloads zoom 12-16 over 10×10 km. No explicit cap enforcement.
- Blocks: Long-distance users (trail runners crossing multiple regions).

**Push notifications for non-message events:**
- Problem: Per ADR-0004 / Phase 8/J, push deep-links handle `message.new`, `feed.post.{liked,commented}` (orphan), `feed.story.published` (orphan). No push for `user.xp.changed`, no toast for new records.
- Blocks: User retention features.

**Backend `activity-sync` upload v2 schema (laps + activity_type):**
- See R10 above. Server cannot ingest the new columns yet.

---

## Test Coverage Gaps

**Storage repositories (no real-DB integration tests, R5 still open):**
- What's not tested: `walletRepository` against real SQLite, `lapRepository`, `recordsRepository`, `relationsRepository`, `socialRepository`, `pointRepository`, `sensorRepository`. All have pure-domain unit tests but no migration test, no transaction rollback test, no CHECK-violation test.
- Files: `apps/mobile-rn/src/__tests__/` lacks `*.integration.test.ts` files.
- Risk: Migration ordering bugs, ON CONFLICT semantics, CHECK constraint surprises only surface at runtime on a real device.
- Priority: High. R5 identified this gap; not yet closed.

**Auth flows (R5):**
- What's not tested: `useAuthStore.{register, login, requestCode, loginWithCode, hydrate, logout}`. No mocks for `apiClient`. No test for token refresh on 401. No test for the auto-logout when refresh fails.
- Files: `apps/mobile-rn/src/state/auth.ts`, `apps/mobile-rn/src/auth/apiClient.ts`.
- Risk: Auth bugs are user-visible and security-sensitive.
- Priority: Medium-High.

**State machine for recording / pause / lap:**
- What's not tested: `useActivityStore.{start, stop, markLap, recoverLast, reset}` under realistic sequences (rapid stop, double-tap, pause during lap, etc.).
- Files: `apps/mobile-rn/src/state/activity.ts`.
- Risk: Race conditions like R7 (now fixed) lurk where state transitions interleave.
- Priority: Medium.

**Realtime adapters:**
- What's not tested: `WebSocketRealtimeAdapter` reconnect backoff, jitter, ping/pong, message ordering, late event arrival, deduplication via `messageId`.
- Files: `apps/mobile-rn/src/realtime/adapters/WebSocketRealtimeAdapter.ts`.
- Risk: Subtle reconnect bugs surface as «missed messages» — hard to debug after the fact.
- Priority: Medium.

**Permission matrix sync (Go ↔ TS):**
- What's not tested: Cross-language assertion that the Go RBAC matrix in `services/backend/pkg/permissions` matches TypeScript matrix in `apps/mobile-rn/src/modules/permissions`. Phase 8/K added 16 Go + 29 TS tests covering each side independently.
- Files: `services/backend/pkg/permissions/`, `apps/mobile-rn/src/modules/permissions/`.
- Risk: Authorization drift bug.
- Priority: Medium.

**E2E mobile + backend smokes:**
- What's not tested: Mobile-driven end-to-end (register → record session → publish post → comment → moderate). Backend has 9 Python smoke scripts (`services/backend/scripts/smoke_*.py`) but none drive the actual RN app.
- Files: `services/backend/scripts/` directory.
- Risk: API contract mismatches between mobile DTO and server DTO.
- Priority: Low until external testers join.

---

*Concerns audit: 2026-05-14*
