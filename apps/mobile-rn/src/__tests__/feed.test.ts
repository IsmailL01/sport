// Phase 8 / D — модуль feed: проверка чистых констант + типов.
//
// SQLite/network тесты — out-of-scope (требуют real DB, server).
// Здесь — sanity check публичного surface модуля.

import {
  COMMENT_BODY_MAX_LENGTH,
  POST_BODY_MAX_LENGTH,
  type Comment,
  type LocalPostDraft,
  type Post,
  type PostKind,
} from '../modules/feed/domain/types';

describe('feed: constants', () => {
  it('post body limit 4000', () => {
    expect(POST_BODY_MAX_LENGTH).toBe(4000);
  });
  it('comment body limit 2000', () => {
    expect(COMMENT_BODY_MAX_LENGTH).toBe(2000);
  });
});

describe('feed: types compile correctly', () => {
  it('Post requires all server-issued fields', () => {
    const p: Post = {
      id: 'p1', authorId: 'a1', kind: 'text', body: 'hi',
      mediaId: null, sessionRef: null,
      likeCount: 0, commentCount: 0, iLiked: false,
      createdAt: 1000, editedAt: null,
    };
    expect(p.kind).toBe('text');
  });

  it('LocalPostDraft has clientId for idempotent push', () => {
    const d: LocalPostDraft = {
      clientId: 'c1', authorId: 'me', kind: 'text', body: 'hi',
      mediaLocalUri: null, mediaMime: null, mediaWidth: null, mediaHeight: null,
      mediaId: null, sessionRef: null,
      createdAt: 1000, status: 'pending', attempts: 0, lastError: null,
    };
    expect(d.status).toBe('pending');
  });

  it('Comment has stable shape', () => {
    const c: Comment = {
      id: 'c1', postId: 'p1', authorId: 'a1', body: 'hi', createdAt: 1000,
    };
    expect(c.body).toBe('hi');
  });

  it('PostKind is string-union, not enum', () => {
    const kinds: PostKind[] = ['text', 'photo', 'session'];
    expect(kinds).toHaveLength(3);
  });
});

// Простая функция группировки постов по авторам (для будущего "feed by-author"
// view, не используется сейчас, но протестируем функциональность которая
// потенциально будет в state-слое).
function groupByAuthor(posts: Post[]): Map<string, Post[]> {
  const out = new Map<string, Post[]>();
  for (const p of posts) {
    const arr = out.get(p.authorId) ?? [];
    arr.push(p);
    out.set(p.authorId, arr);
  }
  return out;
}

describe('feed: groupByAuthor helper', () => {
  it('groups posts by author', () => {
    const post = (id: string, authorId: string): Post => ({
      id, authorId, kind: 'text', body: 'x',
      mediaId: null, sessionRef: null,
      likeCount: 0, commentCount: 0, iLiked: false,
      createdAt: 1, editedAt: null,
    });
    const groups = groupByAuthor([
      post('p1', 'a'), post('p2', 'a'), post('p3', 'b'),
    ]);
    expect(groups.get('a')).toHaveLength(2);
    expect(groups.get('b')).toHaveLength(1);
  });
});
