// Доменная модель.
// Phase 0: только RawPoint. Phase 1 (этот файл): + Session, Track, Stats, Pause.
// Phase 2+ (см. ТЗ §4.2): + Activity, Athlete, Lap, SensorReading, Workout, Zone.

/**
 * Сырая точка — то что отдаёт сенсор гео-позиции до прохождения pipeline.
 * Источник: GPS-чип телефона, в Phase 5+ — также часы (через BLE).
 */
export type RawPoint = {
  /** Unix epoch milliseconds. */
  timestamp: number;
  latitude: number;
  longitude: number;
  /** Метры над эллипсоидом WGS84, null если устройство не предоставило. */
  altitude: number | null;
  /** Горизонтальная точность в метрах, null если неизвестна. */
  accuracy: number | null;
  /** м/с, null если неизвестна. */
  speed: number | null;
  /** Курс в градусах от севера по часовой, null если неизвестен. */
  heading: number | null;
};

/**
 * Точка после прохождения pipeline (см. ТЗ §4.3).
 * `source` помечает, какой шаг pipeline её сгенерировал — для отладки и
 * различения raw / kalman-сглаженных / interpolated точек.
 */
export type Point = RawPoint & {
  source: 'raw' | 'kalman' | 'interpolated';
};

/**
 * Состояние записи активности (UI-уровень).
 * Полная state-машина из P1-J-01 — Phase 1: Idle / Recording / Paused / Stopping / Saved / Discarded.
 * Сейчас упрощённая (Phase 0 наследие): idle / recording / stopped.
 * TODO: расширить под полную state-машину когда понадобится pause/discard разделение.
 */
export type ActivityState = 'idle' | 'recording' | 'stopped';

/**
 * Метаданные одной сессии пробежки. Хранится в SQLite, см. P1-A-07.
 */
export type Session = {
  /** Unix epoch ms на момент Start. Также используется как session_id в БД. */
  id: number;
  startedAt: number;
  /** null пока не вызвали Stop. */
  endedAt: number | null;
  /** Замкнут ли итоговый трек (см. ТЗ §6.5). null если ещё не считали. */
  isClosed: boolean | null;
  /** Накопительная дистанция в метрах. null до первой точки. */
  distanceM: number | null;
  /** Площадь в м², null если трек не замкнут или сессия идёт. */
  areaM2: number | null;
  /**
   * Метод расчёта площади: 'shoelace_simple' / 'shoelace_with_warning' / 'corridor'.
   * Phase 0 — всегда 'shoelace_simple'.
   */
  calcMethod: 'shoelace_simple' | 'shoelace_with_warning' | 'corridor' | null;
  /** Произвольная заметка пользователя, опционально (P1-J-04). */
  note: string | null;
};

/**
 * Геометрия трека — для кода удобнее работать со списком точек, а в БД они
 * хранятся как time-series, привязанные к session_id.
 */
export type Track = {
  sessionId: number;
  points: Point[];
};

/**
 * Live-статистика, вычисляемая по точкам без хранения в БД (derived).
 * См. ТЗ §6.3 (скорость в скользящем окне), §6.6 (площадь).
 */
export type Stats = {
  distanceM: number;
  /** Текущая скорость в м/с (среднее за последние 10с). */
  currentSpeedMs: number;
  /** Темп min/km, null если speed < 0.5 м/с. */
  paceMinKm: number | null;
  isClosed: boolean;
  areaM2: number | null;
};

/**
 * Пауза — для авто-паузы (ТЗ §6.4) и ручной паузы.
 * `auto: true` если pipeline решил остановить запись на основе скорости.
 */
export type Pause = {
  startedAt: number;
  /** null пока пауза не закончена. */
  endedAt: number | null;
  auto: boolean;
};
