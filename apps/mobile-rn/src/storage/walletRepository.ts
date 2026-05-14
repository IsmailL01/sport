// SQLite репозиторий для кошелька (см. database.ts v15 / v19).
//
// Pure I/O, без бизнес-логики: формула и антифрод живут в domain/currency.ts.
// Pure-хелперы (validateTransaction, signedAmountFor) — в domain/walletDomain.ts.

import { getDatabase } from './database';
import {
  InsufficientBalanceError,
  signedAmountFor,
  validateTransaction,
  type WalletTxKind,
} from '../domain/walletDomain';

export { InsufficientBalanceError, type WalletTxKind };
export type WalletTxSource = 'session' | 'admin' | 'refund' | 'promo';

export type WalletTransaction = {
  id: number;
  userId: string;
  kind: WalletTxKind;
  amount: number;
  source: WalletTxSource;
  sourceSessionId: number | null;
  ts: number;
  meta: Record<string, unknown> | null;
};

export function getBalance(userId: string): number {
  const db = getDatabase();
  const row = db.getFirstSync<{ coins: number }>(
    'SELECT coins FROM wallet_balance WHERE user_id = ?;',
    [userId],
  );
  return row?.coins ?? 0;
}


/**
 * Atomic: bump balance + insert transaction. Возвращает новый баланс.
 *
 * Для `kind: 'spend'` или отрицательного `kind: 'adjust'` сначала проверяем
 * достаточность баланса. Если не хватает — бросаем `InsufficientBalanceError`
 * до записи в БД (откатывать нечего). Это работает поверх CHECK(coins >= 0)
 * (v19) — БД-уровень страхует от race-condition, а это — UX-сообщение.
 */
export function recordTransaction(
  args: {
    userId: string;
    kind: WalletTxKind;
    amount: number;
    source: WalletTxSource;
    sourceSessionId: number | null;
    ts?: number;
    meta?: Record<string, unknown> | null;
  },
): number {
  const db = getDatabase();
  const ts = args.ts ?? Date.now();
  const signedAmount = signedAmountFor(args.kind, args.amount);

  const validationErr = validateTransaction(args, getBalance(args.userId));
  if (validationErr !== null) {
    throw validationErr;
  }

  let newBalance = 0;
  db.withTransactionSync(() => {
    db.runSync(
      `INSERT INTO wallet_transactions
       (user_id, kind, amount, source, source_session_id, ts, meta)
       VALUES (?, ?, ?, ?, ?, ?, ?);`,
      [
        args.userId,
        args.kind,
        Math.abs(args.amount),
        args.source,
        args.sourceSessionId,
        ts,
        args.meta !== null && args.meta !== undefined ? JSON.stringify(args.meta) : null,
      ],
    );
    db.runSync(
      `INSERT INTO wallet_balance (user_id, coins, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         coins = coins + excluded.coins,
         updated_at = excluded.updated_at;`,
      [args.userId, signedAmount, ts],
    );
    const row = db.getFirstSync<{ coins: number }>(
      'SELECT coins FROM wallet_balance WHERE user_id = ?;',
      [args.userId],
    );
    newBalance = row?.coins ?? 0;
  });
  return newBalance;
}

/** Идемпотентность: не позволяем дважды начислить за одну session. */
export function hasTransactionForSession(userId: string, sessionId: number): boolean {
  const db = getDatabase();
  const row = db.getFirstSync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM wallet_transactions
     WHERE user_id = ? AND source_session_id = ?;`,
    [userId, sessionId],
  );
  return (row?.n ?? 0) > 0;
}

/** Сумма earned-монет за календарный день для cap-проверки. */
export function coinsEarnedSince(userId: string, sinceMs: number): number {
  const db = getDatabase();
  const row = db.getFirstSync<{ s: number | null }>(
    `SELECT COALESCE(SUM(amount), 0) AS s
     FROM wallet_transactions
     WHERE user_id = ? AND kind = 'earn' AND ts >= ?;`,
    [userId, sinceMs],
  );
  return row?.s ?? 0;
}

export function listTransactions(userId: string, limit = 50): WalletTransaction[] {
  const db = getDatabase();
  const rows = db.getAllSync<{
    id: number;
    user_id: string;
    kind: WalletTxKind;
    amount: number;
    source: WalletTxSource;
    source_session_id: number | null;
    ts: number;
    meta: string | null;
  }>(
    `SELECT id, user_id, kind, amount, source, source_session_id, ts, meta
     FROM wallet_transactions
     WHERE user_id = ?
     ORDER BY ts DESC
     LIMIT ?;`,
    [userId, limit],
  );
  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    kind: r.kind,
    amount: r.amount,
    source: r.source,
    sourceSessionId: r.source_session_id,
    ts: r.ts,
    meta: r.meta !== null ? safeJson(r.meta) : null,
  }));
}

export function clearAllWallet(): void {
  const db = getDatabase();
  db.execSync('DELETE FROM wallet_transactions; DELETE FROM wallet_balance;');
}

function safeJson(s: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(s);
    if (v !== null && typeof v === 'object') return v as Record<string, unknown>;
  } catch {
    // ignore
  }
  return null;
}

/** Local-day midnight в ms. */
export function startOfTodayMs(now = new Date()): number {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}
