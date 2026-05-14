# AUDIT — фитнес-приложение Running Ecosystem

Дата: 2026-05-06
Скоуп: `apps/mobile-rn/` (Expo React Native; Flutter архивирован) + `services/backend/`.

---

## 0. Предлагаемые ответы на 10 уточняющих вопросов

> Это **дефолты**. Перечеркни / замени то, с чем не согласен, и я пересоберу план.

| # | Вопрос | Дефолт |
|---|---|---|
| Q1 | Глубина удаления Feed | Удалить **mobile**: `modules/feed/`, `modules/stories/`, `screens/feed/*` (кроме PeopleSearch — переезжает), таб Feed, FeedStackParamList, feed-роуты в push deep-link, диспетчер feed-events в RealtimeStore, XP-награды за посты. **Backend оставить запущенным** (миграции `0016_stories`, `0017_feed_posts` не дропаем — необратимо для прод). Backend cleanup — отдельный follow-up. |
| Q2 | Stories | Удалить с mobile вместе с Feed (можно вернуть как stories-rail в Chats позже отдельной задачей). |
| Q3 | PeopleSearchScreen | Перенести в `screens/chats/PeopleSearchScreen.tsx`, добавить в `ChatsStackParamList`. |
| Q4 | Поиск в Чатах | **Итерация 1 (сейчас):** по @username и по displayName (ФИО) — backend уже умеет trigram. **Итерация 2 (отдельно):** добавить поле `phone` в profile + миграцию + индекс + шаг онбординга. Не блокируем текущий PR на phone. |
| Q5 | Дефолтный таб | **Record** (`TrackerStartScreen`). На него же кладём «Сводку за неделю» + «Последняя активность» (требование спеки §2). |
| Q6 | Currency UI | Sub-screen в Me-табе («Кошелёк»), toast на сохранении сессии. |
| Q7 | Integrations referense | **Health Connect (Android)** — runtime-verified платформа. HealthKit (iOS) — следующая итерация. |
| Q8 | Currency scope | Start с running. Схема **sport-agnostic** (`activity.source`, `activity.activity_type`, MET-таблицы по типу). |
| Q9 | Расположение доков | `docs/AUDIT.md`, `docs/CURRENCY.md`, `docs/INTEGRATIONS.md`. `CHANGELOG.md` — в корне. |
| Q10 | OAuth/Guest | OAuth Google/Apple и Guest — **P2, не в этом раунде** (Guest конфликтует с multi-tenant из CLAUDE.md, нужен отдельный ADR). |

---

## 1. Базовые экраны и функции

Легенда: ✅ готово и хорошо · 🟡 есть, но требует доработки · ❌ отсутствует.
Приоритеты: **P0** = блокер для спеки · **P1** = важно, в этом раунде · **P2** = follow-up.

### 1.1 Авторизация / онбординг (§ спеки 1)

| Функция | Статус | Где | Что не так / чего не хватает | Приоритет |
|---|---|---|---|---|
| Email + OTP-код | ✅ | [src/state/auth.ts](apps/mobile-rn/src/state/auth.ts), [navigation/AuthStack.tsx](apps/mobile-rn/src/navigation/AuthStack.tsx) | Реализован passwordless через код на email, не email+пароль. По UX лучше OTP — но требование спеки буквально «email+пароль». **Предлагаю оставить OTP** (безопаснее) — подтверди. | P1 |
| OAuth Google | ❌ | — | Нет провайдера, нет UI-кнопки. Требует `expo-auth-session`, client_id, backend `/oauth/google/exchange`. | P2 |
| OAuth Apple | ❌ | — | Аналогично, через `expo-apple-authentication`. iOS only. | P2 |
| Гостевой режим | ❌ | — | Конфликт с multi-tenant (CLAUDE.md): сессии всегда привязаны к `user_id`. Нужен ADR — local-only user или anonymous user-row. | P2 |
| Онбординг (Name/Birthday/Permissions) | ✅ | [navigation/OnboardingStack.tsx](apps/mobile-rn/src/navigation/OnboardingStack.tsx) | Шаги Name → Birthday → Permissions работают. | — |
| Phone в профиле | ❌ | — | Нет поля. Нужно для Q4-итерации 2. | P2 |

