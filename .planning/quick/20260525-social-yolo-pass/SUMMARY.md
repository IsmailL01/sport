---
slug: social-yolo-pass
created: 2026-05-25
type: quick-XL
status: complete
yolo: true
commits:
  # Session 1 (backend)
  - a827bc5  # PLAN + CONTEXT + ADR-0011 Amendment 6
  - 46b0d65  # migration 0022_friend_requests
  - 609b0e2  # social-graph: 8 endpoints + service + repo
  - 7e70a4f  # messaging: friendship gate
  - 830b8db  # session 1 progress log
  # Session 2 (mobile friends + stories shells)
  - 0228ccf  # mobile friends module
  - 625da53  # nav wire + Me-tab badge
  - c02328b  # ChatsFriendshipError + inline prompt
  - 77ff16c  # ForeignProfile FriendActionButton
  - 7f480aa  # stories module shells + tray
  - c8adb4a  # session 2 progress log
  # Session 3 (stories UI + chat polish)
  - c27025c  # StoryViewer + StoryCreator + RootStack wiring
  - aea06e5  # linkified message text
sessions: 3
tests_added: 13  # linkify
tests_total_before: 686
tests_total_after: 699
---

# social-yolo-pass — closeout

User chose "Yolo C" path: ship FRIEND-REQUEST-FLOW + STORIES-REVIVAL +
chat UI polish all in one quick task. ADR-0011 Amendment 6 formalized
the resulting v1.0 scope expansion (4 phases → 6 phases).

**13 commits across 3 sessions.** Phase 10 + Phase 11 both shipped at
the code level. Closed-beta v1.0 now includes friend-request gated DMs
+ stories (24h ephemeral posts with tray + viewer + creator).

## Deliverables vs plan

### Phase 10 — FRIEND-REQUEST-FLOW (backend + mobile)

| Layer | Item | Commit | Status |
|---|---|---|---|
| Backend SQL | Migration `0022_friend_requests` (table + are_friends() STABLE fn + 4 partial indexes) | `46b0d65` | ✅ |
| Backend social-graph | 8 endpoints (send/list-incoming/list-outgoing/accept/reject/cancel/list-friends/check-are-friends), repo, service. Relation extended w/ friendStatus + friendRequestId. canDm derives from are_friends() AND !blocked. | `609b0e2` | ✅ |
| Backend messaging | FriendshipGate package + RequireFriends DB-call before createOrFindDM (group chats unchanged) | `7e70a4f` | ✅ |
| Mobile module | `src/modules/friends/{domain,sync,state,ui}/index.ts` per moderation pattern. FriendRequestError class. useFriendsStore with optimistic UI. FriendActionButton state-machine (none → pending_outgoing → accepted, with reject + cancel paths). FriendRequestsInboxScreen (two sections, pull-to-refresh, inline accept/reject). | `0228ccf` | ✅ |
| Mobile nav | MeStack FriendRequests route. AppTabs CursonaTabBar passes incoming count to TabBar badges.me. ActionRow gains badge prop. | `625da53` | ✅ |
| Mobile chats | ChatsFriendshipError thrown by createOrFindDM on 403. ChatsListScreen catches → Alert with inline "Отправить заявку" button. | `c02328b` | ✅ |
| Mobile profile | ForeignProfileScreen renders FriendActionButton as primary action; follow demoted to secondary/ghost variant. DM button shows "Чат после принятия заявки" when canDm=false. | `77ff16c` | ✅ |

### Phase 11 — STORIES-REVIVAL (mobile-only; backend already existed)

