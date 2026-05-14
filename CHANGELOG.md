# CHANGELOG

## 2026-05-06 — Review fixes (R1–R8 из docs/REVIEW_ROUNDS_1-3.md)

tsc clean. **jest 435/435 passing** (+23 от Round 3: walletDomain 11, walletStore 6, importPlan 6).

### 🔴 Critical fix

- **R1 — StravaAdapter без client_secret на устройстве.** Удалён параметр `clientSecret` из конструктора и refresh-flow. Теперь:
  - `isAvailable()` требует `EXPO_PUBLIC_API_BASE` (наш backend) + `EXPO_PUBLIC_STRAVA_CLIENT_ID` (публичный).
  - `refreshViaBackend()` дёргает `POST {backend}/integrations/strava/refresh` с `athleteId`. Backend держит refresh_token у себя.
  - В `docs/INTEGRATIONS.md` добавлен §9 «Безопасность OAuth» с правилом «никаких provider secrets на устройстве» + обязательный PKCE.

### 🟡 Substantial fixes

- **R2 — Wallet balance защита от ухода в негатив.** Два контура:
  1. **БД**: миграция v19 пересоздаёт `wallet_balance` с `CHECK (coins >= 0)`. SQLite не позволяет ADD CONSTRAINT через ALTER TABLE → пересоздание через `_new` table + `INSERT … MAX(coins, 0)` (clamp существующих negatives).
  2. **Pre-flight**: новый `InsufficientBalanceError` в `domain/walletDomain.ts`; `validateTransaction(args, balance)` вызывается до `recordTransaction` и бросает понятное исключение.
- **R3 — ForeignProfileScreen**: «вы видите stories друг друга» → «вы видите забеги друг друга».
- **R4 — RunCard и StoryRing удалены** из design-system: компоненты, их exports в `design/index.ts`, preview в `DevPreviewScreen.tsx` — суммарно −250 LOC мёртвого кода.
- **R5 — Тесты для wallet + import** (+23 теста):
  - **walletDomain.test.ts** (11): `signedAmountFor`, `validateTransaction` happy/overspend/zero/NaN/adjust, `InsufficientBalanceError` fields.
  - **walletStore.test.ts** (6): `awardForSession` идемпотентность, daily cap accumulation, антифрод не пишет в repo, clearAll, последовательные сессии.
  - **importPlan.test.ts** (6): insert / duplicate / reject decisions, dedup по `(source, sourceUuid)`, ACTIVITY_MAP, cross-source merge edge case.
- **R6 — RootNavigator комментарий**: «chat messages, feed events, stories, xp updates» → «chat messages + xp updates».
- **R7 — `useActivityStore.markLap` functional set**: snapshot через `set((s) => ...)` вместо `get()` + `set(...)` чтобы исключить race-window с `acceptPoint`.
- **R8 — Apple AuthProvider displayName type-guard**: `filter((x): x is string => typeof x === 'string' && x.length > 0)` — корректно отсекает undefined без слитого «undefined Doe».

### Архитектурное

- **domain/walletDomain.ts** — новый pure-модуль (`signedAmountFor`, `validateTransaction`, `InsufficientBalanceError`). Не зависит от SQLite → тестируется без mock БД.
- **health/importPlan.ts** — pure planning logic (`planWorkout` → `insert | duplicate | reject`), вынесена из `importRepo.ts` для тестируемости.
- `walletRepository.ts` теперь импортирует pure-хелперы из `domain/walletDomain.ts`. SQL-блок остался прежним, добавлен только pre-flight вызов `validateTransaction`.

### Не сделано в этом раунде

- Интеграционные тесты с реальным SQLite (требует `better-sqlite3` или mock БД-уровня) — оставлено как тех-долг.
- Backend `POST /api/integrations/strava/{exchange,refresh}` endpoints — Round 4 backend work.
- ShopScreen «Купить» pressable + spend flow с InsufficientBalanceError surface — Round 4 (нет UI usecase сейчас, кнопки disabled).

---

## 2026-05-06 — Round 3 (P2 scaffolds + ADRs)

