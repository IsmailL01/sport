# CURRENCY — внутренняя валюта приложения

Дата: 2026-05-06
Связанные файлы:
- Domain: [src/domain/currency.ts](../apps/mobile-rn/src/domain/currency.ts)
- Storage: [src/storage/walletRepository.ts](../apps/mobile-rn/src/storage/walletRepository.ts) + миграция v15 в [src/storage/database.ts](../apps/mobile-rn/src/storage/database.ts)
- State: [src/state/wallet.ts](../apps/mobile-rn/src/state/wallet.ts)
- UI: [src/navigation/screens/me/WalletScreen.tsx](../apps/mobile-rn/src/navigation/screens/me/WalletScreen.tsx) + кнопка «Кошелёк» в MeScreen.

---

## 1. Цель

Дать пользователю мотивацию записывать каждую тренировку — и почву для будущей экономики (косметика, премиум, входные билеты в челленджи). Применимо ко всем видам активностей, не только бегу.

---

## 2. Расчёт калорий

Источник истины: [src/domain/calories.ts](../apps/mobile-rn/src/domain/calories.ts). Сейчас формула — **MET × weightKg × hours** (Compendium of Physical Activities, Ainsworth 2011). Реализованы MET-коэффициенты для running по pace (мин/км). 

В следующей итерации добавим MET-таблицы для walking / cycling / treadmill / generic_cardio, и HR-based fallback (Keytel / Heil) когда есть `avgHrBpm`.

Точность MET-only: ±15%. Допустимо для прототипа.

---

## 3. Формула «калории → монеты»: 3 варианта

Я рассматривал три варианта. Выбран **B**, остальные оставляю в документе как «варианты пересмотра».

### Вариант A — плоский курс
```
coins = floor(kcal / KCAL_PER_COIN)
```
с `KCAL_PER_COIN = 10`.

**Плюсы:** простота, легко объяснить.
**Минусы:** не различает интенсивность; человек, который медленно прогулялся, и человек, который бежал по горам, получают одинаково за одни и те же сожжённые калории.

### Вариант B — с коэффициентом интенсивности (выбран)
```
coins = floor(kcal × activityMult / KCAL_PER_COIN)
```
с `KCAL_PER_COIN = 10` и матрицей `activityMult` по типу активности:

| Activity | Mult | Идея |
|---|---|---|
| `run` | 1.0 | базовый |
| `trail` | 1.1 | +10% за рельеф / сложность |
| `walk` | 0.8 | пеший |
| `cycle` | 0.9 | велосипед (легче калории сжигать пер distance) |
| `treadmill` | 0.85 | дорожка дома (нет внешних факторов) |
| `generic_cardio` | 0.9 | общий cardio (тренажёр, чужие activity) |

**Плюсы:**
- Отличает «настоящий» outdoor-бег от лёгкой ходьбы.
- Малый перевес trail-running без огромного дисбаланса (1.1, не 1.5).
- Сразу sport-agnostic.

**Минусы:** немного сложнее. Coefficients подбираются эмпирически.

**Почему выбран:** соответствует ожиданию «более тяжёлая тренировка = больше монет», но не вводит сложности уровня дневного затухания (которое требует server-side state).

### Вариант C — с дневным затуханием
```
coins = floor(kcal × activityMult × decay(coinsEarnedToday) / KCAL_PER_COIN)
```
где `decay(c) = max(0.3, 1 - c / 1000)` — после 1000 заработанных монет за день курс падает до 30%.

**Плюсы:** ограничивает «фарм» — нет линейной зависимости 10ч тренировки → 10× монет.
**Минусы:** более сложно объяснить пользователю; и **дневной кап** (см. ниже) уже решает большую часть anti-farm проблемы более жёстко.

---

## 4. Антифрод

Все проверки — в [src/domain/currency.ts:decideCoinsForSession](../apps/mobile-rn/src/domain/currency.ts).

| Проверка | Порог | Действие |
|---|---|---|
| Минимальная длительность | 5 мин | `coins = 0`, reason `session_too_short` |
| Минимум kcal | 10 ккал | `coins = 0`, reason `kcal_too_low` |
| Невозможный темп running | < 2:30 мин/км | `coins = 0`, reason `pace_too_fast` |
| HR вне физиологического диапазона | < 30 или > 230 | `coins = 0`, reason `hr_out_of_range` |
| Дневной кап | 500 монет / сутки | clamp с reason `daily_cap_reached`, либо partial с `capped: true` |
| Идемпотентность | один session_id = одна транзакция | UNIQUE INDEX `idx_wallet_tx_session_unique` + ранний exit в state |

