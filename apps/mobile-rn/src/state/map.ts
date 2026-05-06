import { create } from 'zustand';

/**
 * Состояние карты — не персистится между запусками (в отличие от Settings).
 * Сюда попадает то что относится к текущей сессии просмотра карты:
 * камера, follow-user режим, текущая тема рендера.
 */

export type MapTheme = 'light' | 'dark';

type MapStore = {
  theme: MapTheme;
  /** Следует ли камера за позицией пользователя (отключается при ручном панорамировании). */
  followUser: boolean;

  setTheme: (theme: MapTheme) => void;
  setFollowUser: (followUser: boolean) => void;
  toggleFollowUser: () => void;
};

export const useMapStore = create<MapStore>((set) => ({
  theme: 'dark',
  followUser: true,

  setTheme: (theme) => set({ theme }),
  setFollowUser: (followUser) => set({ followUser }),
  toggleFollowUser: () => set((s) => ({ followUser: !s.followUser })),
}));
