// Strava integration — Round 3 scaffold, ревью-фикс R1.
//
// **Без client_secret на устройстве.** Используем PKCE (RFC 7636):
//   - На signIn генерим `code_verifier` (random 43-128 chars) и `code_challenge`
//     (SHA-256(verifier) base64url).
//   - Strava возвращает `code` → backend proxy обменивает на токен.
//   - Refresh-token хранится только на backend; клиент держит access_token
//     с коротким TTL.
//
// Backend endpoints (Round 4+):
//   POST /api/integrations/strava/exchange    { code, codeVerifier, deviceId }
//     → { accessToken, expiresAt, athleteId }
//   POST /api/integrations/strava/refresh     { athleteId, deviceId }
//     → { accessToken, expiresAt }
//
// См. docs/INTEGRATIONS.md §6 и docs/DECISIONS/0003-oauth-providers.md.

import type {
  HealthAdapter,
  HealthPermissionScope,
  HealthPlatform,
  HealthWorkout,
  ImportedWorkout,
} from './HealthAdapter';

type StravaTokens = {
  accessToken: string;
  expiresAtMs: number;
  athleteId: string;
};

const STRAVA_API_BASE = 'https://www.strava.com/api/v3';

export class StravaAdapter implements HealthAdapter {
  private tokens: StravaTokens | null = null;
  private readonly clientId: string;
  /** Backend proxy base. Без него adapter работает в stub-режиме. */
  private readonly backendBase: string;

  constructor(
    clientId: string = process.env.EXPO_PUBLIC_STRAVA_CLIENT_ID ?? '',
    backendBase: string = process.env.EXPO_PUBLIC_API_BASE ?? '',
  ) {
    this.clientId = clientId;
    this.backendBase = backendBase;
  }

  platform(): HealthPlatform {
    return 'strava';
  }

  async isAvailable(): Promise<boolean> {
    // Требуется client_id (для OAuth-запроса) + backendBase (для exchange/refresh).
    // client_secret НЕ нужен — он живёт только на сервере (см. PKCE flow).
    return this.clientId !== '' && this.backendBase !== '';
  }

  async requestPermissions(_scopes: HealthPermissionScope[]): Promise<boolean> {
    if (!(await this.isAvailable())) return false;
    // В реальной реализации Round 4:
    //   1. generatePkcePair() → { verifier, challenge }
    //   2. expo-auth-session с Strava OAuth + code_challenge
    //   3. user redirects → callback URL → code
    //   4. POST {backendBase}/integrations/strava/exchange { code, codeVerifier, deviceId }
    //      → backend меняет code+secret+verifier у Strava на token, отдаёт нам access only
    //   5. сохраняем tokens в SecureStore
    // Сейчас — stub.
    console.warn('[Strava] requestPermissions: stub (no UI yet). См. ADR-0003.');
    return false;
  }

  async grantedScopes(): Promise<HealthPermissionScope[]> {
    return this.tokens === null ? [] : ['read-workouts'];
  }

  /** Strava не принимает workout push — только pull. */
  async writeWorkout(_workout: HealthWorkout): Promise<void> {
    return;
  }

  async readWorkouts(sinceMs: number): Promise<ImportedWorkout[]> {
    return this.pullSince(sinceMs);
  }

  async pullSince(sinceMs: number | null): Promise<ImportedWorkout[]> {
    if (this.tokens === null) return [];
    if (Date.now() >= this.tokens.expiresAtMs) {
      const refreshed = await this.refreshViaBackend();
      if (!refreshed) return [];
    }

    const after = sinceMs !== null ? Math.floor(sinceMs / 1000) : 0;
    try {
      const resp = await fetch(
        `${STRAVA_API_BASE}/athlete/activities?after=${after}&per_page=50`,
        { headers: { Authorization: `Bearer ${this.tokens.accessToken}` } },
      );
      if (!resp.ok) {
        console.warn('[Strava] pullSince HTTP', resp.status);
        return [];
      }
      const raw = (await resp.json()) as Array<Record<string, unknown>>;
      return raw.map((r) => activityToImported(r)).filter((x): x is ImportedWorkout => x !== null);
    } catch (e) {
      console.warn('[Strava] pullSince failed', e);
      return [];
    }
  }

  /**
   * Обновить access_token через backend-proxy.
   *
   * Refresh_token остаётся на сервере — клиент знает только текущий
   * access_token и athleteId. Это закрывает risk утечки refresh_token
   * через декомпиляцию мобильного бандла.
   */
  private async refreshViaBackend(): Promise<boolean> {
    if (this.tokens === null) return false;
    try {
      const resp = await fetch(`${this.backendBase}/integrations/strava/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ athleteId: this.tokens.athleteId }),
      });
      if (!resp.ok) return false;
      const data = (await resp.json()) as {
        accessToken: string;
        expiresAtMs: number;
      };
      this.tokens = {
        ...this.tokens,
        accessToken: data.accessToken,
        expiresAtMs: data.expiresAtMs,
      };
      return true;
    } catch (e) {
      console.warn('[Strava] refreshViaBackend failed', e);
      return false;
    }
  }
}

function activityToImported(a: Record<string, unknown>): ImportedWorkout | null {
  const id = a.id;
  const startStr = a.start_date as string | undefined;
  const movingTime = a.moving_time as number | undefined;
  const distance = a.distance as number | undefined;
  const type = (a.type as string | undefined) ?? 'Workout';
  if (id === undefined || typeof startStr !== 'string' || movingTime === undefined) return null;
  const startedAt = Date.parse(startStr);
  if (!Number.isFinite(startedAt)) return null;
  const sourceUuid = `strava-${id}`;
  return {
    externalId: sourceUuid,
    startedAt,
    endedAt: startedAt + movingTime * 1000,
    distanceM: typeof distance === 'number' ? distance : 0,
    calories: typeof a.calories === 'number' ? a.calories : null,
    avgHrBpm: typeof a.average_heartrate === 'number' ? a.average_heartrate : null,
    activityType: stravaTypeToActivity(type),
    source: 'strava',
    sourceUuid,
  };
}

function stravaTypeToActivity(t: string): HealthWorkout['activityType'] {
  const s = t.toLowerCase();
  if (s.includes('run')) return 'running';
  if (s.includes('walk') || s.includes('hike')) return 'walking';
  if (s.includes('ride') || s.includes('cycl')) return 'cycling';
  return 'other';
}
