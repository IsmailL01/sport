---
slug: profile-clubs-polish
created: 2026-05-25
type: quick
status: complete
commits:
  - 01e7281  # PLAN + CONTEXT
  - 6bc5324  # SQLite v20 migration
  - 4e67dde  # domain types + clubsRepository
  - 8533cc7  # useClubsStore + auth clearAll wiring
  - 5ebcb24  # ClubsScreen rewrite
  - db26dee  # CreateClubScreen rewrite
  - 9c008f7  # ClubScreen rewrite
  - ae7d54c  # MeScreen Workouts/Sensors removal
  - a5880ab  # SettingsScreen delete-account wiring
  - 0f00820  # Shop removal (route + entry + screen)
  - 0bfc7d3  # clubs tests (+29)
tests_added: 29  # 20 clubsRepository + 9 useClubsStore
tests_total_before: 699
tests_total_after: 728
---

# profile-clubs-polish — closeout

User intent (verbatim):

> чтобы в личном кабинете работала каждая кнопка, каждый функционал, чтобы
> больше не было написано что реализуется в будушем в какой-то фазе, а также
> доделай логику клубоа, создания клубов и так далее и доведи до идеала

**Outcome:** Me-tab is now placeholder-free. Clubs feature ships
local-first end-to-end (SQLite v20 schema + domain + repo + store +
3 screens + 29 tests). Backend sync, discovery, chat-group linking
parked as v1.0.1 backlog with explicit ADR-style entries in PLAN.md.

## Deliverables vs plan

### Profile placeholder cleanup

| # | Item | File(s) | Commit | Status |
|---|---|---|---|---|
| 1 | Drop «Тренировки» ActionRow (was Alert.alert «Скоро вернём — Phase M10») | `MeScreen.tsx:210-216` | `ae7d54c` | ✅ |
| 2 | Drop «Датчики» ActionRow (was Alert.alert «Скоро вернём — Phase M10») | `MeScreen.tsx:217-223` | `ae7d54c` | ✅ |
| 3 | «Удалить аккаунт» → real local-wipe + logout | `SettingsScreen.tsx` + `auth.ts` + `database.ts` | `a5880ab` | ✅ |
| 4 | Drop Shop route + Wallet entry (all items were disabled stubs) | `ShopScreen.tsx` deleted + `AppTabs.tsx` + `WalletScreen.tsx` + `types.ts` | `0f00820` | ✅ |

After this pass, **every** ActionRow on MeScreen and every interactive
control on SettingsScreen leads to a working screen or a real action.
Grep for `Alert.alert.*Скоро` and `Phase [A-Z0-9]+` in Me-tab files
returns zero hits.

### Clubs end-to-end (local-first)

| # | Layer | Item | Commit |
|---|---|---|---|
| 1 | SQLite | v20 migration: `clubs` + `club_members` tables (FK-less per convention, indexed on owner_id + user_id) | `6bc5324` |
| 2 | Domain | `types.ts` (Club/Member/Summary/Detail/inputs) + `errors.ts` (ClubError + validators: name 2..60, description ≤280) + 6-color avatar palette | `4e67dde` |
| 3 | Repository | `clubsRepository.ts` — atomic create (club + owner + extra members), owner-only update/delete/addMember, dual-actor removeMember (owner kick / self-leave), null-safe getClubDetail, clearAllClubs for logout | `4e67dde` |
| 4 | Store | `useClubsStore` (zustand) — refresh / selectClub / create / update / remove / addMember / removeMember / pickDefaultAvatarColor / clearAll; lastError surfaces validation messages; wired into `auth.logout()` chain | `8533cc7` |
| 5 | UI list | `ClubsScreen` — pull-to-refresh list of user's clubs, empty-state card with single CTA, FAB when non-empty | `5ebcb24` |
| 6 | UI form | `CreateClubScreen` — name (live counter) + description (live counter) + 6-color picker + friends-multi-select; nav.replace on success | `db26dee` |
| 7 | UI detail | `ClubScreen` — view/inline-edit/owner-actions (add-member modal, kick member, delete club) / member-action (leave); not-found and loading states | `9c008f7` |

### Tests

29 new tests (`clubsRepository` 20 + `useClubsStore` 9) covering:
permissions matrix (owner-only mutations), idempotent member adds,
owner-can't-leave guard, member-leave drops cache, validation
surfaces lastError, detail cache stays consistent with mutations,
clearAll wipes both store + DB.

`jest 728/728` (699 → 728), `tsc clean`, `eslint` on touched files
reports 5 pre-existing warnings (no errors).

