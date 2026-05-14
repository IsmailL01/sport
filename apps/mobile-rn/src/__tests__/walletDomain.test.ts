import {
  InsufficientBalanceError,
  signedAmountFor,
  validateTransaction,
} from '../domain/walletDomain';

describe('signedAmountFor', () => {
  it('earn → +amount', () => expect(signedAmountFor('earn', 50)).toBe(50));
  it('spend → -amount', () => expect(signedAmountFor('spend', 50)).toBe(-50));
  it('adjust → +amount (caller контролирует знак через amount)', () =>
    expect(signedAmountFor('adjust', 50)).toBe(50));
});

describe('validateTransaction', () => {
  const u = 'u1';

  it('earn любая сумма — OK', () => {
    expect(validateTransaction({ userId: u, kind: 'earn', amount: 100 }, 0)).toBeNull();
    expect(validateTransaction({ userId: u, kind: 'earn', amount: 1000 }, 50)).toBeNull();
  });

  it('spend ≤ balance — OK', () => {
    expect(validateTransaction({ userId: u, kind: 'spend', amount: 30 }, 100)).toBeNull();
    expect(validateTransaction({ userId: u, kind: 'spend', amount: 100 }, 100)).toBeNull();
  });

  it('spend > balance — InsufficientBalanceError', () => {
    const err = validateTransaction({ userId: u, kind: 'spend', amount: 150 }, 100);
    expect(err).toBeInstanceOf(InsufficientBalanceError);
    if (err instanceof InsufficientBalanceError) {
      expect(err.need).toBe(150);
      expect(err.have).toBe(100);
      expect(err.userId).toBe(u);
    }
  });

  it('spend от нуля — InsufficientBalanceError', () => {
    const err = validateTransaction({ userId: u, kind: 'spend', amount: 1 }, 0);
    expect(err).toBeInstanceOf(InsufficientBalanceError);
  });

  it('negative amount — generic Error', () => {
    const err = validateTransaction({ userId: u, kind: 'earn', amount: -5 }, 0);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(InsufficientBalanceError);
  });

  it('NaN amount — generic Error', () => {
    const err = validateTransaction({ userId: u, kind: 'earn', amount: NaN }, 100);
    expect(err).toBeInstanceOf(Error);
  });

  it('adjust как spend (когда signedAmountFor adjust = +) — не ругается на overspend', () => {
    // adjust используется для admin-корректировок, в нашей модели signed = +amount
    // (caller отвечает за выбор kind).
    expect(validateTransaction({ userId: u, kind: 'adjust', amount: 100 }, 0)).toBeNull();
  });
});

describe('InsufficientBalanceError', () => {
  it('сохраняет userId/need/have как public fields', () => {
    const err = new InsufficientBalanceError('alice', 200, 50);
    expect(err.userId).toBe('alice');
    expect(err.need).toBe(200);
    expect(err.have).toBe(50);
    expect(err.message).toContain('200');
    expect(err.message).toContain('50');
    expect(err.name).toBe('InsufficientBalanceError');
  });
});
