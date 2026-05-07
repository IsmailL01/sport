// Lactate Threshold HR estimation.
// ТЗ §6 / Phase 6 / P6-A-05.
//
// Точное LTHR определяется через лактатный тест в лаборатории. Дома можно
// оценить через 30-минутный all-out тест и взять средний HR последних
// 20 минут (метод Friel).
//
// Здесь — упрощённая эвристика для прототипа: берём 95-й перцентиль HR
// из последних N тренировок длительностью ≥ 30 минут. Phase 6 / Phase 6.5
// — заменим на реальный 30-min test wizard.

export type LthrEstimate = {
  bpm: number | null;
  /** Уровень доверия (low / medium / high) на основе кол-ва данных. */
  confidence: 'low' | 'medium' | 'high';
  /** Сколько training-сессий использовано для оценки. */
  sessionsUsed: number;
};

/**
 * Оценить LTHR из истории.
 *
 * @param sessionAvgHrs — средние HR недавних тренировок (≥ 30 мин)
 *
 * Эвристика: 95-й перцентиль среднего HR из этих сессий — приближение к LTHR.
 */
export function estimateLthrFromHistory(sessionAvgHrs: readonly number[]): LthrEstimate {
  const valid = sessionAvgHrs.filter((h) => h > 0 && Number.isFinite(h));
  if (valid.length === 0) {
    return { bpm: null, confidence: 'low', sessionsUsed: 0 };
  }
  const sorted = [...valid].sort((a, b) => a - b);
  const p95Idx = Math.floor(sorted.length * 0.95);
  const bpm = Math.round(sorted[Math.min(sorted.length - 1, p95Idx)]);

  const confidence: LthrEstimate['confidence'] =
    valid.length >= 10 ? 'high' : valid.length >= 5 ? 'medium' : 'low';

  return { bpm, confidence, sessionsUsed: valid.length };
}

/**
 * LTHR pace оценивается аналогично — 95-й перцентиль среднего темпа
 * (быстрых тренировок). Но темп — обратная величина (меньше = быстрее),
 * поэтому берём 5-й перцентиль (нижние 5% самых быстрых средних темпов).
 */
export function estimateLthrPaceFromHistory(
  sessionAvgPaceMinKm: readonly number[],
): { paceMinKm: number | null; confidence: LthrEstimate['confidence']; sessionsUsed: number } {
  const valid = sessionAvgPaceMinKm.filter((p) => p > 0 && Number.isFinite(p));
  if (valid.length === 0) {
    return { paceMinKm: null, confidence: 'low', sessionsUsed: 0 };
  }
  const sorted = [...valid].sort((a, b) => a - b);
  const p5Idx = Math.floor(sorted.length * 0.05);
  const paceMinKm = sorted[Math.min(sorted.length - 1, p5Idx)];

  const confidence =
    valid.length >= 10 ? 'high' : valid.length >= 5 ? 'medium' : 'low';

  return { paceMinKm, confidence, sessionsUsed: valid.length };
}
