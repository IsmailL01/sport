// MapboxView — единственная точка входа карты в приложении.
// Наружу не утекает ни одного импорта из @rnmapbox/maps — ровно ради этого
// существует папка src/map/ (см. ТЗ §3 принцип 10, §10.6 MapAdapter).
//
// При миграции на MapLibre / native module нужно переписать только эту папку.

import { type ReactNode } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Mapbox, { Camera, MapView } from '@rnmapbox/maps';

import { useSettingsStore, type MapStyle } from '../state/settings';

export type MapboxViewProps = {
  /** Mapbox style URL. Переопределяет настройку пользователя. По умолчанию — берётся из settings.mapStyle. */
  styleUrl?: string;
  /** Если true — камера следует за пользователем (zoom = 16 по умолчанию). */
  followUserLocation?: boolean;
  followZoomLevel?: number;
  /** Произвольное содержимое (наши Layer-компоненты из ./components/). */
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

const STYLE_URLS: Record<MapStyle, string> = {
  streets: 'mapbox://styles/mapbox/streets-v12',
  outdoors: 'mapbox://styles/mapbox/outdoors-v12',
  satellite: 'mapbox://styles/mapbox/satellite-streets-v12',
};

export function MapboxView({
  styleUrl,
  followUserLocation = true,
  followZoomLevel = 16,
  children,
  style,
}: MapboxViewProps) {
  const mapStyle = useSettingsStore((s) => s.mapStyle);
  const resolved = styleUrl ?? STYLE_URLS[mapStyle];
  return (
    <MapView
      style={[styles.map, style]}
      styleURL={resolved}
      compassEnabled
      scaleBarEnabled={false}
      attributionEnabled
      logoEnabled
    >
      <Camera
        followUserLocation={followUserLocation}
        followZoomLevel={followZoomLevel}
      />
      {children}
    </MapView>
  );
}

/**
 * Установить Mapbox access token. Должно вызываться один раз при старте приложения.
 * Возвращает строку с ошибкой если что-то пошло не так (для UI), null если всё ок.
 */
export function setMapboxAccessToken(token: string): string | null {
  if (!token) return 'EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN не задан';
  try {
    Mapbox.setAccessToken(token);
    return null;
  } catch (e) {
    return `Mapbox.setAccessToken упал: ${(e as Error)?.message ?? String(e)}`;
  }
}

const styles = StyleSheet.create({
  map: { flex: 1 },
});
