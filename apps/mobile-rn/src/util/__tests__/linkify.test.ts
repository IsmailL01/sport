import { linkifyText } from '../linkify';

describe('linkifyText', () => {
  it('returns single text token for plain string', () => {
    expect(linkifyText('просто текст')).toEqual([
      { kind: 'text', value: 'просто текст' },
    ]);
  });

  it('returns empty array for empty input', () => {
    expect(linkifyText('')).toEqual([]);
  });

  it('extracts a full https URL', () => {
    const tokens = linkifyText('check https://example.com please');
    expect(tokens).toEqual([
      { kind: 'text', value: 'check ' },
      {
        kind: 'url',
        value: 'https://example.com',
        href: 'https://example.com',
      },
      { kind: 'text', value: ' please' },
    ]);
  });

  it('prepends https to bare www URL', () => {
    const tokens = linkifyText('go www.example.com now');
    expect(tokens).toEqual([
      { kind: 'text', value: 'go ' },
      { kind: 'url', value: 'www.example.com', href: 'https://www.example.com' },
      { kind: 'text', value: ' now' },
    ]);
  });

  it('extracts @mention', () => {
    const tokens = linkifyText('hey @alice how are you');
    expect(tokens).toEqual([
      { kind: 'text', value: 'hey ' },
      { kind: 'mention', value: '@alice', username: 'alice' },
      { kind: 'text', value: ' how are you' },
    ]);
  });

  it('rejects too-short mentions (< 3 chars)', () => {
    expect(linkifyText('hey @ab there')).toEqual([
      { kind: 'text', value: 'hey @ab there' },
    ]);
  });

  it('accepts long mention up to 32 chars', () => {
    const long = 'a'.repeat(32);
    const tokens = linkifyText(`hi @${long} bye`);
    expect(tokens[1]).toEqual({
      kind: 'mention',
      value: `@${long}`,
      username: long,
    });
  });

  it('handles multiple entities in one string', () => {
    const tokens = linkifyText('see @bob at https://x.com or www.y.com');
    expect(tokens.map((t) => t.kind)).toEqual([
      'text',
      'mention',
      'text',
      'url',
      'text',
      'url',
    ]);
  });

  it('mention at start of string', () => {
    const tokens = linkifyText('@alice hi');
    expect(tokens[0]).toEqual({
      kind: 'mention',
      value: '@alice',
      username: 'alice',
    });
  });

  it('URL with path + query', () => {
    const tokens = linkifyText('go https://example.com/path?q=1&z=2');
    expect(tokens).toEqual([
      { kind: 'text', value: 'go ' },
      {
        kind: 'url',
        value: 'https://example.com/path?q=1&z=2',
        href: 'https://example.com/path?q=1&z=2',
      },
    ]);
  });

  it('does NOT linkify emails', () => {
    expect(linkifyText('mail me at foo@bar.com please')).toEqual([
      { kind: 'text', value: 'mail me at foo@bar.com please' },
    ]);
  });

  it('does NOT linkify bare phone numbers', () => {
    expect(linkifyText('call +1-555-1234')).toEqual([
      { kind: 'text', value: 'call +1-555-1234' },
    ]);
  });

  it('handles cyrillic text alongside latin mention', () => {
    const tokens = linkifyText('привет @ismail как дела');
    expect(tokens[1]).toEqual({
      kind: 'mention',
      value: '@ismail',
      username: 'ismail',
    });
  });
});
