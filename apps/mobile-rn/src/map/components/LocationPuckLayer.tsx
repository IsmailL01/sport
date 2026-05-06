// Пульсирующая точка положения пользователя (location puck).
// Скрывает Mapbox.LocationPuck за нашим API.

import { LocationPuck } from '@rnmapbox/maps';

export function LocationPuckLayer() {
  return (
    <LocationPuck
      puckBearingEnabled
      pulsing={{ isEnabled: true }}
    />
  );
}
