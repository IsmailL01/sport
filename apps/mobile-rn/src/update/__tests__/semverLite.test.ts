import { compare, eq, gt, lt, parse } from '../semverLite';

describe('semverLite.parse', () => {
  it('parses MAJOR.MINOR.PATCH', () => {
    expect(parse('1.0.0')).toEqual({
      major: 1,
      minor: 0,
      patch: 0,
      pre: null,
      preN: 0,
    });
  });

  it('parses with beta pre-release', () => {
    expect(parse('1.0.0-beta.5')).toEqual({
      major: 1,
      minor: 0,
      patch: 0,
      pre: 'beta',
      preN: 5,
    });
  });

  it('parses with rc pre-release', () => {
    expect(parse('2.10.42-rc.3')).toEqual({
      major: 2,
      minor: 10,
      patch: 42,
      pre: 'rc',
      preN: 3,
    });
  });

  it('returns null on invalid input', () => {
    expect(parse('not-a-version')).toBeNull();
    expect(parse('1.0')).toBeNull();
    expect(parse('1.0.0-alpha.1')).toBeNull(); // alpha not supported
    expect(parse('1.0.0-beta')).toBeNull(); // missing N
    expect(parse('')).toBeNull();
  });
});

describe('semverLite.compare', () => {
  it('compares MAJOR', () => {
    expect(compare('1.0.0', '2.0.0')).toBe(-1);
    expect(compare('2.0.0', '1.0.0')).toBe(1);
  });

  it('compares MINOR', () => {
    expect(compare('1.0.0', '1.1.0')).toBe(-1);
    expect(compare('1.10.0', '1.2.0')).toBe(1);
  });

  it('compares PATCH', () => {
    expect(compare('1.0.0', '1.0.1')).toBe(-1);
    expect(compare('1.0.99', '1.0.5')).toBe(1);
  });

  it('release > pre-release with same core', () => {
    expect(compare('1.0.0', '1.0.0-beta.5')).toBe(1);
    expect(compare('1.0.0-rc.99', '1.0.0')).toBe(-1);
  });

  it('rc > beta with same core', () => {
    expect(compare('1.0.0-beta.5', '1.0.0-rc.1')).toBe(-1);
    expect(compare('1.0.0-rc.1', '1.0.0-beta.99')).toBe(1);
  });

  it('compares preN within same pre-type', () => {
    expect(compare('1.0.0-beta.1', '1.0.0-beta.2')).toBe(-1);
    expect(compare('1.0.0-beta.10', '1.0.0-beta.2')).toBe(1);
    expect(compare('1.0.0-beta.5', '1.0.0-beta.5')).toBe(0);
  });

  it('equal versions', () => {
    expect(compare('1.0.0', '1.0.0')).toBe(0);
    expect(compare('1.0.0-rc.1', '1.0.0-rc.1')).toBe(0);
  });

  it('throws on invalid input', () => {
    expect(() => compare('1.0.0', 'bad')).toThrow(/invalid version/);
    expect(() => compare('bad', '1.0.0')).toThrow(/invalid version/);
  });
});

describe('semverLite.gt/lt/eq helpers', () => {
  it('gt true when first > second', () => {
    expect(gt('1.0.0-beta.5', '1.0.0-beta.4')).toBe(true);
    expect(gt('1.0.0-beta.4', '1.0.0-beta.5')).toBe(false);
    expect(gt('1.0.0', '1.0.0')).toBe(false);
  });

  it('lt true when first < second', () => {
    expect(lt('1.0.0-beta.4', '1.0.0-beta.5')).toBe(true);
    expect(lt('1.0.0', '1.0.0-beta.5')).toBe(false);
  });

  it('eq true only when identical', () => {
    expect(eq('1.0.0', '1.0.0')).toBe(true);
    expect(eq('1.0.0-beta.5', '1.0.0-beta.5')).toBe(true);
    expect(eq('1.0.0', '1.0.1')).toBe(false);
  });
});