tsc clean. **jest 412/412 passing** (то же что в Round 2 — никаких новых юнит-тестов, P2 — scaffolds).

### Документация

Три новых ADR в [docs/DECISIONS/](docs/DECISIONS/):
- **0002 — Guest mode** ([0002-guest-mode.md](docs/DECISIONS/0002-guest-mode.md)): принят, реализация отложена. Local anonymous user (`isGuest=true`) вместо nullable `user_id`. UI кнопки «Без регистрации» сейчас НЕ добавлена.
- **0003 — OAuth Google/Apple** ([0003-oauth-providers.md](docs/DECISIONS/0003-oauth-providers.md)): унифицированный `AuthProvider` interface. Apple обязательна перед App Store release, Google опциональна. Backend exchange endpoint — Round 4.
- **0004 — Backend cleanup feed/stories** ([0004-feed-backend-cleanup.md](docs/DECISIONS/0004-feed-backend-cleanup.md)): **ничего не удаляем**. Триггеры пересмотра задокументированы (90 дней, security audit, ресурсное давление).

### Добавлено

#### Auth провайдеры (scaffold)
- **[src/auth/authProviders.ts](apps/mobile-rn/src/auth/authProviders.ts)**: `AuthProvider` interface + `GoogleAuthProvider` / `AppleAuthProvider` — stub-safe (lazy `require` для `expo-auth-session` / `expo-apple-authentication`).
- `availableProviders()` фильтрует по `isAvailable()`: на устройстве без native пакетов и env-vars возвращает пустой список.
- **ScreenOnboardIntro**: рендерит кнопки только если `availableProviders().length > 0`. Apple Sign-in: на iOS с native модулем — реальный flow (получаем `identityToken`); backend exchange — todo Round 4. Сейчас Alert «backend ещё не подключён».

#### HealthKit (iOS) adapter
- **[src/health/HealthKitAdapter.ts](apps/mobile-rn/src/health/HealthKitAdapter.ts)** — stub-safe мирор `HealthConnectAdapter`. Лениво `require('react-native-health')`; без него все методы возвращают «недоступно».
- Включает callback-based wrap для `isAvailable / initHealthKit / saveWorkout / getSamples`.
- Маппинг scopes → HK permissions (Workout / HeartRate). Note: `grantedScopes()` всегда возвращает все scopes после первого успешного init (HealthKit privacy policy не даёт readback).
- **health/index.ts**: дефолт на iOS теперь `HealthKitAdapter`, на Android — `HealthConnectAdapter` (без изменения).

#### Strava adapter
- **[src/health/StravaAdapter.ts](apps/mobile-rn/src/health/StravaAdapter.ts)** — pull-only (Strava не принимает workout push).
- Использует `process.env.EXPO_PUBLIC_STRAVA_CLIENT_ID/SECRET` — без них `isAvailable()` возвращает false.
- Готовая структура для OAuth flow + refresh-token logic + `GET /athlete/activities?after=` → конвертация в `ImportedWorkout`.
- В этом раунде не вызывает реальный Strava API (нет UI, нет client_id в env). Готово к подключению в Round 4.

#### HealthPlatform расширен
- `HealthPlatform` теперь включает `'strava'` и `'garmin'` — будут source-значения в SQLite `sessions.source`.

#### Phone field
- **`useSettingsStore.phoneE164`** (MMKV persist v5): локальный номер телефона пользователя.
- **`normalizePhoneE164(raw)`**: ослабленная E.164-валидация (только цифры → +XXX), без libphonenumber. Возвращает null для невалидного input.
- **SettingsScreen**: текстовый input в секции «Аккаунт» с keyboard-type `phone-pad`.
- **ChatsListScreen**: detect query-as-phone (regex `^[+\d][\d\s()-]{4,}$`), сравнение с self phone через `normalizePhoneE164(query) === myPhone`. Empty-state messages теперь различают «это твой номер» vs «поиск по телефону появится позже».

