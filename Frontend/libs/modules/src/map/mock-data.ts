import type { RescueMapMarkerItem } from './types';

export const RESCUE_MAP_MARKERS: RescueMapMarkerItem[] = [
  {
    id: 'inc-4022',
    title: 'INC-4022',
    subtitle: '緊急任務',
    position: [23.892, 121.004],
    label: 'INC-4022',
    variant: 'urgent-ticket',
    detailType: 'ticket',
    requiredVolunteers: 2,
    matchedVolunteers: 0,
  },
  {
    id: 'inc-4019',
    title: 'INC-4019',
    subtitle: '處理中任務',
    position: [23.879, 120.991],
    label: 'INC-4019',
    variant: 'in-progress',
    detailType: 'ticket',
    requiredVolunteers: 2,
    matchedVolunteers: 1,
  },
  {
    id: 'st-alpha',
    title: 'ST-Alpha',
    subtitle: '活躍站點',
    position: [23.868, 121.022],
    label: 'ST-Alpha',
    variant: 'resource-station',
    detailType: 'station',
  },
  {
    id: 'bridge-shelter',
    title: '橋街避難所',
    subtitle: '臨時避難位置',
    position: [23.902, 120.999],
    label: '橋街避難所',
    variant: 'pinned-location',
    detailType: 'station',
  },
  {
    id: 'sector-4-checkpoint',
    title: '第4區檢查站',
    subtitle: '區域管制點',
    position: [23.858, 120.985],
    label: '第4區檢查站',
    variant: 'pinned-location',
    detailType: 'station',
  },
];

const RESCUE_MAP_MARKERS_STORAGE_KEY = 'rescue-site:markers';

function isRescueMapMarkerItem(value: unknown): value is RescueMapMarkerItem {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const marker = value as Partial<RescueMapMarkerItem>;

  return (
    typeof marker.id === 'string' &&
    typeof marker.title === 'string' &&
    typeof marker.subtitle === 'string' &&
    typeof marker.label === 'string' &&
    Array.isArray(marker.position) &&
    marker.position.length === 2 &&
    typeof marker.position[0] === 'number' &&
    typeof marker.position[1] === 'number' &&
    (marker.variant === 'urgent-ticket' ||
      marker.variant === 'in-progress' ||
      marker.variant === 'resource-station' ||
      marker.variant === 'pinned-location') &&
    (marker.detailType === 'ticket' || marker.detailType === 'station')
  );
}

export function readRescueMapMarkers(): RescueMapMarkerItem[] {
  if (typeof window === 'undefined') {
    return [...RESCUE_MAP_MARKERS];
  }

  const storedValue = window.localStorage.getItem(RESCUE_MAP_MARKERS_STORAGE_KEY);

  if (!storedValue) {
    return [...RESCUE_MAP_MARKERS];
  }

  try {
    const parsed = JSON.parse(storedValue);

    if (!Array.isArray(parsed)) {
      return [...RESCUE_MAP_MARKERS];
    }

    return parsed.filter(isRescueMapMarkerItem);
  } catch {
    return [...RESCUE_MAP_MARKERS];
  }
}

export function writeRescueMapMarkers(markers: readonly RescueMapMarkerItem[]) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(
    RESCUE_MAP_MARKERS_STORAGE_KEY,
    JSON.stringify(markers),
  );
}

export function deleteRescueMapMarker(markerId: string) {
  const nextMarkers = readRescueMapMarkers().filter((marker) => marker.id !== markerId);

  writeRescueMapMarkers(nextMarkers);

  return nextMarkers;
}
