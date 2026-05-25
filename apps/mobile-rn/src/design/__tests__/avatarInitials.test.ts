import { initialsForName, colorForName, hashName } from '../avatarInitials';

describe('initialsForName', () => {
  it('single word → single letter', () => {
    expect(initialsForName('Ismail')).toBe('I');
  });
  it('two words → two letters', () => {
    expect(initialsForName('Ismail Latifov')).toBe('IL');
  });
  it('three words → first two only', () => {
    expect(initialsForName('John Q Public')).toBe('JQ');
  });
  it('cyrillic two-word', () => {
    expect(initialsForName('Иван Петров')).toBe('ИП');
  });
  it('lowercase → uppercase output', () => {
    expect(initialsForName('alice')).toBe('A');
  });
  it('@username — strips leading @', () => {
    expect(initialsForName('@coolguy')).toBe('C');
  });
  it('@@@ chain stripped', () => {
    expect(initialsForName('@@alice')).toBe('A');
  });
  it('extra whitespace collapsed', () => {
    expect(initialsForName('  Ann   Smith  ')).toBe('AS');
  });
  it('empty string → fallback "?"', () => {
    expect(initialsForName('')).toBe('?');
  });
  it('whitespace-only → fallback "?"', () => {
    expect(initialsForName('   ')).toBe('?');
  });
});

describe('colorForName', () => {
  it('is deterministic for the same name', () => {
    expect(colorForName('Ismail')).toEqual(colorForName('Ismail'));
  });
  it('returns gray bucket for empty name', () => {
    const empty = colorForName('');
    expect(empty.start).toBe('#9CA3AF');
    expect(empty.end).toBe('#4B5563');
  });
  it('returns valid hex pair for any name', () => {
    const c = colorForName('foo');
    expect(c.start).toMatch(/^#[0-9A-F]{6}$/);
    expect(c.end).toMatch(/^#[0-9A-F]{6}$/);
  });
  it('different names usually map to different colors', () => {
    // Not a strict guarantee (12-bucket palette + collisions possible) but
    // for distinct short names like these we expect ≥1 different bucket.
    const samples = ['alice', 'bob', 'carol', 'dave', 'eve', 'frank'];
    const colors = new Set(samples.map((n) => colorForName(n).start));
    expect(colors.size).toBeGreaterThan(1);
  });
});

describe('hashName', () => {
  it('is deterministic', () => {
    expect(hashName('Ismail')).toBe(hashName('Ismail'));
  });
  it('differs for different inputs', () => {
    expect(hashName('alice')).not.toBe(hashName('bob'));
  });
  it('handles empty string', () => {
    expect(hashName('')).toBe(0);
  });
});