#### Магазин расхода монет
- **[ShopScreen.tsx](apps/mobile-rn/src/navigation/screens/me/ShopScreen.tsx)** — отдельный sub-screen в Me stack.
- 4 категории товаров (Косметика / Премиум / Челленджи / Расходники) × 2-3 item каждая.
- Кнопки «Купить» — disabled c пометкой «Скоро». Spend-механизм (`recordTransaction({ kind: 'spend' })`) в `walletRepository` уже готов из Round 1, но gated UI.
- **WalletScreen**: заглушка «Магазин — скоро» заменена на Pressable Card с chevron, переход в `Shop`.

### Изменено

- **HealthPlatform** union расширен strava + garmin.
- **MeStackParamList** + Wallet sub-screen теперь включает Shop.
- ScreenOnboardIntro теперь учитывает OAuth providers (но в стандартной сборке без deps они скрыты).

### Что НЕ сделано

- Реальная Google / Apple OAuth завязка с backend — Round 4 (требует backend endpoint + конфиг плагины).
- Реальная HealthKit / Strava интеграция — требует EAS development build с native модулями.
- BLE FTMS / ANT+ для тренажёров — отдельный раунд (нужны runtime тесты с реальным железом).
- Garmin Connect, Polar, Suunto, Fitbit OAuth — те же требования что Strava, отложено.
- Поиск чатов по номеру телефона на сервере — требует расширения social-graph trigram.
- Гостевой режим (isGuest=true flow) — ADR-0002 готов, имплементация Round 4+.

### Заметки разработчика

- Все three new adapters (HealthKit / Strava / Auth providers) следуют единому stub-safe паттерну: `require(...)` в try/catch, если модуля нет — fallback в no-op. Это позволяет добавлять scaffold без модификации `package.json`, а build остаётся в Expo Go.
- StravaAdapter и `HealthPlatform.strava` готовы быть пропущенными через существующий `importRepo.importFromAdapter` — никаких дополнительных изменений в БД схеме не нужно, UNIQUE (source, external_uuid) уже работает с любым source-значением.

---

## 2026-05-06 — Round 2 (P1 polish + activity types + laps + Keytel + import dedup)

tsc clean. **jest 412/412 passing** (+34 от Round 1: caloriesExt 13, lap 7, importSanity 9, importAward 2, plus existing 305).

### Изменено

#### UX полирование
- **Тусклая карта на паузе** в [TrackerLiveScreen](apps/mobile-rn/src/navigation/screens/record/TrackerLiveScreen.tsx): overlay `rgba(0,0,0,0.55)` поверх MapboxView с `pointerEvents="none"`. UI-метрики и кнопки остаются ярко-видимыми.
- **Темп в строках JournalScreen** уже был — выяснилось при проверке (audit-агент упустил).
- **Тема карты** в Settings: новый toggle «Спорт / Улицы / Спутник» в секции «Отображение». Маршрутизирует Mapbox style URI (`outdoors-v12` / `streets-v12` / `satellite-streets-v12`). Хранится в `useSettingsStore.mapStyle` (MMKV persist v4).
- **«+N монет» banner** на RunDetails: после `awardForSession` показывает зачисление с пометкой если упёрлось в дневной кап.

#### Activity-type plumbing (run / trail / walk / cycle / treadmill)
- **Миграция v17**: `sessions.activity_type TEXT NOT NULL DEFAULT 'run'`.
- **ActivityType** в [domain/types.ts](apps/mobile-rn/src/domain/types.ts) (единый источник истины; re-export в `domain/currency.ts`).
- **createSession** принимает `activityType`, read-path возвращает в Session DTO.
- **useActivityStore**: `start(activityType?)` сохраняет тип в state, `stop()` использует его для MET-расчёта и для `awardForSession.activity`.
- **TrackerStartScreen**: все 5 chips включены (Бег / Трейл / Ходьба / Велик / Дорожка), выбор пробрасывается через `start()`.

