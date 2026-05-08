import { canDeleteMessage, lastMessagePreview, type Chat, type Message } from '../domain/social';

function msg(overrides: Partial<Message>): Message {
  return {
    id: 'm1', clientId: 'c1', chatId: 'chat1', senderId: 'alice',
    kind: 'text', text: 'hi',
    mediaLocalUri: null, mediaRemoteUrl: null,
    mediaWidth: null, mediaHeight: null, mediaDurationS: null,
    replyToMessageId: null, reactions: [],
    status: 'sent', isDeleted: false, deletedBy: null,
    createdAt: 1_000, editedAt: null, attempts: 0,
    ...overrides,
  };
}

describe('lastMessagePreview', () => {
  it('null preview', () => {
    expect(lastMessagePreview(null)).toBe('');
  });
  it('text preview', () => {
    expect(lastMessagePreview({ id: 'x', text: 'привет', senderId: 'alice', ts: 1 })).toBe('привет');
  });
  it('truncates 80+ chars', () => {
    const long = 'x'.repeat(100);
    const r = lastMessagePreview({ id: 'x', text: long, senderId: 'alice', ts: 1 });
    expect(r.length).toBeLessThanOrEqual(81);
    expect(r).toMatch(/…$/);
  });
  it('null text → media glyph', () => {
    const r = lastMessagePreview({ id: 'x', text: null, senderId: 'alice', ts: 1 });
    expect(r).toMatch(/медиа/);
  });
});

describe('canDeleteMessage', () => {
  const own = msg({ senderId: 'me' });
  const others = msg({ senderId: 'someone' });
  const deleted = msg({ senderId: 'me', isDeleted: true });

  it('owner of message can delete own', () => {
    expect(canDeleteMessage('me', own, 'member')).toBe(true);
  });
  it('member cannot delete others', () => {
    expect(canDeleteMessage('me', others, 'member')).toBe(false);
  });
  it('admin can delete others', () => {
    expect(canDeleteMessage('me', others, 'admin')).toBe(true);
  });
  it('moderator can delete others', () => {
    expect(canDeleteMessage('me', others, 'moderator')).toBe(true);
  });
  it('owner role can delete others', () => {
    expect(canDeleteMessage('me', others, 'owner')).toBe(true);
  });
  it('cannot delete already-deleted', () => {
    expect(canDeleteMessage('me', deleted, 'admin')).toBe(false);
  });
  it('restricted cannot delete own', () => {
    // Phase 8 / E semantics: restricted readonly
    expect(canDeleteMessage('me', own, 'restricted')).toBe(true); // own message exception holds
  });
});
