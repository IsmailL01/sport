// Тесты useWalletStore.awardForSession через мокированный walletRepository.
// Проверяют:
//   - идемпотентность за один session_id (no double credit)
//   - daily cap accumulation корректно «утекает» в decideCoinsForSession
//   - balance + transactions обновляются после successful earn
//   - clearAll сбрасывает state без вызова repo

jest.mock('../storage/walletRepository', () => {
  let _balance = 0;
  const _seen = new Set<string>();
  const _txs: Array<Record<string, unknown>> = [];
  let _earnedToday = 0;
  const fake = {
    __setBalance: (v: number) => { _balance = v; },
    __setSeen: (...keys: string[]) => { keys.forEach((k) => _seen.add(k)); },
    __setEarnedToday: (v: number) => { _earnedToday = v; },
    __reset: () => {
      _balance = 0;
      _seen.clear();
      _txs.length = 0;
      _earnedToday = 0;
    },
    __txs: () => _txs,

    getBalance: () => _balance,
    listTransactions: () => _txs,
    hasTransactionForSession: (userId: string, sid: number) => _seen.has(`${userId}:${sid}`),
    coinsEarnedSince: () => _earnedToday,
    startOfTodayMs: () => 0,
    recordTransaction: (args: {
      userId: string;
      kind: 'earn' | 'spend' | 'adjust';
      amount: number;
      sourceSessionId: number | null;
    }) => {
      const signed = args.kind === 'earn' ? args.amount : -args.amount;
      _balance += signed;
      if (args.sourceSessionId !== null) _seen.add(`${args.userId}:${args.sourceSessionId}`);
      if (args.kind === 'earn') _earnedToday += args.amount;
      _txs.unshift({ ...args, ts: Date.now() });
      return _balance;
    },
  };
  return fake;
});

import { useWalletStore } from '../state/wallet';
import * as repo from '../storage/walletRepository';

const repoMock = repo as unknown as {
  __reset: () => void;
  __setSeen: (...keys: string[]) => void;
  __setEarnedToday: (v: number) => void;
  __txs: () => Array<Record<string, unknown>>;
};

beforeEach(() => {
  repoMock.__reset();
  useWalletStore.getState().clearAll();
});

describe('useWalletStore.awardForSession', () => {
  const base = {
    userId: 'u1',
    sessionId: 1001,
    activity: 'run' as const,
    kcal: 300,
    durationS: 30 * 60,
    distanceM: 5000,
    avgHrBpm: 150,
  };

  it('happy path: начисляет монеты + обновляет state', () => {
    const d = useWalletStore.getState().awardForSession(base);
    expect(d.coins).toBe(30); // 300 kcal × 1.0 / 10
    expect(useWalletStore.getState().balance).toBe(30);
    expect(useWalletStore.getState().transactions.length).toBe(1);
  });

  it('idempotency: повторный вызов с тем же sessionId возвращает 0 + reason=already_awarded', () => {
    useWalletStore.getState().awardForSession(base);
    const second = useWalletStore.getState().awardForSession(base);
    expect(second.coins).toBe(0);
    expect(second.reason).toBe('already_awarded');
    // Баланс не вырос
    expect(useWalletStore.getState().balance).toBe(30);
    expect(repoMock.__txs().length).toBe(1);
  });

  it('honors daily cap из coinsEarnedSince', () => {
    repoMock.__setEarnedToday(490); // осталось 10 до cap=500
    const d = useWalletStore.getState().awardForSession(base);
    expect(d.coins).toBe(10);
    expect(d.meta.capped).toBe(true);
  });

  it('zero-decision (антифрод): не пишет в repo', () => {
    const d = useWalletStore.getState().awardForSession({
      ...base,
      durationS: 60, // < MIN_SESSION_DURATION_S
    });
    expect(d.coins).toBe(0);
    expect(d.reason).toBe('session_too_short');
    expect(useWalletStore.getState().balance).toBe(0);
    expect(repoMock.__txs().length).toBe(0);
  });

  it('clearAll resets in-memory state без обращения к repo', () => {
    useWalletStore.getState().awardForSession(base);
    expect(useWalletStore.getState().balance).toBe(30);
    useWalletStore.getState().clearAll();
    expect(useWalletStore.getState().balance).toBe(0);
    expect(useWalletStore.getState().userId).toBeNull();
    // Repo не очищен — это намеренно (clearAll wipe только state).
    expect(repoMock.__txs().length).toBe(1);
  });

  it('последовательно две разные сессии — два earn-эвента', () => {
    useWalletStore.getState().awardForSession({ ...base, sessionId: 1 });
    useWalletStore.getState().awardForSession({ ...base, sessionId: 2 });
    expect(useWalletStore.getState().balance).toBe(60);
    expect(repoMock.__txs().length).toBe(2);
  });
});
