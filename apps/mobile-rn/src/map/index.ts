// Публичный API карты. Внешний код импортирует ТОЛЬКО из этого модуля
// (или из ./components/). Прямой импорт `@rnmapbox/maps` за пределами src/map/
// запрещён (см. CLAUDE.md, ТЗ §3 принцип 10).

export { MapboxView, setMapboxAccessToken } from './MapboxView';
export { LocationPuckLayer } from './components/LocationPuckLayer';
export { TrackLayer } from './components/TrackLayer';
export { ZoneLayer } from './components/ZoneLayer';
export { CorridorLayer } from './components/CorridorLayer';
export { HistoryTerritoryLayer } from './components/HistoryTerritoryLayer';
export { RegionPickerOverlay, rectanglePolygon } from './components/RegionPickerOverlay';
export type { Corner, CornerCoord } from './components/regionPickerTypes';
export {
  createCustomPack,
  deleteHomeRegion,
  deleteOfflinePack,
  downloadHomeRegion,
  estimatePackSize,
  listOfflinePacks,
  TILE_CAP_HEADROOM,
  type OfflinePack,
} from './offline';