### 1.2 Главный экран (§ спеки 2)

| Функция | Статус | Где | Что не так / чего не хватает | Приоритет |
|---|---|---|---|---|
| Кнопка «Начать бег» | ✅ | [screens/record/TrackerStartScreen.tsx](apps/mobile-rn/src/navigation/screens/record/TrackerStartScreen.tsx) | START button + map preview + GPS chip + genre chips. | — |
| Сводка за неделю | ❌ | — | Не показывается на TrackerStartScreen. Данные есть в `StatsScreen` (Week toggle) — нужно вынести компакт-карточку «За неделю: X км / N сессий / T ч» на стартовый экран. | **P0** |
| Последняя активность | ❌ | — | На TrackerStartScreen не показана. `useHistoryStore` уже даёт sorted desc — поставить превью последней сессии. | **P0** |

### 1.3 Активная тренировка (§ спеки 3)

| Функция | Статус | Где | Что не так / чего не хватает | Приоритет |
|---|---|---|---|---|
| Карта с треком | ✅ | [screens/record/TrackerLiveScreen.tsx](apps/mobile-rn/src/navigation/screens/record/TrackerLiveScreen.tsx), [src/map/](apps/mobile-rn/src/map/) | TrackLayer + CorridorLayer (open) / ZoneLayer (closed). | — |
| Текущий темп, средний темп | ✅ | [state/activity.ts](apps/mobile-rn/src/state/activity.ts) | currentPace + avgPace + bestPace1Km. | — |
| Время / дистанция | ✅ | TrackerLiveScreen | 4 крупные метрики сверху. | — |
| Пауза / Стоп | 🟡 | TrackerLiveScreen | Pause toggles isPaused, Stop → Alert (Удалить/Сохранить). **Карта НЕ тускнеет на паузе** (требование спеки). | P1 |
| Lap | ❌ | — | Не реализовано. Нужно: lap-button + lap rows в активности + lap-таблица в RunDetails. | P1 |
| Фоновая запись GPS | ✅ | [src/location/](apps/mobile-rn/src/location/), TaskManager | ExpoLocationAdapter использует TaskManager + foreground service. Verified runtime по STATUS.md. | — |

### 1.4 Завершение тренировки (§ спеки 4)

| Функция | Статус | Где | Что не так / чего не хватает | Приоритет |
|---|---|---|---|---|
| Карта маршрута | ✅ | [screens/record/RunDetailsScreen.tsx](apps/mobile-rn/src/navigation/screens/record/RunDetailsScreen.tsx) | Map preview с TrackLayer/ZoneLayer. | — |
| Итоги (дистанция / время / темп / калории) | ✅ | RunDetailsScreen | + avgHR, + area (если closed). | — |
| Сохранить | ✅ | RunDetailsScreen | Auto-saved on Stop, кнопка «Готово» возвращает на Tabs. | — |
| Удалить | ✅ | RunDetailsScreen | deleteSession. | — |
| Поделиться | 🟡 | RunDetailsScreen | Сейчас две кнопки: «Поделиться в ленте» (Feed) + «Export GPX» (Share API). После удаления Feed остаётся только Export GPX. **Спека требует «опц. Поделиться»** — Export GPX этому соответствует. ✅ после удаления Feed-кнопки. | **P0** (удалить кнопку Feed) |

### 1.5 История активностей (§ спеки 5)

| Функция | Статус | Где | Что не так / чего не хватает | Приоритет |
|---|---|---|---|---|
| Список по дате | ✅ | [screens/journal/JournalScreen.tsx](apps/mobile-rn/src/navigation/screens/journal/JournalScreen.tsx) | Sorted desc. | — |
| Pull-to-refresh | ✅ | JournalScreen | `useHistoryStore.refresh`. | — |
| Элемент: дата / дистанция / время / темп | 🟡 | JournalScreen | Дата + distance + duration есть. **Темп в row не показан** — добавить. | P1 |
| Переход в детали | ✅ | JournalScreen | tap → SessionDetail. | — |

### 1.6 Детали активности (§ спеки 6)

