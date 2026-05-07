// Хелпер для записи закрытой сессии в платформенный health.
// Phase 7 / P7-A-02.

import { getHealthAdapter } from './index';
import type { HealthWorkout } from './HealthAdapter';

export type SessionForHealth = {
  /** Локальный ID сессии (используется как externalId для дедупа в платформе). */
  id: number;
  startedAt: number;
  endedAt: number;
  distanceM: number;
  /** Опционально: avgHr / calories — заполняем когда будем считать. */
  avgHrBpm?: number | null;
  calories?: number | null;
};

/**
 * Записать сессию в Apple Health / Health Connect (если adapter поддерживает).
 * Безопасная (no-throw): любые ошибки логируем, но дальше не пробрасываем —
 * запись не должна ломать UX пробежки.
 */
export async function writeSessionToHealth(s: SessionForHealth): Promise<boolean> {
  const adapter = getHealthAdapter();
  try {
    const ok = await adapter.isAvailable();
    if (!ok) return false;
    const granted = await adapter.grantedScopes();
    if (!granted.includes('write-workouts')) return false;
    const w: HealthWorkout = {
      externalId: `local-${s.id}`,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      distanceM: s.distanceM,
      activityType: 'running',
      avgHrBpm: s.avgHrBpm ?? null,
      calories: s.calories ?? null,
    };
    await adapter.writeWorkout(w);
    return true;
  } catch (e) {
    console.warn('[health.sync] writeSessionToHealth failed', e);
    return false;
  }
}
