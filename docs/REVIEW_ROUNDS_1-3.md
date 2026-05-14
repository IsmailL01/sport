# Review: Rounds 1–3

Дата: 2026-05-06
Скоуп: все изменения от Round 1 (audit + Feed/Stories cleanup) до Round 3 (P2 scaffolds).

Условные обозначения:
- 🔴 **Критично** — блокер для production, либо security.
- 🟡 **Существенно** — нужно починить до следующего раунда, иначе технический долг растёт.
- 🔵 **Информация** — nice-to-have / debt notes, не блокер.

---

## 🔴 Критичные

### R1. Strava `client_secret` запекается в mobile bundle

**Файл:** [src/health/StravaAdapter.ts:37, 110](../apps/mobile-rn/src/health/StravaAdapter.ts#L37)

```ts
constructor(
  clientId: string = process.env.EXPO_PUBLIC_STRAVA_CLIENT_ID ?? '',
  clientSecret: string = process.env.EXPO_PUBLIC_STRAVA_CLIENT_SECRET ?? '',
)
```

`process.env.EXPO_PUBLIC_*` подставляется Metro bundler в JS-бандл во время сборки. Любой пользователь APK / IPA может извлечь secret через декомпиляцию. Strava подписывается под client_secret — её утечка позволит злоумышленнику запрашивать токены от имени нашего приложения и нарушать rate limits.

**Что делать (до подключения реального Strava):**
- Убрать `clientSecret` параметр из adapter полностью.
- Использовать **PKCE flow** (Strava его поддерживает с 2021): нет client_secret на устройстве, есть `code_verifier` per-session.
- Refresh-token обмен делать **через backend-proxy** (`POST /api/integrations/strava/refresh`), не напрямую с Strava от устройства.
- Документировать в `docs/INTEGRATIONS.md` явно: «никаких provider secrets на устройстве».

Сейчас Strava-adapter — stub (`isAvailable() === false` без env vars), но архитектурно неправильно. Если кто-то «временно» добавит `.env` файл — секрет уйдёт в бандл.

---

## 🟡 Существенные

### R2. Wallet balance может уйти в негатив

**Файл:** [src/storage/walletRepository.ts:64-69](../apps/mobile-rn/src/storage/walletRepository.ts#L64)

`wallet_balance.coins` обновляется как `coins + excluded.coins`. Для `kind: 'spend'` `signedAmount` отрицательный → можно потратить больше, чем есть.

В Round 3 ShopScreen все кнопки disabled, но `recordTransaction({ kind: 'spend' })` уже работает. Если кто-то вызовет из dev-консоли — баланс уйдёт в минус молча.

**Что делать:**
- Добавить CHECK constraint в `wallet_balance`: `CHECK (coins >= 0)`. SQLite поддерживает, на INSERT/UPDATE constraint violation бросит ошибку.
- В `recordTransaction` для `kind === 'spend'` сначала проверить `getBalance(userId) >= args.amount`, иначе throw.
- Unit test: «spend больше баланса → бросает».

### R3. ForeignProfileScreen упоминает stories, которые удалены

**Файл:** [src/navigation/screens/ForeignProfileScreen.tsx:282-289](../apps/mobile-rn/src/navigation/screens/ForeignProfileScreen.tsx#L282)

После удаления Stories модуля экран всё ещё показывает hint «Взаимная подписка — вы видите stories друг друга». Пользователю обещано то, чего больше нет.

**Что делать:** убрать / переформулировать блок.

### R4. RunCard и StoryRing — мёртвый код в design system

**Файлы:** [src/design/components/RunCard.tsx](../apps/mobile-rn/src/design/components/RunCard.tsx), [src/design/components/StoryRing.tsx](../apps/mobile-rn/src/design/components/StoryRing.tsx)

После удаления Feed/Stories (Round 1) эти компоненты не используются нигде кроме `DevPreviewScreen` (preview page) и `design/index.ts` (re-export).

`RunCard` — большой компонент (~200 LOC) специфичный для feed-poста. Сохранять «на всякий случай» — это противоречит CLAUDE.md: «Don't add features… beyond what the task requires».

**Что делать:**
- Удалить `RunCard.tsx`, `StoryRing.tsx`, их exports в `design/index.ts`, упоминания в `DevPreviewScreen.tsx`.
- ЛИБО: оставить только если их планируется переиспользовать (тогда нужен ADR «оставляем как UI-kit primitives для будущего»).

### R5. Нет unit-тестов для новых модулей

**Что без покрытия (отсортировано по риску):**

| Модуль | Риск | Что протестировать |
|---|---|---|
| `walletRepository` | средний | atomicity recordTransaction; idempotency через UNIQUE; balance math |
| `lapRepository` | низкий | append→list контракт; replace-on-conflict |
| `importRepo` | высокий | UNIQUE(source, external_uuid) дедуп; ACTIVITY_MAP корректность; INSERT OR IGNORE счётчики inserted/duplicates |
| `useActivityStore.markLap` | средний | rapid taps; lap-finalize при stop; edge: <2 точки |
| `useWalletStore.awardForSession` | высокий | idempotency на повторный stop того же session; cap accumulation across sessions |
| `HealthKit / Strava adapters` | низкий | stub-safe behavior (mock require) — но Jest не подгружает `react-native-health`, написать просто `isAvailable === false` тест |
| `Auth providers` | низкий | isAvailable matrix (ios vs android, with vs without env) |

Currency domain (pure) уже покрыта на 13 тестов — хорошо. Storage + state-layer без тестов — основной gap.

### R6. `RootNavigator` комментарий упоминает удалённые feed-events

**Файл:** [src/navigation/RootNavigator.tsx:58](../apps/mobile-rn/src/navigation/RootNavigator.tsx#L58)

```ts
// realtime-доставка (chat messages, feed events, stories, xp updates)
```

После Round 1 feed events и stories больше не доставляются. Комментарий вводит в заблуждение нового разработчика. **Что делать:** обновить до «chat messages + xp updates».

### R7. `useActivityStore.lapStartIdx` race-window

**Файл:** [src/state/activity.ts:391-400](../apps/mobile-rn/src/state/activity.ts#L391)

```ts
markLap: () => {
  const { state, points, laps, lapStartIdx } = get();
  // ... compute lap
  set({ laps: [...laps, lap], lapStartIdx: points.length - 1 });
},
```

Между `get()` и `set()` может прийти новая GPS-точка через `acceptPoint`, который тоже вызывает `set({ points: [...] })`. В однопоточном JS это safe — между synchronous блоками нет вставки. Но в `acceptPoint` после `set` идёт ещё `closureDetector.check(...)` который тоже может через колбэк изменить state.

Риск маленький (точки приходят раз в 1-2с, лапы тоже редко), но я бы:
- Использовать `set((s) => ({ laps: [...s.laps, lap], lapStartIdx: s.points.length - 1 }))` вместо snapshot.
- ИЛИ зафиксировать `pointsAtMark = get().points` и считать lap от него до конца.

### R8. `Apple AuthProvider`: type-narrow issue

**Файл:** [src/auth/authProviders.ts:130-133](../apps/mobile-rn/src/auth/authProviders.ts#L130)

```ts
const displayName = result.fullName
  ? [result.fullName.givenName, result.fullName.familyName].filter((x) => x !== null).join(' ').trim() || null
  : null;
```

`fullName.givenName` может быть `undefined` (Apple возвращает поля только при первом sign-in согласно privacy policy). `filter((x) => x !== null)` пропускает `undefined`. Затем `join` склеит `undefined` в строку «undefined Doe». Безобидно по runtime, но грязно.

**Что делать:** `filter((x): x is string => typeof x === 'string')` — корректный type-guard.

---

## 🔵 Информация / технический долг

### R9. `useActivityStore` разрастается

400+ LOC, обрабатывает: pipeline, pause detection, closure, area calc, sensor aggregate, calories, records, wallet award, lap finalize. Можно расщепить на `useActivityStore` (lifecycle) + дочерние hooks (`useLapTracking`, `useSessionFinalization`). Не блокер.

### R10. SyncEngine не отправляет `activityType` / `laps` на backend

**Файл:** [src/sync/syncEngine.ts](../apps/mobile-rn/src/sync/syncEngine.ts)

Round 2 добавил `activity_type` колонку и таблицу `laps`. Sync push на backend этого не знает — server получит DTO без этих полей. Когда backend будет готов принять, понадобится:
- Server-side migration на `sessions.activity_type` + `laps` table.
- Bump sync DTO version (`sessions/upload` v2).
- В `syncEngine.ts` рендер `Session` с activityType.

Сейчас приемлемо: клиент-only feature, backend не знает.

### R11. `phoneE164` валидация loose

**Файл:** [src/state/settings.ts:147](../apps/mobile-rn/src/state/settings.ts#L147)

```ts
const digits = trimmed.replace(/\D/g, '');
if (digits.length < 6 || digits.length > 15) return null;
return `+${digits}`;
```

Принимает «1234567» → «+1234567» что не валидный E.164. Реальная валидация требует libphonenumber (страна-специфика). Поскольку поле локальное и только для UX hint, OK для прототипа.

### R12. `HealthKitAdapter.grantedScopes()` always returns full set after init

**Файл:** [src/health/HealthKitAdapter.ts:113-118](../apps/mobile-rn/src/health/HealthKitAdapter.ts#L113)

Apple HealthKit privacy policy не даёт readback granted scopes. Если пользователь отозвал доступ в Settings, мы об этом узнаем только при первой ошибке `getSamples`. Поведение задокументировано в комментарии — приемлемо.

### R13. `RunDetailsScreen` snapshot pattern усложняется

Файл накопил 4 snapshot-поля (`points / areaM2 / closureFired / newRecords / laps`). Скоро это перерастёт в отдельный `useSessionSummarySnapshot` hook. Не критично.

### R14. `ImportFromAdapter` использует `sessionId = startedAt` как PK

**Файл:** [src/health/importRepo.ts:79](../apps/mobile-rn/src/health/importRepo.ts#L79)

Если две импортированных сессии имеют одинаковый `startedAt` (теоретически — две тренировки начавшиеся в одну ms), PK конфликт. INSERT OR IGNORE проглотит. Очень редкий кейс (Date.now-точность ms), но дедуп пометит как duplicate ошибочно.

**Возможный фикс:** для импорта генерировать sessionId через `Math.max(now, startedAt + offset)` если уже занят. Не блокер.

### R15. `ChatsListScreen` фильтрует `peerUserId === null` чаты при phone-query

`existingPeerIds` собирается только из `peer === non-null` → группы (где peerUserId=null) фильтруются. Hashtag/title-search всё равно работает. OK.

### R16. `DevPreviewScreen` всё ещё показывает `<TabBar active="record" />`

Этот файл — dev-only витрина компонентов. После удаления Feed (R4 связано) ничего не сломалось, но имеет смысл убрать RunCard preview когда вычистим мёртвый код.

### R17. Phone field не привязан к OAuth-providers ADR-0003

ADR-0003 описывает только Google/Apple. В реальности phone-OTP в России (через SMS) — третий очень популярный provider. Не критично сейчас, но при OAuth roll-out стоит добавить `SmsOtpAuthProvider` в registry.

### R18. ADR-0002 (Guest mode) описывает миграцию guest→real, но БД-схема не поддерживает rewrite `user_id` нагенерированной guest-UUIDом

Все таблицы используют `user_id TEXT`. При guest→real нужен `UPDATE … SET user_id = ?`. Это работает, но для wallet_transactions (которая может быть толстой) — потенциально дорогая операция. Стоит добавить hint в ADR-0002 § «Когда привязка аккаунта» о необходимости индекса по `user_id` во всех соответствующих таблицах. У нас:
- `wallet_balance` — PRIMARY KEY (user_id) ✓
- `wallet_transactions` — INDEX (user_id, ts DESC) ✓
- `social_relations` — PRIMARY KEY (viewer_id, target_id) — нужно посмотреть
- `personal_records` — PRIMARY KEY (kind) — нет user_id!

Wait — `personal_records` нет user_id! Это означает multi-user на одном устройстве (теоретический guest→real) перетрёт чужие рекорды. Не критично сейчас (multi-user-on-device не поддерживается), но при guest implementation надо вспомнить.

---

## Суммарно

### Что хорошо
- ✅ tsc clean, jest 412/412 passing.
- ✅ Удаление Feed/Stories выполнено чисто (нет компиляционных висяков).
- ✅ Stub-safe pattern для health/auth адаптеров — лучше чем заставлять весь проект тянуть native deps.
- ✅ ADR-документация трёх непринятых решений (Guest, OAuth, backend cleanup) — команда не будет «переоткрывать» эти вопросы.
- ✅ Currency domain — pure, 13 тестов, антифрод явно прописан.
- ✅ Phone field обработан без backend changes — респект ADR-логике «откладываем».
- ✅ Lap-функционал — компактный, тестов хватает, UI чистый.

### Перед merge / production должен быть починен (🔴 + 🟡)
1. **R1** — Strava client_secret убрать из bundle, переход на PKCE.
2. **R2** — Wallet balance CHECK constraint + spend-validation.
3. **R3** — ForeignProfileScreen «stories» hint удалить.
4. **R4** — RunCard / StoryRing решение: удалить или ADR-0005 «UI-kit primitives».
5. **R5** — Минимум: тесты для walletRepository, importRepo, useWalletStore.awardForSession.
6. **R6** — RootNavigator комментарий.
7. **R7** — `markLap` использовать functional set.
8. **R8** — Apple displayName filter type-guard.

### Запланировать в Round 4
- syncEngine v2 с activityType + laps.
- Backend currency-service + atomic spend (закрывает R2 на правильном уровне).
- Guest mode imp + миграция БД (с учётом R18).
- Реальный HealthKit dev build → unit-тесты с mock module.

### Метрика технического долга

| Метрика | До Round 1 | После Round 3 | Δ |
|---|---|---|---|
| Файлы в `src/` | ~150 | ~145 | -5 (cleanup Feed) |
| Миграции SQLite | 14 | 18 | +4 |
| Adapter-классы (health) | 1 mock | 4 (mock + HC + HK + Strava) | +3 |
| ADRs | 1 | 4 | +3 |
| Unit-тесты | 305 | 412 | +107 |
| Mock-only тесты с реальными storage I/O | 0 | 0 | 0 — gap |

Главный gap по тестам — отсутствие интеграционных тестов с реальным SQLite (in-memory database). Jest-окружение пока не настроено под `expo-sqlite` mock. Это отдельная задача (Round 4 или раньше как тех-долг).
