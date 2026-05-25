---
slug: chat-polish-pass
created: 2026-05-25
type: quick
---

# Context: chat polish pass

## Origin

User request 2026-05-25: «мне нужно чтобы все довел до идеала, особенно чаты и
чат, чтобы там были сторисы, отправка заявки в друзья, и так далее по дизайну
до идеализаций этой части проект»

Translation: "Bring everything to perfection, especially the chats list and
individual chat, so there are stories, friend-request sending, and so on by
design — idealize this part of the project."

Triggered by user iterating on first debug-APK installs (run 26374799585 wave)
and noticing UI polish gaps after a long APK pipeline debug session.

## Discussion phase decisions

After surveying current state (Phase 8/A-B-D-K shipped, Phase 8/C
stories-deprecated, no friend-request flow), three scope options were presented
to user:

1. **TIGHT** (FE-only chat polish, ~5-8h, 6 commits)
2. **MID** (add typing indicator + swipe-delete with backend changes, +4-6h)
3. **FULL** (revive stories + add friend requests = /gsd-mvp-phase × 2, 1-2 weeks)

User chose **TIGHT** ("Go tight"). Decisions captured:

- **D-01**: No backend changes in this quick task. Anything requiring identity/
  messaging/notifications/social-graph code stays deferred. This keeps the
  task atomic-revertable and avoids dragging in ADR-0006/0012/0010 review.
- **D-02**: No new mobile module under `src/modules/`. The chat code currently
  lives in `src/state/social/`, `src/storage/`, `src/domain/`, `src/ui/social/`
  — NOT under the `src/modules/{name}/{domain,storage,state,sync,ui}/`
  pattern used by moderation/stories/feed. Migrating to that pattern would be
  a separate refactor (1-2 days; tracked as v1.0.1 `CHAT-MODULE-MIGRATION`).
  Polish items extend in place.
- **D-03**: Reusable helpers go in shared design/util locations:
  - `src/util/timeFormat.ts` (new) — used by ChatsListScreen ChatRow and any
    future consumer (Journal screen also has its own date format; defer
    consolidation to v1.0.1).
  - `src/design/components/Skeleton.tsx` (new) — generic skeleton for any
    list/screen first-load state. Will be reused by Journal/Profile later.
  - Avatar gradient extends existing `src/design/components/Avatar.tsx`
    (don't fork; keep one Avatar component).
- **D-04**: Tests added only for **pure logic** (timeFormat helper, avatar
  initials hash) — not for visual rendering. The existing 638-test baseline
  doesn't snapshot Avatar/ChatScreen UI; we keep that convention. Visual
  validation = manual smoke + APK install.
- **D-05**: --research flag interpreted but skipped — survey gave enough info
  for tactical UI items. Standard React Native patterns (FlatList scrollTo,
  LinearGradient via expo-linear-gradient) are well-documented; no library
  research needed.

## Out of scope

The user's ambition statement mentioned 4 items beyond chat polish. Reasoning
why each is parked:

### Stories revival

Stories module was **explicitly deprecated** during Phase 8/C closeout (per
STATUS.md). Database tables (`stories`, `story_views`) remain in SQLite v11
for rollback safety; backend `feed` service still runs on port 8085. But the
mobile UI module (`src/modules/stories/`) was removed.

Reviving = re-implement: story viewer, story creation (camera + upload), ring
badge on chat avatars, progress bar, reply input, story-reactions store, sync
loop, cleanup-cron client. Realistically 2-4 days of focused work + design
decisions about retention/visibility model. Goes to **v1.0.1 backlog as
`STORIES-REVIVAL`** with note: was deliberately removed per Phase 8/C
closeout; revival is a feature add, not bug-fix.

### Friend-request flow

Current model: **follow** (asymmetric, no acceptance). User A follows User B;
B sees A in followers list but doesn't accept. Permission matrix gates DMs via
`canDm` flag (Phase 8/K).

User asked for "отправка заявки в друзья" — implies **symmetric friend-request
with acceptance** (different from follow). Implementing:

- Backend: new `social-graph` endpoints (POST `/friend-requests/{userId}`,
  GET `/friend-requests/incoming`, POST `/friend-requests/{id}/accept`,
  POST `/friend-requests/{id}/reject`)
- Schema: new `friend_requests` table (sender_id, receiver_id, status, ts)
  + migration
- Mobile: new `src/state/social/useFriendRequestsStore.ts`, `FriendRequestInboxScreen`,
  badge on Me tab, accept/reject UI, notification on incoming request
- Existing follow model: decide co-exist or replace. Recommend co-exist
  (follow = passive, friend = mutual+gated for richer features).

~1-2 days. Goes to **v1.0.1 backlog as `FRIEND-REQUEST-FLOW`**.

### Typing indicator

Needs backend realtime pubsub event (`typing.started` / `typing.stopped` on
conversation channel) + mobile listener in `useRealtimeStore` + UI ghost
bubble on ChatScreen. ~3h, but touches `messaging` service. Goes to **v1.0.1
backlog as `CHAT-TYPING-INDICATOR`**.

### Swipe-to-delete

Needs backend `DELETE /conversations/{id}` endpoint (soft-delete, mark
`deleted_at`) + mobile Swipeable wrapper + animated removal. ~3h. Goes to
**v1.0.1 backlog as `CHAT-SWIPE-DELETE`**.

## Files touched (planned)

```
src/util/timeFormat.ts                                    (new)
src/util/__tests__/timeFormat.test.ts                     (new)
src/design/components/Skeleton.tsx                        (new)
src/design/components/Avatar.tsx                          (extend: initials+gradient)
src/design/components/__tests__/Avatar.initials.test.ts   (new)
src/design/components/TabBar.tsx                          (extend: badges prop)
src/design/index.ts                                       (export Skeleton + helpers)
src/navigation/AppTabs.tsx                                (compute totalUnread; pass to TabBar)
src/navigation/screens/chats/ChatsListScreen.tsx          (skeleton + use new timeFormat)
src/navigation/screens/chats/ChatScreen.tsx               (FAB + skeleton + empty state)
```

**Out**: no backend Go files, no go.mod, no .github/workflows changes, no
`.planning/STATE.md` edit during execution (only at SUMMARY time).

## Atomic commit plan

7 commits expected:

1. `docs(quick/chat-polish): PLAN + CONTEXT for chat-polish-pass`
2. `feat(util): timeFormat helper + tests`
3. `feat(design): Skeleton component`
4. `feat(design): Avatar initials + deterministic gradient fallback + tests`
5. `feat(design): TabBar badges prop + AppTabs aggregate unread`
6. `feat(chats): apply Skeleton + new timeFormat to ChatsListScreen`
7. `feat(chats): scroll-to-bottom FAB + skeleton + empty state on ChatScreen`
8. `docs(quick/chat-polish): SUMMARY + STATE.md table update`

(8 commits total, listed 7 in body — recount.)
