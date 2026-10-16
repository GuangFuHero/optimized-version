import { designTokens } from '@rescue-frontend/ui';

import type {
  RescueMapAdministrativeArea,
  RescueMapClosureArea,
  RescueMapTaskHeatZone,
} from '../../types';

type ReactLeafletModule = typeof import('react-leaflet');

const { color, primitives } = designTokens;

interface RescueMapGisOverlayLayerProps {
  Circle: ReactLeafletModule['Circle'];
  Polygon: ReactLeafletModule['Polygon'];
  administrativeAreas: readonly RescueMapAdministrativeArea[];
  closureAreas: readonly RescueMapClosureArea[];
  taskHeatZones: readonly RescueMapTaskHeatZone[];
}

function getClosureAreaStyle(status: string) {
  const normalizedStatus = status.trim().toLowerCase();

  if (normalizedStatus === 'dangerous' || normalizedStatus === 'active') {
    return {
      color: color.fg.warning,
      fillColor: color.bg.warning.default,
      fillOpacity: 0.18,
      opacity: 0.84,
      weight: 2,
      dashArray: '8 4',
    };
  }

  if (normalizedStatus === 'block') {
    return {
      color: color.fg.danger,
      fillColor: color.bg.danger.default,
      fillOpacity: 0.14,
      opacity: 0.78,
      weight: 2,
      dashArray: '6 3',
    };
  }

  return {
    color: color.brand.primary.subtle,
    fillColor: primitives.color.orange[200],
    fillOpacity: 0.12,
    opacity: 0.72,
    weight: 2,
    dashArray: '5 4',
  };
}

export function RescueMapGisOverlayLayer({
  Circle,
  Polygon,
  administrativeAreas,
  closureAreas,
  taskHeatZones,
}: RescueMapGisOverlayLayerProps) {
  return (
    <>
      {administrativeAreas.map((area) => (
        <Polygon
          key={area.id}
          positions={area.points}
          pathOptions={{
            color: color.brand.secondary.subtle,
            fillColor: color.brand.secondary.default,
            fillOpacity: 0.14,
            opacity: 0.72,
            weight: 2,
          }}
        />
      ))}

      {taskHeatZones.map((zone) => (
        <Circle
          key={zone.id}
          center={zone.center}
          radius={zone.radius}
          pathOptions={{
            color:
              zone.intensity === 'high'
                ? color.fg.danger
                : color.fg.warning,
            fillColor:
              zone.intensity === 'high'
                ? color.bg.danger.default
                : color.bg.warning.default,
            fillOpacity: zone.intensity === 'high' ? 0.22 : 0.16,
            opacity: zone.intensity === 'high' ? 0.62 : 0.48,
            weight: 1,
          }}
        />
      ))}

      {closureAreas.flatMap((area) =>
        area.polygons.map((polygon, index) => (
          <Polygon
            key={`${area.id}:${index}`}
            positions={polygon}
            pathOptions={getClosureAreaStyle(area.status)}
          />
        )),
      )}
    </>
  );
}