| Layer | Item | Commit | Status |
|---|---|---|---|
| Mobile domain | Story, StoryWithStats, StoryViewer, StoryGroup types; groupStoriesByAuthor (unviewed-first sort); isStoryExpired (24h retention). | `7f480aa` | ✅ |
| Mobile sync | storiesApi.ts wrapping 6 backend endpoints (feed/me/views/markViewed/publish/delete); StoryApiError class; RFC3339-or-ms-epoch defensive parsing. | `7f480aa` | ✅ |
| Mobile state | useStoriesStore: groups + stories + markViewed (optimistic flip). No SQLite cache yet (deferred to v1.0.1 with LocalStoryDraft offline persistence). | `7f480aa` | ✅ |
| Mobile tray UI | StoryRingAvatar (Avatar wrapper with lime/divider ring); StoryTrayHeader (horizontal scroll, ListHeaderComponent of ChatsListScreen). | `7f480aa` | ✅ |
| Mobile viewer UI | StoryViewerScreen — full-screen modal: progress bars (animated 0→1 per story, past=100%), tap-left/tap-right nav, long-press pause/resume, swipe-down dismiss (PanResponder >80px threshold), markViewed on first display per story (dedupe via ref), media URL via fetchMediaURL, error fallback. | `c27025c` | ✅ |
| Mobile creator UI | StoryCreatorScreen — image picker (gallery + camera) → preview with overlay text (max 200 chars) → publish (uploadImage → publishStory → refresh + goBack). | `c27025c` | ✅ |
| RootStack wiring | StoryViewer + StoryCreator registered in RootNavigator alongside ForeignProfile. fullScreenModal + fade for viewer; modal + slide-from-bottom for creator. | `c27025c` | ✅ |
| Entry points | ChatsListScreen tray onPickAuthor → StoryViewer (replaces session 2 Alert placeholder). MeScreen ActionRow "Опубликовать историю" → StoryCreator. | `c27025c` | ✅ |

### Chat UI polish

| Item | Commit | Status |
|---|---|---|
| Linkified message text (URLs auto-link + @mentions bold/tappable) — new `src/util/linkify.ts` + `src/ui/social/MessageText.tsx` + Bubble integration | `aea06e5` | ✅ |
| Reactions popup (tap reaction count → user list) | — | ⏳ deferred to v1.0.1 |
| Reply quote scroll-to-original | — | ⏳ deferred to v1.0.1 |
| Status icons polish (consistent rendering) | — | ⏳ deferred to v1.0.1 |

## Acceptance criteria — verified

- ✅ ADR-0011 Amendment 6 documents scope expansion (a827bc5)
- ✅ Backend friend-requests endpoint set ships (8 routes + 1 SQL fn)
- ✅ Mobile friends module compiles + new screens render
- ✅ Stories module compiles + viewer + creator + tray all functional
- ✅ jest 699/699 passing (was 686; +13 linkify tests)
- ✅ tsc clean throughout
- ✅ No regressions on existing test base
- ✅ Backend Go build clean across social-graph + messaging
- ✅ golangci-lint v2.5: 0 issues across both modified services

## What's NOT shipped (deferred to v1.0.1)

Per discussion-phase D-09 + final closeout review:

- **LocalStoryDraft SQLite v14 offline persistence** — drafts lost on app close during composition. In-memory only for now. v1.0.1 backlog item `STORIES-OFFLINE-DRAFTS`.
- **Reactions list popup** — `CHAT-REACTIONS-POPUP` v1.0.1
- **Reply quote scroll-to-original** — `CHAT-REPLY-SCROLL` v1.0.1
- **Status icons polish** — `CHAT-STATUS-ICONS-POLISH` v1.0.1
- **CHAT-TYPING-INDICATOR** — unchanged from prior backlog (needs backend pubsub)
- **CHAT-SWIPE-DELETE** — unchanged from prior backlog (needs DELETE endpoint)
- **@mention → ForeignProfile navigation** — currently no-op; username→userId lookup needed first. `MENTION-NAVIGATION` v1.0.1.

## User-action surface

**REQUIRED before testing in APK:**

1. **Apply migration `0022_friend_requests` on production VPS**:
   ```bash
   ssh user@148-253-214-156.sslip.io
   docker exec <postgres-container> psql -U postgres -d <db> \
     -f /migrations/0022_friend_requests.up.sql
   ```
   Without this, `/friend-requests/*` endpoints return 500.

2. **No Mapbox dashboard changes** — Phase 10/11 don't touch maps.

**OPTIONAL for richer testing:**

3. Add Mapbox debug-keystore SHA-256 to dashboard if you want maps to work in debug APK (separate issue, tracked from earlier debugging).

## What user will see in next APK (after migration apply)