#### Калории
- **MET-таблицы** добавлены для walk / cycle / treadmill / generic_cardio (Compendium of Physical Activities). RUN-таблица сохранена; trail = run × 1.05 (terrain bump).
- **estimateCaloriesForActivity(activity, weight, dur, dist)** — pure dispatcher.
- **caloriesFromHr(hr, dur, athlete)** — Keytel 2005 formula. Sex- и age-aware. Возвращает null если биометрия неполная или HR вне физиологического диапазона (30–230).
- **estimateCaloriesBest(activity, athlete, hr, dur, dist)** — предпочитает HR-based если есть полная биометрия + HR, иначе MET fallback. Подключён в `useActivityStore.stop()`.

#### Lap-функционал
- **Миграция v18**: таблица `laps` с `lap_number / started_at / ended_at / distance_m / duration_s / pace_min_km / avg_hr_bpm`.
- **Domain**: [domain/lap.ts](apps/mobile-rn/src/domain/lap.ts) — `lapFromRange(points, fromIdx, lapNumber)` + `fastestAndSlowestLap(laps)`. Pure.
- **Repo**: [storage/lapRepository.ts](apps/mobile-rn/src/storage/lapRepository.ts) — atomic appendLapsForSession (DELETE + INSERT в transaction).
- **State**: `useActivityStore.laps` + `lapStartIdx` + `markLap()` action. На `stop()` финализируется хвостовой lap и весь массив пишется в БД.
- **UI live**: третья круглая кнопка с секундомер-иконкой и badge `N` в bottom controls TrackerLive. Disabled на паузе и при <2 точках.
- **UI post-session**: lap-таблица на RunDetails (snapshot из activity store) и SessionDetail (lazy load из БД). Подсветка fastest (lime) / slowest (warn).

#### Integrations: дедуп + sanity
- **importRepo.importFromAdapter(sinceMs)**: pull через `HealthAdapter.pullSince`, sanity-check, INSERT OR IGNORE в sessions с UNIQUE (source, external_uuid). Возвращает `ImportResult` с counters (inserted / duplicates / rejected) + `workouts[]` для caller'а чтобы прокинуть в `awardForSession`.
- **checkWorkoutSanity** (pure, в [health/importSanity.ts](apps/mobile-rn/src/health/importSanity.ts)) — отдельный модуль без SQLite-зависимостей: tests без полного env. Отсекает invalid_times / duration_zero / duration_too_long / distance_invalid / pace_too_fast (running < 2:30/km) / speed_too_fast (cycling > 100 km/h) / hr_out_of_range.

#### Тесты
- **caloriesExt.test.ts** (13): MET dispatcher на run / walk / cycle / treadmill / cycle, Keytel male/female/null, estimateCaloriesBest fallback chain.
- **lap.test.ts** (7): lapFromRange edge cases, HR averaging, fastestAndSlowestLap min/max + filter <100m noise.
- **importSanity.test.ts** (9): все reject-причины + happy path + null HR.
- **importAward.test.ts** (2): E2E (без SQLite) MockHealthAdapter → pullSince → sanity → decideCoinsForSession. Проверка дневного кап на 30 импортированных сессиях.

### Что НЕ сделано (Раунд 3, P2)
Те же что в Round 1 secondary list:
- OAuth Google/Apple + Guest (требует ADR).
- HealthKit (iOS) adapter.
- BLE FTMS / ANT+.
- Strava / Garmin Connect OAuth.
- Поиск Чатов по номеру телефона (требует phone в profile + миграция).
- Backend cleanup миграций feed/stories.
- Магазин расхода монет.

### Заметки разработчика
- `domain/calories.ts` старый `estimateCaloriesRun` сохранён как backward-compat обёртка — старые тесты `calories.test.ts` продолжают проходить.
- `MockHealthAdapter.pullSince` уже был добавлен в Round 1; в Round 2 он впервые получил реальный production caller (`importRepo`).
- `GENERIC_CARDIO_TABLE` перестроена в правильный формат `[pace, met]` отсортированный по pace убыванию.
- При отсутствии дистанции (treadmill без датчика) MET-расчёт берёт baseline (table[0][1]) — консервативный нижний клиф.

---

## 2026-05-06 — Round 1 (post-audit cleanup + currency + integrations contract)

