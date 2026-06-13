'use client';

import type { RescueMapMarkerItem } from '../../types';

type ReactLeafletModule = typeof import('react-leaflet');
type ReactLeafletClusterModule = typeof import('react-leaflet-cluster');
type ClusterTone = 'station' | 'ticket';

interface RescueMapGeoAnnotationLayerProps {
  L: typeof import('leaflet');
  Marker: ReactLeafletModule['Marker'];
  MarkerClusterGroup: ReactLeafletClusterModule['default'];
  items: readonly RescueMapMarkerItem[];
  markerIcons: Record<string, import('leaflet').DivIcon>;
  onMarkerClick: (item: RescueMapMarkerItem) => void;
}

function resolveClusterTone(
  items: readonly RescueMapMarkerItem[],
): ClusterTone {
  const stationCount = items.filter(
    (item) => item.detailType === 'station',
  ).length;

  if (stationCount === 0) {
    return 'ticket';
  }

  if (stationCount === items.length) {
    return 'station';
  }

  return stationCount >= items.length / 2 ? 'station' : 'ticket';
}

function createClusterIcon({
  clusterTone,
  count,
  leaflet,
}: {
  clusterTone: ClusterTone;
  count: number;
  leaflet: typeof import('leaflet');
}): import('leaflet').DivIcon {
  const sizeClass = count < 10 ? 'small' : count < 100 ? 'medium' : 'large';
  const dimension =
    sizeClass === 'small' ? 42 : sizeClass === 'medium' ? 50 : 58;

  return leaflet.divIcon({
    className: 'map-marker-cluster-wrapper',
    html: [
      `<div class="map-marker-cluster map-marker-cluster--${clusterTone} map-marker-cluster--${sizeClass}">`,
      `<span class="map-marker-cluster__count">${count}</span>`,
      '</div>',
    ].join(''),
    iconSize: [dimension, dimension],
    iconAnchor: [dimension / 2, dimension / 2],
  });
}

export function RescueMapGeoAnnotationLayer({
  L,
  Marker,
  MarkerClusterGroup,
  items,
  markerIcons,
  onMarkerClick,
}: RescueMapGeoAnnotationLayerProps) {
  const clusterTone = resolveClusterTone(items);

  return (
    <MarkerClusterGroup
      animate={false}
      animateAddingMarkers={false}
      chunkedLoading
      iconCreateFunction={(cluster: { getChildCount: () => number }) =>
        createClusterIcon({
          clusterTone,
          count: cluster.getChildCount(),
          leaflet: L,
        })
      }
      showCoverageOnHover={false}
      spiderfyOnMaxZoom
    >
      {items.map((item) => (
        <Marker
          key={item.id}
          position={item.position}
          icon={markerIcons[item.id]}
          eventHandlers={{
            click: () => onMarkerClick(item),
          }}
        />
      ))}
    </MarkerClusterGroup>
  );
}