| Функция | Статус | Где | Что не так / чего не хватает | Приоритет |
|---|---|---|---|---|
| Интерактивная карта | ✅ | [screens/journal/SessionDetailScreen.tsx](apps/mobile-rn/src/navigation/screens/journal/SessionDetailScreen.tsx) | TrackLayer/ZoneLayer. | — |
| Метрики (distance/duration/pace) | ✅ | SessionDetailScreen | | — |
| Сплиты по км / милям с временем и темпом | ❌ | — | Логика `computeSplits` ЕСТЬ в [src/domain/splits.ts](apps/mobile-rn/src/domain/splits.ts) и UI был в legacy `src/ui/SessionDetailModal.tsx`, но в новом `SessionDetailScreen` сплитов нет. Нужно перенести таблицу. | **P0** |
| Удалить с подтверждением | 🟡 | SessionDetailScreen | Удаление есть, **подтверждение нужно проверить** — есть ли Alert? | P1 |

### 1.7 Профиль (§ спеки 7)

| Функция | Статус | Где | Что не так / чего не хватает | Приоритет |
|---|---|---|---|---|
| Аватар / имя | ✅ | [screens/me/MeScreen.tsx](apps/mobile-rn/src/navigation/screens/me/MeScreen.tsx) | Cover + avatar overlap + GradeBadge. | — |
| Общая статистика | ✅ | MeScreen | total km / sessions / hours. | — |
| Длинная дистанция (рекорд) | ✅ | [src/domain/records.ts:9-16](apps/mobile-rn/src/domain/records.ts#L9-L16) | `longest_distance` + `longest_duration` + `best_pace_1km/5km/10km` + `most_calories` + `max_avg_speed`. UI: [screens/me/RecordsScreen.tsx](apps/mobile-rn/src/navigation/screens/me/RecordsScreen.tsx). | — |
| Лучший темп на 5 км | ✅ | records.ts | `best_pace_5km` через sliding window. | — |
| Настройки (кнопка) | ✅ | MeScreen action list | → SettingsScreen. | — |
| Выйти | ✅ | MeScreen action list | logout. | — |

### 1.8 Настройки (§ спеки 8)

| Функция | Статус | Где | Что не так / чего не хватает | Приоритет |
|---|---|---|---|---|
| Единицы (км/мили) | 🟡 | [state/settings.ts](apps/mobile-rn/src/state/settings.ts) (поле есть), UI нет | В `useSettingsStore` поле `units: 'metric' | 'imperial'` ЕСТЬ, но в [SettingsScreen.tsx](apps/mobile-rn/src/navigation/screens/me/SettingsScreen.tsx) переключателя нет. Добавить row toggle. | **P0** |
| Тип карты | 🟡 | [state/map.ts](apps/mobile-rn/src/state/map.ts) (light/dark) | MapTheme есть, но в Settings нет UI выбора. | P1 |
| Тёмная / светлая тема | 🟡 | SettingsScreen (под `__DEV__`) | Сейчас гейтом `__DEV__` — спрятано в проде. Нужно открыть для всех. | **P0** |
| О приложении | ✅ | SettingsScreen | «Версия 0.8 (M8)» — нужно обновить до текущей фазы и добавить ссылку на политику конфиденциальности. | P1 |

### 1.9 Навигация (§ спеки 9)

| Функция | Статус | Где | Что не так / чего не хватает | Приоритет |
|---|---|---|---|---|
| Текущий таб-бар | 🟡 | [AppTabs.tsx](apps/mobile-rn/src/navigation/AppTabs.tsx) | Сейчас 5 табов: Feed / Chats / Record / Journal / Me. **Спека требует 3 таба: Старт / История / Профиль**. После удаления Feed станет 4 → переоформить под цель: оставить Chats (твоё требование) + Record + Journal + Me = 4 таба. Или строго 3 (без Chats). **Дефолт: 4 таба (Record / Journal / Chats / Me)**, дефолтный — Record. | **P0** |
| Настройки иконкой в Профиле | ✅ | MeScreen | Уже так. | — |

---

## 2. Технические требования (§ спеки)

| Функция | Статус | Где | Что не так | Приоритет |
|---|---|---|---|---|
| Локальное хранение (SQLite) | ✅ | [src/storage/database.ts](apps/mobile-rn/src/storage/database.ts) | expo-sqlite, миграции до v12+ (стори/feed — удалятся вместе с Feed). | — |
| Карты — Mapbox | ✅ | [src/map/](apps/mobile-rn/src/map/) | MapAdapter абстракция, изоляция через ESLint `no-restricted-imports`. | — |
| Крупные кнопки / читаемость на солнце | 🟡 | Theme tokens | Тёмная тема по умолчанию — нечитаемо на солнце. Свеп тем + контрастный режим есть в state, нет UI. **Часть P0 (открыть Settings/Theme в проде).** | P1 |
| Адаптивность | ✅ | useTheme + fontScale | Поддержка fontScale. | — |
| Архитектура под синхронизацию | ✅ | [src/sync/syncEngine.ts](apps/mobile-rn/src/sync/syncEngine.ts) | Outbox-based, реализовано Phase 4. | — |

---

## 3. Новые модули (отсутствуют — добавляем)

### 3.1 Currency (внутренняя валюта) — A

| Подзадача | Статус | Что делать | Приоритет |
|---|---|---|---|
| Калории по типу активности (MET) | 🟡 | [src/domain/calories.ts](apps/mobile-rn/src/domain/calories.ts) — MET только для бега. Расширить до running / cycling / walking / treadmill / generic-cardio. | P1 |
| Калории по HR | ❌ | Формула Keytel или Heil. Использовать `avgHrBpm` если есть, fallback MET. | P1 |
| Формула «калории → монеты» | ❌ | Предложу 3 варианта в `CURRENCY.md` (плоский / коэф интенсивности / дневное затухание). | **P0** |
| Антифрод | ❌ | Дневной лимит (≤2000 монет/день?), валидация по GPS speed (< 5 м/с среднего pace для running), валидация HR. | P1 |
| Wallet: баланс + журнал | ❌ | Новая таблица v13: `wallet_balance(user_id, coins)`, `wallet_transactions(id, user_id, kind, amount, source_session_id, ts, meta)`. | **P0** |
| UI «Кошелёк» (Me-таб) | ❌ | Sub-screen с балансом + последние 20 транзакций. | **P0** |
| Toast при сохранении сессии | ❌ | На RunDetails «Сохранить» — toast «+15 монет». | P1 |
| Заглушки точек расхода | ❌ | Sub-screen «Магазин» / коминг сун. | P2 |
| `CURRENCY.md` | ❌ | Документация формулы и антифрода. | **P0** |

### 3.2 Integrations (внешние источники) — B

| Подзадача | Статус | Что делать | Приоритет |
|---|---|---|---|
| `activity.source` поле | ❌ | Миграция v14: `sessions.source TEXT NOT NULL DEFAULT 'gps'`. Значения: `manual` / `gps` / `watch_apple` / `watch_garmin` / `watch_polar` / `watch_fitbit` / `trainer_ble` / `healthkit` / `health_connect` / `strava`. | **P0** |
| Adapter interface | 🟡 | [src/health/HealthAdapter.ts](apps/mobile-rn/src/health/HealthAdapter.ts) — есть основа, добавить `pullSince(t)` для импорта. | **P0** |
| HealthConnectAdapter (Android референс) | ❌ | `react-native-health-connect` (config plugin), реализация read-workouts. | **P0** |
| HealthKitAdapter (iOS) | ❌ | `react-native-health` или `expo-health-kit`. | P2 |
| BLE FTMS / ANT+ (тренажёры) | ❌ | `react-native-ble-plx`. Live HR / cadence / power во время записи. | P2 |
| Webhooks для push-источников | ❌ | Backend endpoint `/integrations/webhook/{source}` с HMAC. | P2 |
| Дедупликация | ❌ | Per source: `external_uuid` уникальный в `sessions(source, external_uuid)`. На import — UPSERT по этому ключу. | P1 |
| `INTEGRATIONS.md` | ❌ | Документация контракта и стратегий pull/push/live. | **P0** |

---

## 4. Краткий план работ по приоритетам

### Раунд 1 (P0 — этот PR / серия PR)
1. **Удалить Feed + Stories** (mobile, по Q1+Q2): модули, экраны, навигация, push deep-link, RealtimeStore-диспетчер, XP-награды за посты. PeopleSearch переезжает в `chats/`.
2. **Telegram-style Чаты:**
   - Перенастроить `ChatsListScreen` UX (header с поиском поверх, sticky search bar, аккуратные time/badge как в TG).
   - Открыть **поиск людей** прямо из ChatsList header (без отдельного экрана), результаты с реал-тайм-фильтрацией. Tap → создать DM или открыть существующий.
   - Поиск работает по `displayName` + `@username` (Q4 итерация 1).
3. **Навигация:** 4 таба = Record / Journal / Chats / Me. Default = Record.
4. **TrackerStartScreen дополнения:**
   - Карточка «Сводка за неделю» (sessions / km / hours).
   - Карточка «Последняя активность» (date + distance + pace).
5. **SessionDetailScreen — добавить сплиты** (логика готова, нужен UI).
6. **SettingsScreen P0-фиксы:**
   - Снять `__DEV__` гейт с темы.
   - Добавить toggle единиц (km/mi).
7. **Currency MVP:**
   - Миграция v13 (wallet_balance + wallet_transactions).
   - Формула + антифрод (см. `docs/CURRENCY.md`).
   - Sub-screen «Кошелёк» в Me-табе.
   - Начисление при save-session (без toast пока — toast в P1).
   - `docs/CURRENCY.md`.
8. **Integrations контракт:**
   - Миграция v14 (sessions.source + sessions.external_uuid).
   - Расширить HealthAdapter interface (pullSince).
   - HealthConnectAdapter (Android) — runtime stub, чтобы пакет встал и permissions запросились.
   - `docs/INTEGRATIONS.md`.

### Раунд 2 (P1 — следующая серия)
- Lap-функционал (live + post-session lap-таблица).
- Тусклая карта на паузе.
- Темп в row JournalScreen.
- Калории по HR.
- MET-таблицы для cycling/walking/treadmill.
- Антифрод per-day cap + GPS sanity.
- Toast +N монет.
- Тип карты в Settings.

### Раунд 3 (P2 — следующие итерации)
- OAuth Google/Apple + Guest (ADR).
- HealthKit (iOS) адаптер.
- BLE FTMS (тренажёры) + ANT+.
- Strava OAuth.
- Garmin Connect.
- Поиск чатов по телефону (требует phone в profile + миграция).
- Webhooks для push-источников.
- Магазин точек расхода монет.

---

## 5. Тесты

26 файлов в [src/__tests__/](apps/mobile-rn/src/__tests__/), STATUS.md заявляет **305/305 passing**. Покрыты: pipeline / area / geo / metrics / records / splits / stats / streak / training / workout / health / sensors / realtime / permissions / gamification / moderation / feed / stories / social / format / design / athlete / calories / gpx / planGenerator.

**Что НЕ покрыто (потребует тестов в раундах):**
- Currency (расчёт, антифрод, кошелёк).
- Integrations (HealthConnect adapter, дедуп).
- Auth flows.
- E2E / integration.

---

## 6. Открытые риски

1. **Откат Feed без backend cleanup** — миграции `0016_stories` и `0017_feed_posts` остаются в проде. Если позже захотим полностью удалить — нужен ADR + migration rollback (необратимо для данных).
2. **Удаление XP-за-посты** ломает gamification-store, надо проверить что общий XP не зависит от FeedStore.
3. **PeopleSearchScreen** сейчас навигирует на `ForeignProfile` (modal в RootStack). После переезда в Chats — навигировать на DM или на ForeignProfile с CTA «Написать»? Решить в раунде 1.
4. **Currency формула** — выбор курса калории→монеты имеет product-impact (мотивация / инфляция). Предложу варианты в `CURRENCY.md`, выберешь на review.
5. **Phone в Чатах** отложен (Q4) — если это критично, скажи и подниму в P0.

---

## 7. Жду подтверждения

После твоего «ок на план» (с любыми правками к таблице дефолтов в § 0) — иду по разделу 4 «Раунд 1» сверху вниз. До этого момента **код не трогаю**.
