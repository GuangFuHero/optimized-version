import type { RescueMapMarkerItem, RescueMapRouteState } from '../types';
import { matchesTicketStatusSelection } from '../../ticket/status';

function normalizeSearchTerm(value?: string): string {
  return value?.trim().toLowerCase() ?? '';
}

function markerMatchesSearch(
  marker: RescueMapMarkerItem,
  searchTerm: string,
): boolean {
  if (!searchTerm) {
    return true;
  }

  return [marker.id, marker.title, marker.subtitle, marker.label]
    .join(' ')
    .toLowerCase()
    .includes(searchTerm);
}

function markerMatchesBbox(
  marker: RescueMapMarkerItem,
  bbox: RescueMapRouteState['bbox'],
): boolean {
  if (!bbox) {
    return true;
  }

  const [minLng, minLat, maxLng, maxLat] = bbox;
  const [lat, lng] = marker.position;

  return lng >= minLng && lng <= maxLng && lat >= minLat && lat <= maxLat;
}

/**
 * 依路由狀態（資料維度、子分類、搜尋、邊界框）過濾地圖標記。
 * 地圖與列表模組共用此函式，確保兩者篩選結果一致。
 */
export function filterRescueMapMarkers(
  markers: readonly RescueMapMarkerItem[],
  routeState?: RescueMapRouteState,
): RescueMapMarkerItem[] {
  if (!routeState) {
    return [...markers];
  }

  const subDataTypeSet = new Set(
    (routeState.subDataTypes ?? []).map((value) => value.toLowerCase()),
  );
  const selectedSubDataTypes = [...subDataTypeSet];
  const searchTerm = normalizeSearchTerm(routeState.search);

  return markers.filter((marker) => {
    if (routeState.dataType && marker.detailType !== routeState.dataType) {
      return false;
    }

    if (subDataTypeSet.size > 0) {
      if (marker.detailType === 'station') {
        const stationType = marker.stationMeta?.type?.trim().toLowerCase();

        if (!stationType || !subDataTypeSet.has(stationType)) {
          return false;
        }
      } else if (
        !matchesTicketStatusSelection(
          marker.ticketMeta?.status,
          selectedSubDataTypes,
        )
      ) {
        return false;
      }
    }

    return (
      markerMatchesSearch(marker, searchTerm) &&
      markerMatchesBbox(marker, routeState.bbox)
    );
  });
}
