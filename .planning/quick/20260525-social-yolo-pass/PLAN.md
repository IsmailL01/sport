---
slug: social-yolo-pass
created: 2026-05-25
type: quick-XL
flags: --discuss --research
status: in-progress
yolo: true
scope-warning: This task INTENTIONALLY breaks /gsd-quick convention
---

# Social YOLO pass — friend-requests + stories revival + chat UI polish

## Scope warning

User chose "Yolo C" path despite the discussion-phase recommendation to split
this into 2 separate `/gsd-mvp-phase` tasks (FRIEND-REQUEST-FLOW + STORIES-
REVIVAL) plus 1 tight `/gsd-quick` (UI polish).

This task is **3-6 days of work** combined and expands ADR-0011 closed-beta
scope to include friend-requests + stories. ADR-0011 Amendment 6 (added in
the scaffolding commit) formalizes the scope expansion.

The /gsd-quick conventions that are being intentionally broken:
- "small, ad-hoc" — this is a multi-day initiative
- "no backend changes" — this requires new migration + endpoints + service-
  level gating logic
- "single SUMMARY.md at end" — likely multiple session continuations needed
- "atomic single-area" — three independent feature areas in one task

## What we're shipping

### Part 1: FRIEND-REQUEST-FLOW (backend + mobile, ~1-2d)

Replace asymmetric follow-only model with symmetric friend-request gate
on DMs. User must SEND a request → other user ACCEPTS → DM channel opens.

Backend:
- Migration `0022_friend_requests.up.sql` — new table `friend_requests`
  (sender_id, receiver_id, status, created_at, responded_at), unique index
  on (sender, receiver), trigger to keep `relations.can_dm` derived
- `social-graph` service: 6 new endpoints
  - POST `/friend-requests/{receiverId}` — send (creates row, status=pending)
  - GET `/friend-requests/incoming` — list pending where I am receiver
  - GET `/friend-requests/outgoing` — list pending where I am sender
  - POST `/friend-requests/{requestId}/accept` — accept (sets accepted +
    flips relations.can_dm bidirectionally)
  - POST `/friend-requests/{requestId}/reject` — reject (sets rejected)
  - DELETE `/friend-requests/{requestId}` — cancel own pending
  - GET `/friends` — derived friends list
- `messaging` service: gate `POST /conversations` (create DM) AND POST
  `/conversations/{id}/messages` on `are_friends(sender, receiver)` check
  — returns HTTP 403 + `{error: 'requires_friendship'}` if not friends

Mobile:
- New module `src/modules/friends/{domain,storage,state,sync,ui}/index.ts`
  matching Phase 8/E moderation pattern
- Domain types: `FriendRequest`, `Friend`, `FriendRequestStatus`
- Storage: SQLite migration v13 — `friend_requests` cache + `friends` cache
- State: `useFriendsStore` (Zustand) + `useFriendRequestsStore`
- Sync: `friendsSync.ts` (pull on app foreground + after FCM push)
- UI: `FriendRequestsInboxScreen` (incoming + accept/reject buttons) +
  badge on Me tab when incoming > 0
- ForeignProfileScreen: replace "Follow" toggle with "Send friend request"
  → "Request sent" → "Friends" state machine
- ChatsListScreen create-DM flow: 403 from backend → show friendly toast
  "Сначала отправь заявку в друзья"

### Part 2: STORIES-REVIVAL (mobile-only, ~2-4d)

Phase 8/C deprecated mobile stories module but backend (`feed` service on
port 8085) + SQLite tables still exist. Rebuild mobile side from scratch.

Mobile:
- Re-create `src/modules/stories/{domain,storage,state,sync,ui}/index.ts`
  per the original Phase 8/C pattern (git history `20f1859`)
- Domain types: `Story`, `StoryView`, `StoryReply`
- Storage: SQLite v14 — stories cache + story_views local mirror
- State: `useStoriesStore` (zustand) — feed of own + followee stories,
  expiry tracking (24h retention)
- Sync: `storiesSync.ts` — pull on foreground, push on create, mark-viewed
- UI:
  - `StoryTrayHeader` — horizontal scroll of avatars with ring at top of
    ChatsListScreen (or as a top-bar on Журнал if better placement)
  - `StoryViewerScreen` — full-screen modal, swipe-down to dismiss,
    auto-advance with progress bars, swipe-left/right between stories
  - `StoryCreatorScreen` — camera + gallery picker → upload via
    MediaAdapter → publish to backend feed service
  - Avatar ring rendered when peer has unviewed story (subscribe to
    storiesStore.unviewedByUserId selector)

### Part 3: Chat UI Telegram-like polish (~6-8h, FE-only)

- Reactions list popup (tap reaction count → bottom-sheet with user list)
- Reply quote → tap → scroll FlatList to original message
- Message status icons polish (clock/check/double-check/eye-read)
- Composer fade-in send button (opacity via Animated when draft > 0)
- Linkified message text (URLs + @mentions tappable)
- Long-press menu animation polish

## Execution plan — multi-commit, multi-session

Realistic this is too big for one conversation turn. Plan:

**Session 1 (this one):**
1. PLAN + CONTEXT + ADR-0011 Amendment 6 (scaffolding commit)
2. Backend friend-requests migration
3. Backend social-graph endpoints
4. Backend messaging gate
5. Mobile friends module domain + storage + state shells
6. Status report → continue in session 2

**Session 2:**
7. Mobile friends UI screens (Inbox + ForeignProfile update)
8. Stories module shells (domain + storage + state)
9. Status report → continue in session 3

**Session 3:**
10. Stories UI (tray + viewer + creator)
11. Chat polish items
12. SUMMARY.md + STATE/ROADMAP update + closeout

## Out of scope (even with yolo)

- Real-time typing indicator (NEEDS backend pubsub event addition — separate
  CHAT-TYPING-INDICATOR v1.0.1 item, ~3h after Phase 9)
- Swipe-to-delete chat row (NEEDS DELETE /conversations/{id} backend — separate
  CHAT-SWIPE-DELETE v1.0.1 item, ~3h)
- Voice messages (HEALTH-* v1.1)
- Message forwarding (separate UX scope)
- Story replies with media (text-only replies first, media later)
- Sticker support, GIF picker — out of v1.0

## Acceptance criteria (best-effort given scope)

- ADR-0011 Amendment 6 documents scope expansion
- Backend friend-requests endpoint set works (postman/curl validation)
- Mobile friends module compiles + new screens render
- Stories module compiles + at least viewer renders
- jest tests added for pure logic (no UI snapshots per project convention)
- tsc clean throughout
- No regressions on existing 686 tests
- ROADMAP.md gains Phase 10 + Phase 11 OR scope-expansion note
