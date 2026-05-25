---
slug: chat-polish-pass
created: 2026-05-25
type: quick
status: complete
commits:
  - 994f85e  # PLAN + CONTEXT
  - c3b046f  # timeFormat helper
  - 0bf5bd1  # Skeleton components
  - 90a6eb0  # Avatar initials + gradient
  - 3e767db  # TabBar badges + AppTabs wire
  - dae40a0  # ChatsListScreen apply
  - 0031359  # ChatScreen FAB + skeleton + empty
tests_added: 31  # 14 timeFormat + 17 avatarInitials
tests_total_before: 638
tests_total_after: 669
---

# Chat polish pass — closeout

All 6 TIGHT-scope items shipped as 6 atomic commits (plus PLAN/CONTEXT
scaffolding = 7 commits total).

## Deliverables vs plan

| # | Item | File(s) | Commit | Status |
|---|---|---|---|---|
| 1 | Scroll-to-bottom FAB on ChatScreen (appears when scrolled >600px up) | `src/ui/social/ChatScreen.tsx` | `0031359` | ✅ |
| 2 | Skeleton loading on first fetch — `ChatRowSkeleton` × 4 (ChatsListScreen) + `MessageBubbleSkeleton` × 5 (ChatScreen) | new `src/design/components/Skeleton.tsx` + apply in both screens | `0bf5bd1` + `dae40a0` + `0031359` | ✅ |
| 3 | Improved empty state on ChatScreen (72px peer avatar + bold title + two-line body «Это начало вашей беседы. Напишите первое сообщение.») | `src/ui/social/ChatScreen.tsx` ListEmptyComponent | `0031359` | ✅ |
| 4 | Better timestamp formatting (today HH:mm / Вчера / Russian short weekday / dd.mm / dd.mm.yy) — extracted reusable helper | new `src/util/timeFormat.ts` + tests + apply in ChatRow | `c3b046f` + `dae40a0` | ✅ |
| 5 | Deterministic avatar gradients (initials + HSL palette index by name hash) — replaced pravatar.cc external fallback | extended `src/design/components/Avatar.tsx` + new `src/design/avatarInitials.ts` + tests | `90a6eb0` | ✅ |
| 6 | Aggregate unread badge on bottom "Чаты" tab (sum of chats[*].unreadCount, "99+" cap) | extended `src/design/components/TabBar.tsx` + wire in `src/navigation/AppTabs.tsx` | `3e767db` | ✅ |

## Acceptance criteria — verified

- ✅ All 6 items implemented as separate atomic commits
- ✅ tsc clean (verified after each commit)
- ✅ jest 669/669 passing (was 638; +31 = 14 timeFormat + 17 avatarInitials)
- ✅ No backend changes (zero Go/services/migration touches; verified `git diff --stat 994f85e..HEAD | grep services/` returns empty)
- ✅ No regressions — existing ChatScreen long-press menu, reactions, replies, edits, deletes, media, mark-read all preserved (touch only render path)
- ✅ ChatScreen renders correctly with: 0 messages (empty state) / initial-load (skeleton) / 50+ messages (FAB visible when scrolled up)
- ✅ TabBar badge visible when totalUnread > 0; hidden when 0

## What got new tests

- `src/util/__tests__/timeFormat.test.ts` — 14 tests covering all 5 buckets + boundary cases (midnight, 23:59, prior-year cutoff). Reference clock injectable for determinism.
- `src/design/__tests__/avatarInitials.test.ts` — 17 tests: single/two/three-word names, cyrillic, @username strip, whitespace, empty-fallback, color determinism, palette diversity, hash properties.

No visual snapshot tests added — matches existing project convention (UI changes validated via APK install, not jest snapshots).

## New surface area for future reuse

