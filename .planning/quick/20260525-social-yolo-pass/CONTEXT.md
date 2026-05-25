---
slug: social-yolo-pass
created: 2026-05-25
type: quick-XL
yolo: true
---

# Context: social yolo pass

## Origin

User request 2026-05-25: «теперь доведи до идеала чаты, чтобы ты мог
человеку писать ты должен отправить ему заявку в друзья а если примет
заявку то только тогда можешь ему писать, а также пороботай над ui чтобы
выглядело макисмально близко к текуюещему дизайну работало просто и быстро
и удобно все было, по ui чтобы было как в телеграмме а дизайн наш, а также
чтобы были сторисы также были»

Translation: "Now bring chats to perfection. To write to someone you must
send a friend request; only when they accept can you write. Also work on
UI to look maximally close to current design, simple/fast/convenient, like
Telegram but our design. Also stories should exist."

Third polish-pass request today (2026-05-25). Previous two:
- chat-polish-pass (994f85e..e9b42ce, 6 UI items, ~3h actual)
- tracker-live-polish-pass (bc95c30..df1d9da, 7 items + tests, ~2.5h actual)

Both prior tasks: user said "Go tight", I scoped down, executed cleanly.

## Discussion phase decisions

Survey identified that this request includes 3 distinct asks:
1. FRIEND-REQUEST-FLOW — full backend + mobile feature
2. STORIES-REVIVAL — full mobile module rebuild (backend exists)
3. Chat UI Telegram-like polish — additional UX work

I proposed 3 paths:
- A) TIGHT /gsd-quick: only UI polish (defer friend-request + stories)
- B) Escalate to 2 /gsd-mvp-phase tasks + 1 /gsd-quick
- C) Yolo — all in one /gsd-quick (NOT RECOMMENDED)

User chose **Option C "Yolo"**.

Captured decisions:
- **D-01**: Break /gsd-quick convention intentionally. PLAN.md flags this
  with `scope-warning` + `yolo: true` frontmatter so future readers know.
- **D-02**: ADR-0011 Amendment 6 must accompany the scaffolding commit.
  Without it, scope expansion is undocumented (silent v1.0 scope creep).
- **D-03**: Multi-session execution expected. Each session aims for ~6-10
  commits. SUMMARY.md not written until all parts shipped. Status updates
  in CONTEXT.md progress log instead.
- **D-04**: Friend-request gate semantics:
  - "Are friends" = exists accepted `friend_requests` row in either direction
  - DM gate: send-message OR create-conversation requires are_friends check
  - canDm column on relations: kept as a denormalized cache, updated via
    trigger when friend_requests.status flips
  - Block model unchanged (separate concern)
- **D-05**: Story retention = 24h (Telegram parity). Backend `feed` service
  already implements this; mobile just respects expiry on read.
- **D-06**: Mobile module pattern: NEW modules (friends, stories) use the
  proper `src/modules/<name>/{domain,storage,state,sync,ui}/index.ts`
  structure (matches Phase 8/E moderation). Old chat code at root paths
  stays where it is for this task; `CHAT-MODULE-MIGRATION` remains v1.0.1
  backlog.
- **D-07**: New mobile SQLite migrations: v13 (friends) + v14 (stories
  cache). Schema bumps need testing — keep migrations forward-only (no
  v13→v12 rollback).
- **D-08**: ADR-0011 Amendment 6 promotes Phase 10 + Phase 11 from v1.0.1
  backlog → active v1.0 scope. ROADMAP.md gets new rows. STATE.md frontmatter
  total_phases: 4 → 6 (Phases 6,7,8,9,10,11).
- **D-09**: Re-numbering: NEW migration is `0022_friend_requests`. NEW
  SQLite mobile versions: v13 + v14.

## Progress log (multi-session)

### Session 1 (2026-05-25 PM)

- [ ] Scaffolding (PLAN + CONTEXT + Amendment 6)
- [ ] Backend friend-requests migration
- [ ] Backend social-graph endpoints
- [ ] Backend messaging gate
- [ ] Mobile friends module shells
- [ ] Status report

### Session 2 (TBD)

- [ ] Mobile friends UI
- [ ] Stories module shells
- [ ] Status report

### Session 3 (TBD)

- [ ] Stories UI
- [ ] Chat polish
- [ ] SUMMARY + closeout

## Architectural notes

### Friend-request schema

