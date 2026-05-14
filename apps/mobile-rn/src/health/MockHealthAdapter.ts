// In-memory health adapter — для тестов и dev preview без native dep.
// Phase 7 / P7-A-01..03.

import type {
  HealthAdapter,
  HealthPermissionScope,
  HealthPlatform,
  HealthWorkout,
  ImportedWorkout,
} from './HealthAdapter';

export class MockHealthAdapter implements HealthAdapter {
  private granted = new Set<HealthPermissionScope>();
  private writes = new Map<string, HealthWorkout>();
  private fakeImports: ImportedWorkout[] = [];

  /** Добавить fake imports — для тестов сценария "пользователь связал часы". */
  seedImports(imports: ImportedWorkout[]): void {
    this.fakeImports = [...imports];
  }

  /** Узнать, что было записано (для проверок в тестах). */
  written(): HealthWorkout[] {
    return Array.from(this.writes.values());
  }

  platform(): HealthPlatform {
    return 'mock';
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async requestPermissions(scopes: HealthPermissionScope[]): Promise<boolean> {
    for (const s of scopes) this.granted.add(s);
    return true;
  }

  async grantedScopes(): Promise<HealthPermissionScope[]> {
    return Array.from(this.granted);
  }

  async writeWorkout(workout: HealthWorkout): Promise<void> {
    if (!this.granted.has('write-workouts')) {
      throw new Error('write-workouts scope not granted');
    }
    this.writes.set(workout.externalId, workout);
  }

  async readWorkouts(sinceMs: number): Promise<ImportedWorkout[]> {
    if (!this.granted.has('read-workouts')) {
      throw new Error('read-workouts scope not granted');
    }
    return this.fakeImports.filter((w) => w.endedAt >= sinceMs);
  }

  async pullSince(sinceMs: number | null): Promise<ImportedWorkout[]> {
    if (!this.granted.has('read-workouts')) {
      throw new Error('read-workouts scope not granted');
    }
    const list = sinceMs === null
      ? this.fakeImports
      : this.fakeImports.filter((w) => w.endedAt >= sinceMs);
    return [...list].sort((a, b) => a.startedAt - b.startedAt);
  }
}
