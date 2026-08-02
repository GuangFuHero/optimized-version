type ReactLeafletModule = typeof import('react-leaflet');
import type {
  RescueMapAdministrativeArea,
  RescueMapClosureArea,
  RescueMapTaskHeatZone,
} from '../../types';

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
      color: '#c2410c',
      fillColor: '#f97316',
      fillOpacity: 0.18,
      opacity: 0.84,
      weight: 2,
      dashArray: '8 4',
    };
  }

  if (normalizedStatus === 'block') {
    return {
      color: '#b91c1c',
      fillColor: '#ef4444',
      fillOpacity: 0.14,
      opacity: 0.78,
      weight: 2,
      dashArray: '6 3',
    };
  }

  return {
    color: '#9a3412',
    fillColor: '#fdba74',
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
            color: '#2563eb',
            fillColor: '#60a5fa',
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
            color: zone.intensity === 'high' ? '#dc2626' : '#f97316',
            fillColor: zone.intensity === 'high' ? '#ef4444' : '#fb923c',
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
