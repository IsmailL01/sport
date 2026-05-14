// iOS HealthKit adapter — Round 3 P2 scaffold.
//
// Stub-safe: пытается лениво `require('react-native-health')`; если пакета
// нет (Expo Go или ещё не подключён config plugin) — все методы корректно
// возвращают «недоступно» / empty. Реальная нативная связка добавится в
// Round 4 (требует dev/preview build + Apple Developer entitlements).
//
// Контракт идентичен HealthConnectAdapter — см. docs/INTEGRATIONS.md.

import type {
  HealthAdapter,
  HealthPermissionScope,
  HealthPlatform,
  HealthWorkout,
  ImportedWorkout,
} from './HealthAdapter';

type HKModule = {
  isAvailable: (cb: (err: unknown, ok: boolean) => void) => void;
  initHealthKit: (opts: unknown, cb: (err: unknown) => void) => void;
  getAuthStatus: (
    perms: { permissions: { read: string[]; write: string[] } },
    cb: (err: unknown, result: { permissions: { read: string[]; write: string[] } }) => void,
  ) => void;
  saveWorkout: (
    workout: Record<string, unknown>,
    cb: (err: unknown) => void,
  ) => void;
  getSamples: (
    opts: { startDate: string; endDate: string; type: string },
    cb: (err: unknown, results: Array<Record<string, unknown>>) => void,
  ) => void;
};

function loadModule(): HKModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('react-native-health') as { default?: HKModule } | HKModule;
    const candidate = (mod as { default?: HKModule }).default ?? (mod as HKModule);
    if (
      typeof candidate.initHealthKit === 'function' &&
      typeof candidate.getSamples === 'function'
    ) {
      return candidate;
    }
  } catch {
    // package not installed — stub mode
  }
  return null;
}

const HK_PERMISSIONS = {
  Workout: 'Workout',
  HeartRate: 'HeartRate',
  ActiveEnergyBurned: 'ActiveEnergyBurned',
} as const;

const SCOPE_TO_HK: Record<HealthPermissionScope, { kind: 'read' | 'write'; name: string }> = {
  'read-workouts': { kind: 'read', name: HK_PERMISSIONS.Workout },
  'write-workouts': { kind: 'write', name: HK_PERMISSIONS.Workout },
  'read-hr': { kind: 'read', name: HK_PERMISSIONS.HeartRate },
};

export class HealthKitAdapter implements HealthAdapter {
  private readonly mod: HKModule | null;
  private initialized = false;

  constructor() {
    this.mod = loadModule();
  }

  platform(): HealthPlatform {
    return 'apple-health';
  }

  isAvailable(): Promise<boolean> {
    if (this.mod === null) return Promise.resolve(false);
    return new Promise((resolve) => {
      try {
        this.mod!.isAvailable((err, ok) => {
          if (err !== null && err !== undefined) {
            resolve(false);
            return;
          }
          resolve(ok === true);
        });
      } catch {
        resolve(false);
      }
    });
  }

  async requestPermissions(scopes: HealthPermissionScope[]): Promise<boolean> {
    if (this.mod === null) return false;
    if (!(await this.isAvailable())) return false;
    const read: string[] = [];
    const write: string[] = [];
    for (const s of scopes) {
      const m = SCOPE_TO_HK[s];
      if (m.kind === 'read') read.push(m.name);
      else write.push(m.name);
    }
    return new Promise((resolve) => {
      try {
        this.mod!.initHealthKit({ permissions: { read, write } }, (err) => {
          if (err !== null && err !== undefined) {
            console.warn('[HealthKit] initHealthKit error', err);
            resolve(false);
            return;
          }
          this.initialized = true;
          resolve(true);
        });
      } catch (e) {
        console.warn('[HealthKit] requestPermissions threw', e);
        resolve(false);
      }
    });
  }

  async grantedScopes(): Promise<HealthPermissionScope[]> {
    if (this.mod === null || !this.initialized) return [];
    // HealthKit API не даёт чистый «granted» readback (политика Apple) — после
    // первого успешного `initHealthKit` считаем что scope granted. Если
    // пользователь отозвал доступ в Settings, мы узнаем при первой ошибке.
    return ['read-workouts', 'write-workouts', 'read-hr'];
  }

  async writeWorkout(workout: HealthWorkout): Promise<void> {
    if (this.mod === null || !this.initialized) return;
    return new Promise((resolve) => {
      try {
        this.mod!.saveWorkout(
          {
            activityType: mapActivityToHK(workout.activityType),
            startDate: new Date(workout.startedAt).toISOString(),
            endDate: new Date(workout.endedAt).toISOString(),
            distance: workout.distanceM,
            energyBurned: workout.calories ?? undefined,
            metadata: { HKMetadataKeyExternalUUID: workout.externalId },
          },
          (err) => {
            if (err !== null && err !== undefined) {
              console.warn('[HealthKit] saveWorkout failed', err);
            }
            resolve();
          },
        );
      } catch (e) {
        console.warn('[HealthKit] writeWorkout threw', e);
        resolve();
      }
    });
  }

  async readWorkouts(sinceMs: number): Promise<ImportedWorkout[]> {
    return this.pullSince(sinceMs);
  }

  async pullSince(sinceMs: number | null): Promise<ImportedWorkout[]> {
    if (this.mod === null || !this.initialized) return [];
    const startDate = new Date(sinceMs ?? 0).toISOString();
    const endDate = new Date().toISOString();
    return new Promise((resolve) => {
      try {
        this.mod!.getSamples({ startDate, endDate, type: 'Workout' }, (err, samples) => {
          if (err !== null && err !== undefined) {
            console.warn('[HealthKit] getSamples failed', err);
            resolve([]);
            return;
          }
          const out: ImportedWorkout[] = [];
          for (const s of samples ?? []) {
            const startStr = s.startDate as string | undefined;
            const endStr = s.endDate as string | undefined;
            if (typeof startStr !== 'string' || typeof endStr !== 'string') continue;
            const startedAt = Date.parse(startStr);
            const endedAt = Date.parse(endStr);
            if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt)) continue;
            const uuid = (s.uuid as string | undefined) ?? `hk-${startedAt}`;
            out.push({
              externalId: uuid,
              startedAt,
              endedAt,
              distanceM: numberOr(s.distance, 0),
              calories: numberOrNull(s.calories ?? s.energyBurned),
              avgHrBpm: null,
              activityType: mapHKToActivity(s.activityType),
              source: 'apple-health',
              sourceUuid: uuid,
            });
          }
          out.sort((a, b) => a.startedAt - b.startedAt);
          resolve(out);
        });
      } catch (e) {
        console.warn('[HealthKit] pullSince threw', e);
        resolve([]);
      }
    });
  }
}

function numberOr(v: unknown, fallback: number): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  return fallback;
}

function numberOrNull(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  return null;
}

function mapActivityToHK(a: HealthWorkout['activityType']): string {
  switch (a) {
    case 'running': return 'Running';
    case 'walking': return 'Walking';
    case 'cycling': return 'Cycling';
    case 'other': return 'Other';
  }
}

function mapHKToActivity(code: unknown): HealthWorkout['activityType'] {
  const s = typeof code === 'string' ? code.toLowerCase() : '';
  if (s.includes('run')) return 'running';
  if (s.includes('walk')) return 'walking';
  if (s.includes('cycl') || s.includes('bik')) return 'cycling';
  return 'other';
}
