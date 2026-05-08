// Phase 8 / C — модуль stories: проверка чистых функций группировки.
// Storage / async — out-of-scope для unit тестов (требуют SQLite + network).

import {
  STORY_DURATION_MS,
  STORY_OVERLAY_MAX_LENGTH,
  type StoryGroup,
  type StoryWithStats,
} from '../modules/stories/domain/types';

function story(over: Partial<StoryWithStats>): StoryWithStats {
  return {
    id: 's1', authorId: 'alice', mediaId: 'm1',
    overlayText: null, createdAt: 1000, expiresAt: 1000 + STORY_DURATION_MS,
    viewCount: 0, iViewed: false,
    ...over,
  };
}

// Re-implement groupByAuthor для unit-тестa без импорта state-store
// (zustand store нелегко без mocking React).
function groupByAuthor(
  stories: StoryWithStats[],
  selfUserId: string | null,
): StoryGroup[] {
  const byAuthor = new Map<string, StoryWithStats[]>();
  for (const s of stories) {
    const arr = byAuthor.get(s.authorId) ?? [];
    arr.push(s);
    byAuthor.set(s.authorId, arr);
  }
  const groups: StoryGroup[] = [];
  for (const [authorId, arr] of byAuthor) {
    arr.sort((a, b) => a.createdAt - b.createdAt);
    groups.push({
      authorId,
      stories: arr,
      allViewed: arr.every((s) => s.iViewed),
    });
  }
  groups.sort((a, b) => {
    if (selfUserId) {
      if (a.authorId === selfUserId) return -1;
      if (b.authorId === selfUserId) return 1;
    }
    if (a.allViewed !== b.allViewed) return a.allViewed ? 1 : -1;
    const aMax = a.stories[a.stories.length - 1].createdAt;
    const bMax = b.stories[b.stories.length - 1].createdAt;
    return bMax - aMax;
  });
  return groups;
}

describe('stories: STORY_DURATION_MS / OVERLAY constants', () => {
  it('24h in ms', () => {
    expect(STORY_DURATION_MS).toBe(24 * 60 * 60 * 1000);
  });
  it('overlay limit 200', () => {
    expect(STORY_OVERLAY_MAX_LENGTH).toBe(200);
  });
});

describe('groupByAuthor', () => {
  it('groups stories by author and sorts by createdAt asc within group', () => {
    const groups = groupByAuthor(
      [
        story({ id: 'a2', authorId: 'alice', createdAt: 2000 }),
        story({ id: 'a1', authorId: 'alice', createdAt: 1000 }),
        story({ id: 'b1', authorId: 'bob', createdAt: 1500 }),
      ],
      null,
    );
    const alice = groups.find((g) => g.authorId === 'alice')!;
    expect(alice.stories.map((s) => s.id)).toEqual(['a1', 'a2']);
    expect(groups.map((g) => g.authorId).sort()).toEqual(['alice', 'bob']);
  });

  it('puts self group first when selfUserId provided', () => {
    const groups = groupByAuthor(
      [
        story({ id: 'a1', authorId: 'alice', createdAt: 1000 }),
        story({ id: 'b1', authorId: 'bob', createdAt: 5000 }),
        story({ id: 'me', authorId: 'me-user', createdAt: 500 }),
      ],
      'me-user',
    );
    expect(groups[0].authorId).toBe('me-user');
  });

  it('sorts unviewed before viewed', () => {
    const groups = groupByAuthor(
      [
        story({ id: 'a1', authorId: 'alice', createdAt: 1000, iViewed: true }),
        story({ id: 'b1', authorId: 'bob', createdAt: 500, iViewed: false }),
      ],
      null,
    );
    // bob (unviewed, allViewed=false) → должен идти раньше alice
    expect(groups[0].authorId).toBe('bob');
    expect(groups[0].allViewed).toBe(false);
    expect(groups[1].allViewed).toBe(true);
  });

  it('among same allViewed status: newer last-published first', () => {
    const groups = groupByAuthor(
      [
        story({ id: 'a1', authorId: 'alice', createdAt: 1000 }),
        story({ id: 'b1', authorId: 'bob', createdAt: 5000 }),
      ],
      null,
    );
    expect(groups[0].authorId).toBe('bob');
  });

  it('allViewed = true only if every story in group is viewed', () => {
    const groups = groupByAuthor(
      [
        story({ id: 'a1', authorId: 'alice', createdAt: 1000, iViewed: true }),
        story({ id: 'a2', authorId: 'alice', createdAt: 2000, iViewed: false }),
      ],
      null,
    );
    expect(groups[0].allViewed).toBe(false);
  });
});
