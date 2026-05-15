// Типы для RegionPickerOverlay — вынесены в отдельный модуль, чтобы внешний
// `RegionPickerScreen` мог их использовать БЕЗ импорта файла, который тянет
// `@rnmapbox/maps`. См. CLAUDE.md, ТЗ §3 принцип 10.

export type CornerCoord = [number, number]; // [lng, lat]

export type Corner = 'ne' | 'sw' | 'nw' | 'se';
