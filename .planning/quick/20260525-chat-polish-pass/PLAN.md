---
slug: chat-polish-pass
created: 2026-05-25
type: quick
flags: --discuss --research
status: in-progress
---

# Chat polish pass — TIGHT scope (6 FE-only items)

## Description

User-requested polish across chat list + individual chat screens. **NO backend
changes** — pure mobile UI/UX improvements. Deferred items (stories revival,
friend-request flow, typing indicator with backend pubsub, swipe-to-delete with
DELETE endpoint) require proper phase planning per ADR-0011 lean scope; see
CONTEXT.md §"Out of scope".

## Items

| # | Item | File(s) | Est | Status |
|---|---|---|---|---|
| 1 | Scroll-to-bottom FAB on ChatScreen (appears when scrolled >5 messages up) | `src/ui/social/ChatScreen.tsx` + `src/navigation/screens/chats/ChatScreen.tsx` | 1-2h | pending |
| 2 | Skeleton loading state on first fetch (ChatScreen + ChatsListScreen) | both screens + new `src/design/components/Skeleton.tsx` | 1h | pending |
| 3 | Improved empty state on ChatScreen ("Это начало вашего чата" + peer avatar) | `src/navigation/screens/chats/ChatScreen.tsx` | 30min | pending |
| 4 | Better timestamp formatting (today / Вчера / Пн / 10.05) — extract reusable helper | `src/util/timeFormat.ts` (new) + ChatsListScreen ChatRow | 30min | pending |
| 5 | Deterministic avatar gradients (initials + HSL gradient when no photo) | `src/design/components/Avatar.tsx` extend | 1-2h | pending |
| 6 | Aggregate unread badge on bottom "Chats" tab | `src/design/components/TabBar.tsx` + `src/navigation/AppTabs.tsx` | 1h | pending |

**Total est:** 5-8h | **Files touched:** ~6 | **New components:** 2 (Skeleton, timeFormat helper) | **Tests:** added for timeFormat + avatar initials hash (deterministic logic worth unit-testing)

## Acceptance criteria

- All 6 items implemented as separate atomic commits
- tsc clean
- jest still passes (638/638 → 638+ with new tests for items 4-5)
- No backend changes anywhere
- No regressions in existing chat flow (manual smoke: open chat list, open chat, send message, scroll up, scroll back, switch tabs)
- ChatScreen renders correctly with 0 messages, 1 message, 50+ messages
- TabBar badge visible when total unread > 0 across chats, hidden when 0

## Out of scope (deferred to proper phases)

See CONTEXT.md §"Out of scope" for full reasoning. Backlog items captured in
ROADMAP.md v1.0.1 backlog.

- Stories revival (Phase 8/C closeout undid; reviving = re-implementation, /gsd-mvp-phase candidate)
- Friend-request inbox + accept/reject flow (currently only follow model exists; backend + UI work)
- Typing indicator (backend pubsub event)
- Swipe-to-delete chat row (backend DELETE endpoint)
- Message search within chat
- Voice messages
- Message forwarding
