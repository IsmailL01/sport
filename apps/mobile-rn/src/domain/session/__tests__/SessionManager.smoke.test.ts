// Co-located smoke test для SessionManager (PHASE1-07 / Task 2).
// Имя `.smoke.test.ts` (не просто `.test.ts`) выбрано чтобы избежать конфликта
// basename с `src/__tests__/SessionManager.test.ts` — Jest может неконсистентно
// резолвить дубликаты в разных запусках/CI.
// Этот файл доказывает: domain-модуль SessionManager импортируется без подтаскивания
// `expo-sqlite`/`zustand`/`@rnmapbox/maps` — pure-domain layering работает.

import { SessionManager } from '../SessionManager';

describe('SessionManager (smoke)', () => {
  it('exports a SessionManager class', () => {
    expect(SessionManager).toBeDefined();
    expect(typeof SessionManager).toBe('function');
  });
});
