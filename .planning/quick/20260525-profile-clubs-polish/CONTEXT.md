---
slug: profile-clubs-polish
type: quick-context
---

# Research findings (Explore agent, --research flag)

## Codebase patterns observed

- **SQLite migrations**: inline in `storage/database.ts` as numbered blocks
  `if (current < N)` bumping `PRAGMA user_version`. Current head = v19. We add
  v20.
- **Module structure** (canonical: `src/modules/friends/`):
  - `domain/` — types + errors (pure)
  - `sync/` — backend API client + DTO↔domain mapping
  - `state/` — zustand store with optimistic UI
  - `ui/` — screens/components
  - We follow same shape for `src/modules/clubs/` minus `sync/` (no backend).
- **Repository pattern**: pure I/O in `storage/*Repository.ts`; business
  logic in `domain/`. Mirror this for `clubsRepository.ts`.
- **Auth wipe**: `state/auth.ts:241` `logout()` already calls `clearAll()`
  on moderation, xp, wallet stores. We extend with `useClubsStore.clearAll()`.
- **Design tokens**: `design/tokens.ts` via `useTheme()` returning `Tokens`.
  Card, Icon, ActionRow, Avatar, Chip available in `design/components/`.
  ActionRow is defined inline in `MeScreen.tsx` (not a shared component).
- **i18n**: NONE. Russian text is hardcoded throughout. Mirror that.
- **User identity**: `useAuthStore((s) => s.user).id` — synchronous,
  available after hydrate.

## Existing stubs — what was there

| File | Lines | What it was |
|---|---|---|
| ClubsScreen.tsx | 126 | Info banner «Скоро», hardcoded SAMPLE_CLUBS list, «Создать клуб» button `disabled={true}`. Comment says "Real implementation in Phase M11+". |
| ClubScreen.tsx | 67 | «Скоро» card, only renders clubId param. |
| CreateClubScreen.tsx | 60 | «В разработке» card, no form. |
| ShopScreen.tsx | 220 | Cosmetic-items catalog with all buttons disabled showing «Скоро». Comment says "Full impl needs backend currency-service". |

## Gray areas resolved upfront

- **Q: Clubs members — local-only is fake. Backend?** → Solo dev, closed-beta,
  no clubs backend exists. Local-first with friend-picker is honest: owner
  curates their own club, data ready to sync when backend lands.
  Backlog item captured.
- **Q: Should clubs auto-create a chat group?** → No. Group-chat create
  endpoint not implemented (only schema exists). Defer to `CLUBS-CHAT-GROUP-LINK`.
- **Q: Account delete — server-side?** → No backend GDPR-delete endpoint
  exists. Ship local wipe (drop tables, clear MMKV, logout). Mark backlog.
- **Q: Shop — implement one real item or remove?** → Remove. Catalog requires
  backend (per ShopScreen.tsx top comment). Currency still earns; no spend
  venue yet. Cleaner than keeping a disabled catalog.
- **Q: Workouts/Sensors — keep with empty screens?** → Remove. Journal tab
  already shows sessions ("workouts"). Sensors are a v1.1 feature (BLE pairing).
  Removing keeps the cabinet honest.

## Out of scope (captured in PLAN.md backlog)

- Clubs backend microservice
- Clubs discovery / public search
- Clubs ↔ group-chat linking
- Shop catalog with backend currency-service
- Server-side account deletion (GDPR)