Связанные документы:
- [docs/AUDIT.md](docs/AUDIT.md) — таблицы по спецификации
- [docs/CURRENCY.md](docs/CURRENCY.md) — формула и антифрод валюты
- [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md) — приём активностей из внешних источников

tsc clean. **jest 378/378 passing** (+13 currency; −26 feed/stories тесты удалены вместе с модулями).

### Удалено

- **Feed (модуль)**: `src/modules/feed/`, `src/navigation/screens/feed/` (FeedScreen, PostDetail, CreatePost, StoryViewer). Таб «Лента» в нижнем баре, FeedStackParamList в навигации, push deep-link `feed.*`, realtime-диспатч событий `feed.post.{liked,commented}` и `feed.story.published`, кнопка «Поделиться в ленте» из RunDetailsScreen и SessionDetailScreen. Backend `feed` сервис **не тронут** — миграции `0016_stories`/`0017_feed_posts` остаются для rollback-safety.
- **Stories (модуль)**: `src/modules/stories/`. Stories rail из ChatsListScreen, store-диспетчер story-событий.
- **Legacy social UI**: `src/ui/social/{ChatsModal,ChatsListScreen,NewGroupScreen,ChatSettingsScreen}.tsx` — мёртвый код после переезда чатов в `navigation/screens/chats/`.
- **App.legacy.tsx** — старая запасная точка входа, теперь ссылавшаяся на удалённые модули. Git-история сохранила.
- В `RealtimeAdapter` event union убраны типы `feed.post.{liked,commented}` и `feed.story.published`.

### Изменено

#### Навигация и Чаты
- **4 таба** вместо 5: Запись (default) / Журнал / Чаты / Я. См. [src/navigation/AppTabs.tsx](apps/mobile-rn/src/navigation/AppTabs.tsx), [src/design/components/TabBar.tsx](apps/mobile-rn/src/design/components/TabBar.tsx).
- **PeopleSearchScreen** переехал из `screens/feed/` → `screens/chats/`; теперь часть `ChatsStackParamList`.
- **ChatsListScreen** редизайн под Telegram: sticky search bar в шапке, поиск по `displayName` и `@username`. Когда query ≥ 2 символов — фильтрует существующие чаты + параллельно выполняет server-side search (`/search/users`) и показывает «Глобальный поиск»; tap по найденному → `createOrFindDM` → открыть чат. Hint про phone-search «появится позже».

#### Главный экран
- `TrackerStartScreen` теперь показывает **сводку за неделю** (sessions / km / hours) и **карточку «Последняя активность»** (tap → SessionDetail). Заполняет требование §2 спеки.

#### История / Детали
- `SessionDetailScreen`: **таблица сплитов по км** с подсветкой fastest (lime) / slowest (warn) — переехала из legacy `SessionDetailModal` на новый экран. Использует существующий `domain/splits.computeSplits` + `fastestAndSlowestKm`.

#### Настройки
- Снят `__DEV__` гейт с темы.
- Новая секция **«Отображение»** (всегда видна): Theme (dark/light) + Units (km/mi). Использует `useSettingsStore.units` + `setUnits`.
- Версия `'0.9'` (была `'0.8 (M8)'`).

#### Realtime / push
- Реалтайм-диспатчер сократился до chat-only + xp-changed. Push deep-links обрабатывают только `message.new`.

#### Auth logout
- Чистка stores: убран `feed.clearAll` / `stories.clearAll`, добавлен `wallet.clearAll`.

### Добавлено