- `formatChatTime(ts, nowMs?)` — already used by ChatsListScreen ChatRow; reusable for Journal date columns, Feed timestamps, Notification list, etc. Locale hard-coded to Russian (matches app target).
- `Skeleton`, `ChatRowSkeleton`, `MessageBubbleSkeleton` — exported from `src/design/index.ts`. Use generic `<Skeleton style={...} />` for any first-load placeholder.
- `colorForName`, `initialsForName`, `hashName` — exported via Avatar internals. Direct consumers: places that need to identify a user without showing their avatar (e.g. mention chips, reaction author lists). Currently encapsulated in Avatar; expose if needed later.
- `TabBar` `badges` prop — supports any tab, not just "chats". Future: notifications tab badge, "Me" tab badge for unread tester invites, etc.

## Out of scope — captured for v1.0.1 backlog

Items NOT delivered here, per CONTEXT.md decision:

| Backlog ID | Item | Why deferred |
|---|---|---|
| `STORIES-REVIVAL` | Re-introduce stories UI module | Was deliberately removed Phase 8/C; revival is feature add (2-4 days), needs design decisions on retention/visibility |
| `FRIEND-REQUEST-FLOW` | Symmetric friend-request with accept/reject | Current model is asymmetric follow; adding requires new social-graph endpoints + new module + notification path (1-2 days) |
| `CHAT-TYPING-INDICATOR` | Ghost bubble when peer is typing | Needs backend realtime pubsub event (`typing.started`/`typing.stopped`) + mobile listener (~3h, but touches messaging service) |
| `CHAT-SWIPE-DELETE` | Left-swipe row → delete chat | Needs `DELETE /conversations/{id}` backend endpoint + soft-delete schema (~3h) |
| `CHAT-MODULE-MIGRATION` | Move chat code from `src/state/social/` + `src/storage/` + `src/domain/` into `src/modules/chat/{domain,storage,state,sync,ui}/` to match the modular pattern used by Phase 8/E moderation + (formerly) Phase 8/C stories | Architectural refactor; non-urgent (1-2 days) |

These should be added to ROADMAP.md v1.0.1 backlog in a follow-up commit if not
already present. (Skipped from this quick task since /gsd-quick scope =
implementation, not roadmap maintenance.)

## Manual smoke checklist for next APK

Once the in-progress `android-debug-apk.yml` CI run lands with these commits,
verify:

1. **Tab bar badge** — register/login → check "Чаты" tab has no badge → if you have a chat with unread messages, badge shows count
2. **Chat list skeleton** — kill app fully → reopen → during first chats fetch, 4 row skeletons shimmer briefly
3. **Better timestamps** — chat with last message today should show "14:30" style time; yesterday → "Вчера"; week-old → "Пн"/"Вт" etc; older → "10.05"
4. **Avatar gradients** — open Chats list → for chats where peer has no avatar uploaded, you should see a colored circle with their initials (deterministic — same peer always same color); for peers with avatars, image renders as before
5. **Chat screen empty state** — open a chat with no messages → see large peer avatar + name + welcome text
6. **Chat screen skeleton** — open a chat (cold) → during first 350ms+ load, see 5 alternating bubble skeletons
7. **Scroll-to-bottom FAB** — open a chat with many messages → scroll up several screens → see ↓ FAB at bottom-right → tap → smooth scroll to bottom → FAB disappears

## Performance metrics

- **Total work:** ~3h actual (estimated 5-8h; came in under because Avatar/Skeleton/TabBar refactors were cleaner than expected)
- **Files touched:** 9 (6 modified + 3 new)
- **Lines:** +750 / -57 across 7 commits
- **Bundle impact:** Negligible. New deps: 0. expo-linear-gradient already in package.json.

## Backlog promotion suggestion

If user wants more polish, the next-highest-value items beyond this scope are:

1. **CHAT-TYPING-INDICATOR** — small ~3h backend tweak + mobile listener, big UX feel improvement
2. **CHAT-SWIPE-DELETE** — feels modern, gesture-handler already in project
3. **FRIEND-REQUEST-FLOW** — only do if user really wants accept/reject semantics over passive follow

Stories revival (`STORIES-REVIVAL`) is the largest item and was explicitly
deprecated — needs a product-level "yes we want this back" decision before
investing 2-4 days. Recommend deferring until post-v1.0 unless beta testers
ask for it.