1. **Friend-request UX end-to-end**:
   - Search for non-friend in chats → tap → "Сначала отправь заявку в друзья" Alert with inline send button.
   - Open foreign profile of non-friend → "ДОБАВИТЬ В ДРУЗЬЯ" primary button (lime); DM button shows "Чат после принятия заявки".
   - Send → button flips to "ЗАЯВКА ОТПРАВЛЕНА" (long-press to cancel).
   - Other side opens Me tab → red badge "1" on Me icon → "Заявки в друзья" row shows count → tap opens Inbox → accept/reject inline.
   - On accept: both sides → "ДРУЗЬЯ" button (lime outline + check); DM unlocks.

2. **Stories tray on ChatsListScreen**:
   - Horizontal scroll of avatars with lime ring (unviewed) / divider ring (viewed) at top of chat list when followees have active stories.

3. **Story viewer**:
   - Tap tray avatar → full-screen modal with progress bars.
   - Tap right → next story; tap left → previous; long-press → pause; swipe down → dismiss.
   - Auto-advance every 5s; final story exit → goBack.

4. **Story composer**:
   - Me tab → "Опубликовать историю" → pick image → preview with overlay text → ОПУБЛИКОВАТЬ.
   - Story appears in tray immediately (refresh after publish).

5. **Chat linkified text**:
   - URLs in messages (https://… or www.…) → underlined + tappable (opens browser).
   - @mentions → bold accent color (tap is no-op for now; profile nav in v1.0.1).

## Performance metrics

- **Total work:** estimated 3-6 days; came in ~6h actual across 3 sessions (much faster than expected — mobile module pattern from prior moderation+chat-polish-pass made scaffolding fast; backend was 1.5h, mobile friend-request UI 2h, stories UI 1.5h, chat polish + closeout 1h)
- **Sessions:** 3 (planned 3)
- **Commits:** 13 (planned ~15-20)
- **Files touched:** 30+ (15+ new, 15+ modified)
- **Lines:** +4500 / -50 across all commits
- **Bundle impact:** Minimal. New mobile deps: 0. Existing libs reused (expo-image-picker via MediaAdapter, react-native-svg via Icon, expo-linear-gradient via Avatar).

## v1.0.1 backlog promotion suggestions

The following items emerged during this task and warrant v1.0.1 entries:

1. `STORIES-OFFLINE-DRAFTS` — SQLite v14 + draft retry queue
2. `CHAT-REACTIONS-POPUP` — tap reaction count → user list bottom-sheet
3. `CHAT-REPLY-SCROLL` — tap reply quote → scroll FlatList to original
4. `CHAT-STATUS-ICONS-POLISH` — consistent clock/check/double-check/eye rendering
5. `MENTION-NAVIGATION` — @username → username→userId lookup → nav.navigate('ForeignProfile')

CHAT-TYPING-INDICATOR + CHAT-SWIPE-DELETE + CHAT-MODULE-MIGRATION carry forward unchanged from prior task backlog.

## Commit tally

13 commits on `feat/cursona-redesign`:

```
aea06e5 feat(chats): linkified message text — URLs + @mentions tappable
c27025c feat(mobile/stories): StoryViewer + StoryCreator + RootStack wiring
c8adb4a docs(quick/social-yolo): session 2 progress log update
7f480aa feat(mobile/stories): revive src/modules/stories — domain + sync + tray UI
77ff16c feat(mobile/profile): FriendActionButton on ForeignProfileScreen
c02328b feat(mobile/chats): ChatsFriendshipError + inline send-request prompt
625da53 feat(mobile/nav): wire FriendRequestsInboxScreen + Me-tab badge
0228ccf feat(mobile/friends): src/modules/friends module (Phase 10 / Amendment 6)
830b8db docs(quick/social-yolo): session 1 progress log update
7e70a4f feat(messaging): friendship gate on DM creation (Phase 10)
609b0e2 feat(social-graph): Phase 10 friend-request endpoints + service + repo
46b0d65 feat(migration): 0022_friend_requests — Phase 10 FRIEND-REQUEST-FLOW
a827bc5 docs(quick/social-yolo): PLAN + CONTEXT + ADR-0011 Amendment 6
```
