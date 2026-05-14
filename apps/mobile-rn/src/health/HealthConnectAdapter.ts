// Android Health Connect adapter (референс implementation для Phase 7.1).
//
// Сейчас — **stub**: на устройствах без `react-native-health-connect` пакета
// все методы безопасно возвращают «недоступно»/empty, чтобы JS-bundle билдился
// и UI corectно показал disabled-state. Реальная нативная связка добавится
// конфиг-плагином `react-native-health-connect` в Phase 7.1 (требует
// dev/preview build, не работает в Expo Go).
//
// Контракт совпадает с HealthAdapter — см. INTEGRATIONS.md.

import type {
  HealthAdapter,
  HealthPermissionScope,
  HealthPlatform,
  HealthWorkout,
  ImportedWorkout,
} from './HealthAdapter';

type HCModule = {
  initialize: () => Promise<boolean>;
  requestPermission: (perms: Array<{ accessType: 'read' | 'write'; recordType: string }>) => Promise<unknown>;
  getGrantedPermissions: () => Promise<Array<{ accessType: string; recordType: string }>>;
  readRecords: (
    recordType: string,
    opts: { timeRangeFilter: { operator: 'between'; startTime: string; endTime: string } },
  ) => Promise<{ records: Array<Record<string, unknown>> }>;
  insertRecords: (records: Array<Record<string, unknown>>) => Promise<unknown>;
};

/** Лениво подгружаем native-модуль; если его нет — adapter в stub-режиме. */
function loadModule(): HCModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('react-native-health-connect') as Partial<HCModule>;
    if (
      typeof mod.initialize === 'function' &&
      typeof mod.requestPermission === 'function' &&
      typeof mod.readRecords === 'function'
    ) {
      return mod as HCModule;
    }
  } catch {
    // package not installed — stub mode
  }
  return null;
}

const SCOPE_TO_RECORD: Record<HealthPermissionScope, { accessType: 'read' | 'write'; recordType: string }> = {
  'read-workouts': { accessType: 'read', recordType: 'ExerciseSession' },
  'write-workouts': { accessType: 'write', recordType: 'ExerciseSession' },
  'read-hr': { accessType: 'read', recordType: 'HeartRate' },
};

export class HealthConnectAdapter implements HealthAdapter {
  private readonly mod: HCModule | null;
  private initialized = false;

  constructor() {
    this.mod = loadModule();
  }

  platform(): HealthPlatform {
    return 'health-connect';
  }

  async isAvailable(): Promise<boolean> {
    if (this.mod === null) return false;
    try {
      if (!this.initialized) {
        this.initialized = await this.mod.initialize();
      }
      return this.initialized;
    } catch {
      return false;
    }
  }

  async requestPermissions(scopes: HealthPermissionScope[]): Promise<boolean> {
    if (this.mod === null) return false;
    if (!(await this.isAvailable())) return false;
    try {
      const perms = scopes.map((s) => SCOPE_TO_RECORD[s]);
      await this.mod.requestPermission(perms);
      const granted = await this.grantedScopes();
      return scopes.every((s) => granted.includes(s));
    } catch (e) {
      console.warn('[HealthConnect] requestPermissions failed', e);
      return false;
    }
  }

  async grantedScopes(): Promise<HealthPermissionScope[]> {
    if (this.mod === null) return [];
    try {
      const list = await this.mod.getGrantedPermissions();
      const out: HealthPermissionScope[] = [];
      for (const [scope, { accessType, recordType }] of Object.entries(SCOPE_TO_RECORD) as Array<
        [HealthPermissionScope, { accessType: 'read' | 'write'; recordType: string }]
      >) {
        if (list.some((p) => p.accessType === accessType && p.recordType === recordType)) {
          out.push(scope);
        }
      }
      return out;
    } catch {
      return [];
    }
  }

  async writeWorkout(workout: HealthWorkout): Promise<void> {
    if (this.mod === null) return;
    if (!(await this.isAvailable())) return;
    try {
      await this.mod.insertRecords([
        {
          recordType: 'ExerciseSession',
          startTime: new Date(workout.startedAt).toISOString(),
          endTime: new Date(workout.endedAt).toISOString(),
          exerciseType: mapActivityToHC(workout.activityType),
          metadata: { clientRecordId: workout.externalId },
        },
      ]);
    } catch (e) {
      console.warn('[HealthConnect] writeWorkout failed', e);
    }
  }

  async readWorkouts(sinceMs: number): Promise<ImportedWorkout[]> {
    return this.pullSince(sinceMs);
  }

  async pullSince(sinceMs: number | null): Promise<ImportedWorkout[]> {
    if (this.mod === null) return [];
    if (!(await this.isAvailable())) return [];
    const granted = await this.grantedScopes();
    if (!granted.includes('read-workouts')) return [];

    const startTime = new Date(sinceMs ?? 0).toISOString();
    const endTime = new Date().toISOString();
    try {
      const { records } = await this.mod.readRecords('ExerciseSession', {
        timeRangeFilter: { operator: 'between', startTime, endTime },
      });
      const out: ImportedWorkout[] = [];
      for (const r of records) {
        const startStr = r.startTime as string | undefined;
        const endStr = r.endTime as string | undefined;
        if (typeof startStr !== 'string' || typeof endStr !== 'string') continue;
        const startedAt = Date.parse(startStr);
        const endedAt = Date.parse(endStr);
        if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt)) continue;
        const meta = (r.metadata as Record<string, unknown> | undefined) ?? {};
        const sourceUuid = (meta.id as string | undefined) ?? (meta.clientRecordId as string | undefined) ?? `hc-${startedAt}`;
        out.push({
          externalId: sourceUuid,
          startedAt,
          endedAt,
          distanceM: numberOr(r.distance, 0),
          calories: numberOrNull(r.energy),
          avgHrBpm: null,
          activityType: mapHCExerciseType(r.exerciseType),
          source: 'health-connect',
          sourceUuid,
        });
      }
      return out.sort((a, b) => a.startedAt - b.startedAt);
    } catch (e) {
      console.warn('[HealthConnect] pullSince failed', e);
      return [];
    }
  }
}

function numberOr(v: unknown, fallback: number): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (v !== null && typeof v === 'object' && 'inMeters' in (v as Record<string, unknown>)) {
    const m = (v as Record<string, unknown>).inMeters;
    if (typeof m === 'number' && Number.isFinite(m)) return m;
  }
  return fallback;
}

function numberOrNull(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (v !== null && typeof v === 'object' && 'inKilocalories' in (v as Record<string, unknown>)) {
    const m = (v as Record<string, unknown>).inKilocalories;
    if (typeof m === 'number' && Number.isFinite(m)) return m;
  }
  return null;
}

function mapActivityToHC(a: HealthWorkout['activityType']): number {
  // ExerciseSessionRecord exerciseType codes (Health Connect SDK).
  switch (a) {
    case 'running': return 56; // RUNNING
    case 'walking': return 79; // WALKING
    case 'cycling': return 8;  // BIKING
    case 'other': return 0;    // OTHER_WORKOUT
  }
}

function mapHCExerciseType(code: unknown): HealthWorkout['activityType'] {
  if (code === 56) return 'running';
  if (code === 79) return 'walking';
  if (code === 8) return 'cycling';
  return 'other';
}