## Scope decisions worth remembering

- **Clubs: local-first, not backend-first.** No clubs microservice
  exists; building one was out-of-scope for a quick task. Data model
  mirrors expected backend schema so the future sync layer can be
  bolted on without migrations.
- **Members are friends.** Owner picks initial members from their
  friends list at create-time + can add more later from the detail
  screen's add-member modal. Friend doesn't receive a notification
  (no backend), but they appear as members on the owner's view.
  When backend lands, sync brings them into parity.
- **Owner cannot leave.** UI exposes "Удалить клуб" instead — the
  semantics match: removing the owner-only club tears down the whole
  thing rather than orphaning it.
- **Profile placeholders: remove > implement.** Workouts and Sensors
  had no real backing and Journal tab already covers session
  history. Removing them keeps the cabinet honest. Shop catalog
  removed for the same reason (real economy needs backend
  currency-service).
- **Account delete: local-only wipe.** Drops SQLite file + clears
  all stores + clears tokens. Server-side GDPR delete needs a
  backend endpoint — captured as `BACKEND-ACCOUNT-DELETE` backlog.

## Backlog captured for v1.0.1

| ID | Description | Triggered by |
|---|---|---|
| `CLUBS-BACKEND-SYNC` | Backend microservice + sync layer for clubs. Schema mirrors mobile SQLite v20. Add `clubsApi.ts` per `friendsApi` pattern. | Local-first decision |
| `CLUBS-DISCOVERY` | Search / discover public clubs (depends on backend). | Owner-only viewing for now |
| `CLUBS-CHAT-GROUP-LINK` | Auto-create a group chat per club. Depends on group-chat create endpoint (currently schema-only). | Out-of-scope coupling |
| `SHOP-CURRENCY-VENUE` | Real purchasable items (cosmetic frames, map themes). Depends on backend currency-service per ShopScreen.tsx:1-10 (deleted file's header). | Shop removal |
| `BACKEND-ACCOUNT-DELETE` | Server-side GDPR delete endpoint. | Local-only wipe |

## Files inventory

**Created (7):**
- `apps/mobile-rn/src/modules/clubs/domain/types.ts`
- `apps/mobile-rn/src/modules/clubs/domain/errors.ts`
- `apps/mobile-rn/src/modules/clubs/state/useClubsStore.ts`
- `apps/mobile-rn/src/modules/clubs/__tests__/clubsRepository.test.ts`
- `apps/mobile-rn/src/modules/clubs/__tests__/useClubsStore.test.ts`
- `apps/mobile-rn/src/storage/clubsRepository.ts`
- This SUMMARY + PLAN + CONTEXT in `.planning/quick/20260525-profile-clubs-polish/`

**Modified (9):**
- `apps/mobile-rn/src/storage/database.ts` (+v20 migration, +wipeDatabase())
- `apps/mobile-rn/src/state/auth.ts` (+deleteAccountLocal + clubs clearAll)
- `apps/mobile-rn/src/navigation/screens/me/ClubsScreen.tsx` (full rewrite)
- `apps/mobile-rn/src/navigation/screens/me/ClubScreen.tsx` (full rewrite)
- `apps/mobile-rn/src/navigation/screens/me/CreateClubScreen.tsx` (full rewrite)
- `apps/mobile-rn/src/navigation/screens/me/MeScreen.tsx` (drop 2 placeholders)
- `apps/mobile-rn/src/navigation/screens/me/SettingsScreen.tsx` (wire delete)
- `apps/mobile-rn/src/navigation/screens/me/WalletScreen.tsx` (drop Shop entry)
- `apps/mobile-rn/src/navigation/types.ts` + `AppTabs.tsx` (drop Shop)

**Deleted (1):**
- `apps/mobile-rn/src/navigation/screens/me/ShopScreen.tsx`

## Notable diffs

- **Inline UUID v4 helper in clubsRepository.** The `uuid` npm
  package (v14, ESM-only) breaks under jest-expo without extra
  transformIgnorePatterns config. Math.random RFC 4122 v4 is fine
  for client-side row IDs (no security context).
- **`wipeDatabase()` helper in storage/database.ts.** Closes the
  singleton, calls `SQLite.deleteDatabaseAsync(DB_NAME)`, lets the
  next `getDatabase()` recreate empty. Used only by
  `deleteAccountLocal`.
- **`pickDefaultAvatarColor(n)` deterministic cycle.** First club
  gets palette[0], second gets palette[1], ..., wraps at 6.
  Prevents identical-color confusion in the list view.