**Что НЕ проверяем сейчас** (P2):
- GPS-плоскость (рывки координат, телепорт) — нужен server-side analysis.
- Согласованность HR ↔ pace ↔ kcal.
- Анти-mock на читы (root, mock providers) — на клиенте бесполезно, нужна серверная привязка к подтверждённому source.

**Server-side fraud detection** — отдельный сервис на Phase 9+ (см. INTEGRATIONS.md). Сейчас защищаемся на клиенте от простых ошибок и случайных багов.

---

## 5. Кошелёк

### Схема БД (v15)

```sql
CREATE TABLE wallet_balance (
  user_id TEXT PRIMARY KEY,
  coins INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

CREATE TABLE wallet_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL,                -- earn | spend | adjust
  amount INTEGER NOT NULL,           -- всегда positive; знак из kind
  source TEXT NOT NULL,              -- session | admin | refund | promo
  source_session_id INTEGER,         -- nullable; для earn-by-session
  ts INTEGER NOT NULL,
  meta TEXT                          -- JSON: { activity, kcal, paceMinKm, multiplier, capped, reason }
);
CREATE INDEX idx_wallet_tx_user_ts ON wallet_transactions (user_id, ts DESC);
CREATE UNIQUE INDEX idx_wallet_tx_session_unique
  ON wallet_transactions (user_id, source_session_id)
  WHERE source_session_id IS NOT NULL;
```

### Lifecycle транзакции (earn-by-session)

1. `useActivityStore.stop()` → finalizeSession → расчёт `caloriesKcal`.
2. `useWalletStore.awardForSession({ ... })` →
   - `hasTransactionForSession` — short-circuit если уже начислено;
   - `coinsEarnedSince(startOfTodayMs)` — суммируем earn за день для кап-проверки;
   - `decideCoinsForSession` — pure domain decision;
   - если `coins > 0` → atomic `recordTransaction` (INSERT tx + UPDATE balance в transaction);
   - обновляем store, MeScreen / WalletScreen перерисуются.

### Очистка

`useWalletStore.clearAll()` (не трогает БД, только store) вызывается на logout. БД-уровень очищается через `clearAllWallet()` если когда-то понадобится reset.

---

## 6. Точки расхода (заглушки)

В `WalletScreen` есть карточка «Магазин — скоро» как placeholder. На будущее планируем:

- **Косметика:** темы карты, фоны профиля, рамки аватара.
- **Премиум-функции:** advanced analytics (TSS не из base, race predictor), экспорт в FIT.
- **Челленджи:** входные взносы в платные челленджи с призовым пулом монет.
- **Refund / promo:** механизм возврата (admin-only) для test-кейсов.

Все будущие интеракции — через `recordTransaction({ kind: 'spend', source: 'shop', ... })`. Схема не меняется.

---

## 7. Тесты (TODO)

Нужно покрыть в Phase 2:
- `decideCoinsForSession` — pure function, минимум 12 кейсов:
  - happy path (run / trail / walk / cycle)
  - too-short / too-few-kcal
  - pace_too_fast (<2:30 для running)
  - hr_out_of_range
  - daily_cap_exact + daily_cap_exceeded + partial
  - multiplier sanity (run vs trail vs walk)
- `recordTransaction` идемпотентность через `hasTransactionForSession`.

Не сделано в этом раунде — попадёт в Round 2 (P1).

---

## 8. Будущая синхронизация с сервером

Сейчас wallet полностью локальный. Когда поднимем `currency` микросервис на backend:

- Источник истины — server: `users.wallet_balance`.
- SQLite кэширует.
- Outbox-pattern для earn / spend (см. `sync/syncEngine.ts` как референс).
- Server применяет ту же `decideCoinsForSession` (одна формула в одном месте) + дополнительный fraud detection (HMM по trajectory, etc).
- Расхождение клиент ↔ сервер → server wins, локально перерисовываем баланс.

Это — отдельный backend ADR. Сейчас не делаем.
