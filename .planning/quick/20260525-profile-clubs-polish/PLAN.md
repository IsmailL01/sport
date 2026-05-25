---
slug: profile-clubs-polish
created: 2026-05-25
type: quick
flags: --research
status: in-progress
---

# Profile placeholders cleanup + Clubs end-to-end (local-first)

## User intent (verbatim)

> чтобы в личном кабинете работала каждая кнопка, каждый функционал, чтобы
> больше не было написано что реализуется в будушем в какой-то фазе, а также
> доделай логику клубоа, создания клубов и так далее и доведи до идеала

Translation: every button on the Me-tab must do something real — no more
«Скоро» / «Phase XX» placeholders. And finish clubs end-to-end.

## Scope decisions

| Area | Decision | Rationale |
|---|---|---|
| Profile placeholders | **Remove** rather than implement | Workouts/Sensors have no real backing; Journal tab already covers history. Keeping the buttons dishonest. |
| ShopScreen | **Remove route + Wallet entry** | All shop items are stubs (cosmetic catalog with disabled buttons). Real economy requires backend currency-service (see ShopScreen.tsx:1-10 comment). Currency continues to accumulate; spending venue parked. |
| Account delete | **Implement local-only wipe** | Drop SQLite tables, clear MMKV, clear in-memory stores, logout. Backend account record remains; user can re-create by signing back in. Honest about scope. |
| Clubs | **Build local-first**, no backend service | No clubs microservice exists. Following `friends` module pattern. Sync layer stub for future v1.0.1 backend. |
| Clubs members | **Owner + friend-picker** for initial members | Friends list already shipped (social-yolo-pass). Owner picks members from their friends. Members are stored as user_ids locally — no friend-side notification (no backend), but data is real and ready to sync. |
| Clubs discovery | **Out of scope** | "Discover public clubs" requires backend. Owner sees their own clubs only. Backlog: `CLUBS-BACKEND-SYNC` for v1.0.1. |

## Files touched (planned)

**Created:**
- `apps/mobile-rn/src/modules/clubs/domain/types.ts`
- `apps/mobile-rn/src/modules/clubs/domain/errors.ts`
- `apps/mobile-rn/src/storage/clubsRepository.ts`
- `apps/mobile-rn/src/modules/clubs/state/useClubsStore.ts`
- `apps/mobile-rn/src/modules/clubs/__tests__/clubsRepository.test.ts`
- `apps/mobile-rn/src/modules/clubs/__tests__/useClubsStore.test.ts`

**Modified:**
- `apps/mobile-rn/src/storage/database.ts` — add v20 migration (clubs + club_members)
- `apps/mobile-rn/src/navigation/screens/me/ClubsScreen.tsx` — rewrite (real list)
- `apps/mobile-rn/src/navigation/screens/me/ClubScreen.tsx` — rewrite (real detail)
- `apps/mobile-rn/src/navigation/screens/me/CreateClubScreen.tsx` — rewrite (real form)
- `apps/mobile-rn/src/navigation/screens/me/MeScreen.tsx` — remove Workouts + Sensors buttons
- `apps/mobile-rn/src/navigation/screens/me/SettingsScreen.tsx` — wire real delete-account flow
- `apps/mobile-rn/src/navigation/screens/me/WalletScreen.tsx` — remove Shop entry pressable
- `apps/mobile-rn/src/navigation/MeStack.tsx` — remove Shop route
- `apps/mobile-rn/src/navigation/types.ts` — drop Shop from MeStackParamList
- `apps/mobile-rn/src/state/auth.ts` — add `deleteAccountLocal` action

**Deleted:**
- `apps/mobile-rn/src/navigation/screens/me/ShopScreen.tsx`

## Atomic-commit plan

| # | Commit subject | Files |
|---|---|---|
| 1 | `docs(quick/profile-clubs-polish): PLAN + CONTEXT` | this dir |
| 2 | `feat(storage): SQLite v20 — clubs + club_members tables` | database.ts |
| 3 | `feat(clubs): domain types + clubsRepository (local CRUD)` | modules/clubs/domain/* + storage/clubsRepository.ts |
| 4 | `feat(clubs): useClubsStore zustand + auth clearAll wiring` | modules/clubs/state/* + state/auth.ts |
| 5 | `feat(clubs): ClubsScreen — real list + empty state` | ClubsScreen.tsx |
| 6 | `feat(clubs): CreateClubScreen — name/desc form + member picker` | CreateClubScreen.tsx |
| 7 | `feat(clubs): ClubScreen — detail with edit/leave/delete` | ClubScreen.tsx |
| 8 | `chore(me): drop Workouts + Sensors placeholder ActionRows` | MeScreen.tsx |
| 9 | `feat(settings): wire 'Удалить аккаунт' to local wipe + logout` | SettingsScreen.tsx + auth.ts |
| 10 | `chore(wallet): drop Shop entry; remove ShopScreen route` | WalletScreen.tsx + MeStack.tsx + types.ts + delete ShopScreen.tsx |
| 11 | `test(clubs): clubsRepository + useClubsStore unit tests` | __tests__/ |
| 12 | `docs(quick/profile-clubs-polish): SUMMARY + STATE update` | SUMMARY.md + STATE.md |

## Data model (SQLite v20)

```sql
CREATE TABLE clubs (
  id TEXT PRIMARY KEY,                  -- UUID v4 (generated mobile-side)
  owner_id TEXT NOT NULL,                -- references auth user
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  avatar_color TEXT NOT NULL DEFAULT '', -- one of theme accent palette
  created_at INTEGER NOT NULL,           -- epoch ms
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_clubs_owner ON clubs (owner_id);

CREATE TABLE club_members (
  club_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL,                    -- 'owner' | 'member'
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (club_id, user_id)
);
CREATE INDEX idx_club_members_user ON club_members (user_id);
```

FK omitted on purpose — matches existing convention in `database.ts` (no FKs
in current schema; soft references via app-level joins).

## Acceptance criteria

1. No `Alert.alert.*Скоро` / `Phase\s+[A-Z0-9]` text reachable from MeScreen.
2. Clubs: user can create, see list, open detail, edit (owner), leave or
   delete (owner), with all data persisting across app restart.
3. SettingsScreen's «Удалить аккаунт» actually wipes local data + logs out.
4. jest green; tsc clean; eslint clean.
5. Phase 10/11 friend-request + stories functionality intact (no regression).

## Backlog captured for v1.0.1

- `CLUBS-BACKEND-SYNC` — backend microservice + sync layer for clubs.
  Schema mirrors mobile SQLite. Add `clubsApi.ts` per `friendsApi` pattern.
- `CLUBS-DISCOVERY` — search/discover public clubs (depends on backend).
- `CLUBS-CHAT-GROUP-LINK` — auto-create a group chat per club (depends on
  group-chat create endpoint, which itself is stubbed).
- `SHOP-CURRENCY-VENUE` — actual purchasable items (cosmetic frames, map
  themes). Depends on backend currency-service per ShopScreen.tsx:1-10.
- `BACKEND-ACCOUNT-DELETE` — server-side account deletion (GDPR). Current
  scope only deletes local data.
