// Force-update banner state. Phase 1 / REL-02.
//
// In-memory Zustand store (НЕ persist в MMKV): сервер пере-выдаёт 426 на каждом
// запросе после установки обновлённого binary, поэтому в persist'е нет смысла
// — at-rest состояние "required: true" между сессиями было бы устаревшим.
//
// Источник true для required: apiClient.ts перехватывает HTTP 426 и вызывает
// useForceUpdateStore.getState().set({required:true, ...}). Подписчики:
//   - src/ui/screens/ForceUpdateScreen.tsx (полноэкранная блокирующая Modal).
//
// reset() — для тестов и для ручного снятия (если когда-нибудь добавим
// "force update" debug-toggle в admin-UI).

import { create } from 'zustand';

type ForceUpdateState = {
  required: boolean;
  minVersion: string;
  forceUpdateUrl: string;
};

type ForceUpdatePatch = Partial<ForceUpdateState>;

type ForceUpdateStore = ForceUpdateState & {
  set: (patch: ForceUpdatePatch) => void;
  reset: () => void;
};

const INITIAL: ForceUpdateState = {
  required: false,
  minVersion: '',
  forceUpdateUrl: '',
};

export const useForceUpdateStore = create<ForceUpdateStore>((set) => ({
  ...INITIAL,
  set: (patch) => set((s) => ({ ...s, ...patch })),
  reset: () => set(() => ({ ...INITIAL })),
}));