#### Currency module — внутренняя валюта (см. CURRENCY.md)
- **Domain pure-functions**: [src/domain/currency.ts](apps/mobile-rn/src/domain/currency.ts) — `decideCoinsForSession()` с формулой B (`floor(kcal × activityMult / 10)`), MET-multipliers для run/trail/walk/cycle/treadmill/generic_cardio, антифрод (дневной кап 500 / минимальная длительность 5 мин / pace > 2:30 для running / валидный HR-диапазон).
- **Storage**: [src/storage/walletRepository.ts](apps/mobile-rn/src/storage/walletRepository.ts) — atomic `recordTransaction` (INSERT tx + UPDATE balance в одной транзакции), `hasTransactionForSession` (идемпотентность), `coinsEarnedSince` (для cap-логики).
- **Store**: [src/state/wallet.ts](apps/mobile-rn/src/state/wallet.ts) — Zustand. `awardForSession()` склеивает domain + storage, вызывается из `useActivityStore.stop()` после `finalizeSession`.
- **UI**: [src/navigation/screens/me/WalletScreen.tsx](apps/mobile-rn/src/navigation/screens/me/WalletScreen.tsx) — Hero-баланс, заглушка «Магазин — скоро», список последних 50 транзакций с metadata (activity, kcal, capped).
- **MeScreen**: новая ActionRow «Кошелёк» с динамическим subtitle «N монет».
- **RootNavigator**: `useWalletStore.hydrate(user.id)` вызывается после auth.
- **Тесты**: [src/__tests__/currency.test.ts](apps/mobile-rn/src/__tests__/currency.test.ts) — 13 кейсов (happy path по 4 activity, anti-fraud reasons, cap exact / partial / exceeded, null HR).

#### Integrations contract (см. INTEGRATIONS.md)
- **Schema**: `sessions.source TEXT NOT NULL DEFAULT 'gps'`, `sessions.external_uuid TEXT`, `UNIQUE INDEX (source, external_uuid) WHERE external_uuid IS NOT NULL` для дедупа.
- **Adapter contract**: `HealthAdapter.pullSince(sinceMs | null)` — incremental import, отсортированный по `startedAt`.
- **HealthConnectAdapter** ([src/health/HealthConnectAdapter.ts](apps/mobile-rn/src/health/HealthConnectAdapter.ts)) — Android референс. **Stub-safe**: лениво пытается `require('react-native-health-connect')`; если пакета нет (Expo Go) — деградирует в empty-pull, чтобы JS-bundle билдился. Маппинг scopes → HC permission objects, маппинг activityType → exerciseType коды. Готов к подключению native-плагином через `eas build --profile development`.
- **MockHealthAdapter** дополнен `pullSince`. Singleton getter теперь возвращает `HealthConnectAdapter` на Android, `MockHealthAdapter` на остальных платформах.

#### DB миграции
- **v15**: `wallet_balance` + `wallet_transactions` + индексы (см. database.ts).
- **v16**: `sessions.source` + `sessions.external_uuid` + UNIQUE-индекс для дедупа.

### Что НЕ сделано в этом раунде (см. AUDIT.md § «Раунд 2/3»)

**Раунд 2 (P1):**
- Lap-функционал (live + post-session lap-таблица).
- Тусклая карта на паузе TrackerLive.
- Темп в row JournalScreen.
- Калории по HR (Keytel / Heil).
- MET-таблицы для walk/cycle/treadmill/generic_cardio (сейчас только running).
- Toast «+N монет» при сохранении сессии.
- Тип карты в Settings.
- GPS-sanity и cross-source dedup для интеграций.
- E2E тест import → award.

**Раунд 3 (P2):**
- OAuth Google/Apple + Guest (требует отдельного ADR).
- HealthKit (iOS) adapter.
- BLE FTMS / ANT+.
- Strava / Garmin Connect OAuth.
- Поиск Чатов по номеру телефона (требует phone в profile + миграция).
- Backend cleanup миграций feed/stories (необратимо — отдельный ADR).
- Магазин расхода монет.

### Заметки разработчика

- Миграции v11 (stories) и v12 (feed_posts/feed_comments) **остаются в коде** как deprecated — мобильный код больше к ним не обращается, но строки в БД у существующих пользователей не трогаем (rollback safety). Если позже захотим полностью удалить — нужен ADR + продумать данные на backend.
- `HealthConnectAdapter` написан так, что отсутствие native-пакета не ломает билд — это позволит постепенно подключать adapter без сразу-в-prod.
- Currency формула выбрана с обоснованием в `docs/CURRENCY.md` §3 (предложены 3 варианта, выбран B).
