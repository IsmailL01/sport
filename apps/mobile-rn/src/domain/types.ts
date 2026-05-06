// Доменная модель прототипа Phase 0.
// Идентична Flutter (см. apps/mobile_flutter/lib/src/domain/types.dart).
// В Phase 1 эти типы переедут в общий пакет, см. ТЗ §4.2.

export type RawPoint = {
  /** Unix epoch milliseconds */
  timestamp: number;
  latitude: number;
  longitude: number;
  /** Метры над эллипсоидом WGS84, null если устройство не предоставило */
  altitude: number | null;
  /** Горизонтальная точность в метрах, null если неизвестна */
  accuracy: number | null;
  /** м/с, null если неизвестна */
  speed: number | null;
  /** Курс в градусах от севера по часовой, null если неизвестен */
  heading: number | null;
};

export type ActivityState = 'idle' | 'recording' | 'stopped';

export type Session = {
  id: string;
  startedAt: number;
  endedAt: number | null;
  pointCount: number;
};