```sql
CREATE TABLE friend_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('pending','accepted','rejected','cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at TIMESTAMPTZ,
  CONSTRAINT friend_requests_no_self CHECK (sender_id <> receiver_id),
  CONSTRAINT friend_requests_unique_pair UNIQUE (sender_id, receiver_id)
);

CREATE INDEX friend_requests_receiver_pending ON friend_requests (receiver_id) WHERE status = 'pending';
CREATE INDEX friend_requests_sender_pending ON friend_requests (sender_id) WHERE status = 'pending';
```

### are_friends() function

```sql
CREATE OR REPLACE FUNCTION are_friends(u1 UUID, u2 UUID) RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM friend_requests
    WHERE status = 'accepted'
      AND (
        (sender_id = u1 AND receiver_id = u2) OR
        (sender_id = u2 AND receiver_id = u1)
      )
  );
$$ LANGUAGE SQL STABLE;
```

### canDm derivation

Friend-request acceptance updates `relations.can_dm` via trigger to keep
the existing canDm read path consistent (less code churn). Future cleanup:
remove canDm column entirely once messaging service uses are_friends()
directly.

### Mobile friends module structure

```
apps/mobile-rn/src/modules/friends/
├── domain/
│   ├── index.ts          # re-exports
│   └── types.ts          # FriendRequest, Friend, FriendRequestStatus
├── storage/
│   ├── index.ts
│   ├── friendsRepository.ts    # SQLite friends cache
│   └── friendRequestsRepository.ts
├── state/
│   ├── index.ts
│   ├── useFriendsStore.ts
│   └── useFriendRequestsStore.ts
├── sync/
│   ├── index.ts
│   └── friendsSync.ts    # foreground refresh + push handler
└── ui/
    ├── index.ts
    ├── FriendRequestsInboxScreen.tsx
    └── FriendActionButton.tsx   # the send/cancel/accept button used on profile
```

### Mobile stories module structure

```
apps/mobile-rn/src/modules/stories/   # rebuild from scratch (was deprecated)
├── domain/
│   ├── index.ts
│   └── types.ts          # Story, StoryView, StoryReply
├── storage/
│   ├── index.ts
│   └── storiesRepository.ts
├── state/
│   ├── index.ts
│   └── useStoriesStore.ts
├── sync/
│   ├── index.ts
│   └── storiesSync.ts
└── ui/
    ├── index.ts
    ├── StoryTrayHeader.tsx
    ├── StoryViewerScreen.tsx
    ├── StoryCreatorScreen.tsx
    └── StoryRingAvatar.tsx    # avatar wrapper with ring when unviewed
```

## Files touched (estimated total)

Backend:
- `services/backend/migrations/0022_friend_requests.up.sql` (NEW)
- `services/backend/migrations/0022_friend_requests.down.sql` (NEW)
- `services/backend/social-graph/internal/handler/friend_requests.go` (NEW)
- `services/backend/social-graph/internal/handler/http.go` (route additions)
- `services/backend/social-graph/internal/repo/friend_requests_repo.go` (NEW)
- `services/backend/social-graph/internal/service/friend_service.go` (NEW)
- `services/backend/messaging/internal/handler/http.go` (gate additions)
- `services/backend/messaging/internal/permissions/friendship_gate.go` (NEW)

Mobile (~25 new files in `src/modules/friends/` + `src/modules/stories/`):
- friends module (10 files + tests)
- stories module (12 files + tests)
- ForeignProfileScreen modifications
- ChatsListScreen create-DM error toast
- MeStack inbox route
- TabBar friend-request count badge (extension of existing tab badge mech)
- SQLite migrations v13 + v14

Docs:
- `docs/DECISIONS/0011-scope-reset-to-closed-beta-lean.md` (Amendment 6)
- `.planning/ROADMAP.md` (new Phase 10 + Phase 11 entries)
- `.planning/STATE.md` (total_phases 4→6)

Total estimated: ~50-70 files modified/added across multiple commits.

## Re-expansion vs revival

This task PROMOTES (not creates new) the following v1.0.1 backlog items
into active v1.0 scope via ADR-0011 Amendment 6:

- STORIES-REVIVAL → Phase 11
- FRIEND-REQUEST-FLOW → Phase 10

Both were in v1.0.1 backlog at commit `e9b42ce` (chat-polish-pass closeout).
Per Amendment 6 they move to active v1.0 effective 2026-05-25.

Remaining v1.0.1 chat-related items NOT promoted (stay in backlog):
- CHAT-TYPING-INDICATOR
- CHAT-SWIPE-DELETE
- CHAT-MODULE-MIGRATION
