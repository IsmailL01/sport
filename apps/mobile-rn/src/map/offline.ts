// Управление offline tile-паками. Скрывает Mapbox.offlineManager.
// ТЗ §10.3 / P1-K-01..05.
//
// Стратегия Phase 1: одна "домашняя зона" 10×10 км, zoom 12-16, скачивается
// автоматически при первом получении пользовательской позиции. Manual download
// region UI откладывается на P1-K-04.

import { offlineManager } from '@rnmapbox/maps';

const HOME_PACK_NAME = 'home-region';
const HOME_PACK_HALF_SIDE_DEG = 0.05; // ~5.5 км по широте → 10×10км bbox

const DEFAULT_STYLE = 'mapbox://styles/mapbox/outdoors-v12';

export type OfflinePack = {
  name: string;
  bounds: [[number, number], [number, number]];
  state: string;
  percentage: number;
};

/**
 * Скачать tile-пак вокруг указанной точки. Идемпотентно: если уже есть пак
 * с именем `home-region` — пропускает (можно сначала удалить через delete).
 */
export async function downloadHomeRegion(opts: {
  latitude: number;
  longitude: number;
  styleUrl?: string;
  minZoom?: number;
  maxZoom?: number;
  onProgress?: (percentage: number) => void;
}): Promise<void> {
  const existing = await listOfflinePacks();
  if (existing.some((p) => p.name === HOME_PACK_NAME)) return;

  const { latitude, longitude } = opts;
  const swLon = longitude - HOME_PACK_HALF_SIDE_DEG;
  const swLat = latitude - HOME_PACK_HALF_SIDE_DEG;
  const neLon = longitude + HOME_PACK_HALF_SIDE_DEG;
  const neLat = latitude + HOME_PACK_HALF_SIDE_DEG;

  await offlineManager.createPack(
    {
      name: HOME_PACK_NAME,
      styleURL: opts.styleUrl ?? DEFAULT_STYLE,
      minZoom: opts.minZoom ?? 12,
      maxZoom: opts.maxZoom ?? 16,
      bounds: [
        [swLon, swLat],
        [neLon, neLat],
      ],
    },
    (region, status) => {
      // status.percentage 0..100
      opts.onProgress?.(status.percentage ?? 0);
    },
    (region, error) => {
      console.error('[offline] pack error', error);
    },
  );
}

export async function listOfflinePacks(): Promise<OfflinePack[]> {
  const packs = await offlineManager.getPacks();
  return packs.map((p) => {
    const anyPack = p as unknown as {
      name: string;
      bounds: unknown;
      state?: unknown;
    };
    return {
      name: anyPack.name,
      bounds: (anyPack.bounds as [[number, number], [number, number]]) ?? [
        [0, 0],
        [0, 0],
      ],
      state: String(anyPack.state ?? 'unknown'),
      percentage: 0,
    };
  });
}

export async function deleteOfflinePack(name: string): Promise<void> {
  await offlineManager.deletePack(name);
}

export async function deleteHomeRegion(): Promise<void> {
  await deleteOfflinePack(HOME_PACK_NAME);
}
