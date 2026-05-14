// Pure-логика wallet: знак суммы и pre-flight валидация.
// Вынесено отдельно от storage/walletRepository чтобы Jest мог тестировать
// без подгрузки expo-sqlite (см. почему — комментарий в health/importSanity.ts).

export type WalletTxKind = 'earn' | 'spend' | 'adjust';

export class InsufficientBalanceError extends Error {
  constructor(public readonly userId: string, public readonly need: number, public readonly have: number) {
    super(`Недостаточно монет: нужно ${need}, есть ${have}`);
    this.name = 'InsufficientBalanceError';
  }
}

/** Знак суммы из kind. earn → +, spend → −, adjust → signed input (но amount всегда >= 0). */
export function signedAmountFor(kind: WalletTxKind, amount: number): number {
  return kind === 'earn' ? amount : kind === 'spend' ? -amount : amount;
}

/**
 * Pure-валидация транзакции до записи в БД. Возвращает Error или null.
 *
 * Это **первый контур** защиты (понятное UX-сообщение).
 * **Второй контур** — CHECK(coins >= 0) на wallet_balance (миграция v19).
 */
export function validateTransaction(
  args: { userId: string; kind: WalletTxKind; amount: number },
  currentBalance: number,
): Error | null {
  if (!Number.isFinite(args.amount)) {
    return new Error('amount must be finite');
  }
  if (args.amount < 0) {
    return new Error('amount must be non-negative; знак выводится из kind');
  }
  const signed = signedAmountFor(args.kind, args.amount);
  if (signed < 0 && currentBalance + signed < 0) {
    return new InsufficientBalanceError(args.userId, Math.abs(signed), currentBalance);
  }
  return null;
}
