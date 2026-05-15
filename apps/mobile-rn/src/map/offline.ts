// Управление offline tile-паками. Скрывает Mapbox.offlineManager.
// ТЗ §10.3 / P1-K-01..05.
// Phase 1 / PHASE1-10 (manual region picker — D-23..D-26).
//
// Стратегия Phase 1:
//   - одна "домашняя зона" 10×10 км, zoom 12-16, скачивается автоматически при первом
//     получении пользовательской позиции (downloadHomeRegion);
//   - произвольный пользовательский регион через RegionPickerScreen → createCustomPack.
//
// КРИТИЧНО: контракт @rnmapbox/maps@10.3.0 OfflineCreatePackOptions внутри делает
// `const [ne, sw] = bounds;` (см. node_modules/@rnmapbox/maps/lib/module/modules/offline/
// OfflineCreatePackOptions.js). Поэтому bounds ВСЕГДА передаётся как [NE-угол, SW-угол],
// никогда наоборот. Этот файл — единственная точка вызова offlineManager.createPack;
// все внешние модули проходят через createCustomPack / downloadHomeRegion.

import { offlineManager } from '@rnmapbox/maps';

const HOME_PACK_NAME = 'home-region';
const HOME_PACK_HALF_SIDE_DEG = 0.05; // ~5.5 км по широте → 10×10км bbox

const DEFAULT_STYLE = 'mapbox://styles/mapbox/outdoors-v12';

/** iOS Mapbox SDK молча режет паки >6000 тайлов. Оставляем 500 запас. См. Pitfall 7. */
export const TILE_CAP_HEADROOM = 5500;

/** Среднее значение KB на vector-tile outdoors-v12 — для прикидки размера пака. */
const AVG_KB_PER_TILE = 30;

export type OfflinePack = {
  name: string;
  bounds: [[number, number], [number, number]];
  state: string;
  percentage: number;
};

/**
 * Скачать tile-пак вокруг указанной точки. Идемпотентно: если уже есть пак
 * с именем `home-region` — пропускает (можно сначала удалить через delete).
 *
 * Делегирует в `createCustomPack`, чтобы порядок bounds жил в одном месте.
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
  const ne: [number, number] = [
    longitude + HOME_PACK_HALF_SIDE_DEG,
    latitude + HOME_PACK_HALF_SIDE_DEG,
  ];
  const sw: [number, number] = [
    longitude - HOME_PACK_HALF_SIDE_DEG,
    latitude - HOME_PACK_HALF_SIDE_DEG,
  ];

  await createCustomPack({
    name: HOME_PACK_NAME,
    ne,
    sw,
    styleUrl: opts.styleUrl,
    minZoom: opts.minZoom,
    maxZoom: opts.maxZoom,
    onProgress: opts.onProgress,
  });
}

/**
 * Скачать произвольный пользовательский пак. Принимает явно помеченные NE / SW углы
 * и сам передаёт их Mapbox SDK в правильном порядке [NE, SW] (см. модульный заголовок).
 *
 * Используется RegionPickerScreen (PHASE1-10) после валидации через estimatePackSize.
 */
export async function createCustomPack(opts: {
  name: string;
  ne: [number, number]; // [lng, lat]
  sw: [number, number]; // [lng, lat]
  styleUrl?: string;
  minZoom?: number;
  maxZoom?: number;
  onProgress?: (percentage: number) => void;
}): Promise<void> {
  await offlineManager.createPack(
    {
      name: opts.name,
      styleURL: opts.styleUrl ?? DEFAULT_STYLE,
      minZoom: opts.minZoom ?? 12,
      maxZoom: opts.maxZoom ?? 16,
      bounds: [opts.ne, opts.sw], // [NE, SW] — verified против OfflineCreatePackOptions._makeLatLngBounds
    },
    (_region, status) => {
      // status.percentage 0..100
      opts.onProgress?.(status.percentage ?? 0);
    },
    (_region, error) => {
      console.error('[offline] custom pack error', error);
    },
  );
}

/**
 * Локальный расчёт количества тайлов и приблизительного веса пака без вызова Mapbox API.
 * `getPackEstimateSize` в @rnmapbox/maps@10.3.0 не существует — считаем сами через
 * формулу Web Mercator (см. RESEARCH.md §Pattern 4).
 *
 * Используется RegionPickerScreen, чтобы зарезать выбор >TILE_CAP_HEADROOM тайлов до
 * того, как мы дёрнем SDK (iOS Mapbox молча режет, а пользователь думает что регион скачан).
 */
export function estimatePackSize(opts: {
  ne: [number, number];
  sw: [number, number];
  minZ?: number;
  maxZ?: number;
}): { tiles: number; kb: number } {
  const { ne, sw, minZ = 12, maxZ = 16 } = opts;
  let tiles = 0;
  for (let z = minZ; z <= maxZ; z++) {
    const n = Math.pow(2, z);
    const x1 = Math.floor(((sw[0] + 180) / 360) * n);
    const x2 = Math.floor(((ne[0] + 180) / 360) * n);
    const latRad1 = (ne[1] * Math.PI) / 180;
    const latRad2 = (sw[1] * Math.PI) / 180;
    const y1 = Math.floor(
      ((1 - Math.log(Math.tan(latRad1) + 1 / Math.cos(latRad1)) / Math.PI) / 2) * n,
    );
    const y2 = Math.floor(
      ((1 - Math.log(Math.tan(latRad2) + 1 / Math.cos(latRad2)) / Math.PI) / 2) * n,
    );
    tiles += Math.abs(x2 - x1 + 1) * Math.abs(y2 - y1 + 1);
  }
  return { tiles, kb: tiles * AVG_KB_PER_TILE };
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
