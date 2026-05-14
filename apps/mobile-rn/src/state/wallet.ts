// Wallet store + бизнес-логика начисления за сессию.
//
// Composition:
//   - domain/currency: pure формула + антифрод
//   - storage/walletRepository: SQLite I/O
//   - этот файл: zustand state, кэш баланса и последних транзакций, метод
//     `awardForSession` который проверяет идемпотентность, считает по domain
//     и пишет в репозиторий.

import { create } from 'zustand';

import { decideCoinsForSession, type ActivityType, type CurrencyDecision } from '../domain/currency';
import {
  coinsEarnedSince,
  getBalance,
  hasTransactionForSession,
  listTransactions,
  recordTransaction,
  startOfTodayMs,
  type WalletTransaction,
} from '../storage/walletRepository';

type WalletStore = {
  userId: string | null;
  balance: number;
  transactions: WalletTransaction[];
  loading: boolean;

  hydrate: (userId: string) => void;
  refresh: () => void;
  awardForSession: (args: {
    userId: string;
    sessionId: number;
    activity: ActivityType;
    kcal: number;
    durationS: number;
    distanceM: number;
    avgHrBpm: number | null;
  }) => CurrencyDecision;
  clearAll: () => void;
};

export const useWalletStore = create<WalletStore>((set, get) => ({
  userId: null,
  balance: 0,
  transactions: [],
  loading: false,

  hydrate: (userId) => {
    set({ userId, loading: true });
    try {
      const balance = getBalance(userId);
      const transactions = listTransactions(userId, 50);
      set({ balance, transactions, loading: false });
    } catch (e) {
      console.error('[wallet] hydrate failed', e);
      set({ loading: false });
    }
  },

  refresh: () => {
    const { userId } = get();
    if (userId === null) return;
    try {
      const balance = getBalance(userId);
      const transactions = listTransactions(userId, 50);
      set({ balance, transactions });
    } catch (e) {
      console.error('[wallet] refresh failed', e);
    }
  },

  awardForSession: (args) => {
    // Идемпотентность: не начисляем повторно за ту же сессию.
    if (hasTransactionForSession(args.userId, args.sessionId)) {
      return {
        coins: 0,
        reason: 'already_awarded',
        meta: {
          activity: args.activity,
          kcal: Math.round(args.kcal),
          paceMinKm:
            args.distanceM > 0 && args.durationS > 0
              ? args.durationS / 60 / (args.distanceM / 1000)
              : null,
          multiplier: 1,
          capped: false,
        },
      };
    }

    const earnedToday = coinsEarnedSince(args.userId, startOfTodayMs());
    const decision = decideCoinsForSession({
      kcalBurned: args.kcal,
      durationS: args.durationS,
      distanceM: args.distanceM,
      activity: args.activity,
      avgHrBpm: args.avgHrBpm,
      coinsEarnedToday: earnedToday,
    });

    if (decision.coins > 0) {
      const newBalance = recordTransaction({
        userId: args.userId,
        kind: 'earn',
        amount: decision.coins,
        source: 'session',
        sourceSessionId: args.sessionId,
        meta: { ...decision.meta, reason: decision.reason },
      });
      const transactions = listTransactions(args.userId, 50);
      set({ balance: newBalance, transactions, userId: args.userId });
    }

    return decision;
  },

  clearAll: () => {
    set({ userId: null, balance: 0, transactions: [], loading: false });
  },
}));
