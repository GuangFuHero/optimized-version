import {
  ClosureAreaFieldsFragmentDoc,
  StationFieldsFragmentDoc,
  TicketFieldsFragmentDoc,
  useFragment,
  type GetClosureAreasQuery,
  type GetStationsQuery,
  type GetTicketsQuery,
  type StationFieldsFragment,
  type TicketFieldsFragment,
} from '@rescue-frontend/data-access';
import type { Geometry, Polygon } from 'geojson';

import type {
  RescueMapClosureArea,
  RescueMapMarkerItem,
} from '../types';
import { getStationTypeLabel } from '../../station/type-options';
import { formatTicketStatusLabel } from '../../ticket/status';
import type { SiteRouteState } from '../../route/types';

export interface BoundsInput {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

export function toBoundsInput(
  state?: SiteRouteState,
): BoundsInput | undefined {
  if (!state?.bbox) {
    return undefined;
  }

  const [minLng, minLat, maxLng, maxLat] = state.bbox;

  return {
    minLat,
    maxLat,
    minLng,
    maxLng,
  };
}

function readPointPosition(
  geometry: {
    type?: string | null;
    coordinates?: [number, number] | null;
  } | null,
): [number, number] | null {
  if (
    !geometry ||
    geometry.type !== 'Point' ||
    !Array.isArray(geometry.coordinates) ||
    geometry.coordinates.length !== 2
  ) {
    return null;
  }

  const [lng, lat] = geometry.coordinates;

  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return null;
  }

  return [lat, lng];
}

function resolveStationVariant(
  station: StationFieldsFragment,
): RescueMapMarkerItem['variant'] {
  const normalizedType = station.type?.trim().toLowerCase();

  if (
    station.isTemporary ||
    normalizedType === 'shelter' ||
    normalizedType === 'evacuation' ||
    normalizedType === 'checkpoint'
  ) {
    return 'pinned-location';
  }

  return 'resource-station';
}

function createStationSubtitle(station: StationFieldsFragment): string {
  const parts = [
    station.description?.trim(),
    station.opHour?.trim() ? `服務時間 ${station.opHour.trim()}` : null,
    typeof station.level === 'number' ? `等級 ${station.level}` : null,
  ].filter(Boolean);

  return parts[0] ?? getStationTypeLabel(station.type);
}

function resolveTicketVariant(
  ticket: TicketFieldsFragment,
): RescueMapMarkerItem['variant'] {
  const normalizedStatus = ticket.status?.trim().toLowerCase();
  const normalizedPriority = ticket.priority?.trim().toLowerCase();

  if (
    normalizedStatus === 'in_progress' ||
    normalizedStatus === 'in-progress' ||
    normalizedStatus === 'processing' ||
    normalizedStatus === 'assigned' ||
    normalizedStatus === 'accepted' ||
    normalizedPriority === 'low' ||
    normalizedPriority === 'medium'
  ) {
    return 'in-progress';
  }

  return 'urgent-ticket';
}

export function dedupeMarkersById(markers: readonly RescueMapMarkerItem[]) {
  const markerById = new Map<string, RescueMapMarkerItem>();

  for (const marker of markers) {
    if (!markerById.has(marker.id)) {
      markerById.set(marker.id, marker);
    }
  }

  return [...markerById.values()];
}

export function mapStationToMarker(
  stationRef: GetStationsQuery['stations']['items'][number],
): RescueMapMarkerItem | null {
  const station = useFragment(StationFieldsFragmentDoc, stationRef);
  const position = readPointPosition(station.geometry as never);

  if (!position) {
    return null;
  }

  const title =
    station.name?.trim() || station.propertyName?.trim() || station.uuid;
  const stationTypeLabel = getStationTypeLabel(station.type);

  return {
    id: station.uuid,
    title,
    subtitle: createStationSubtitle(station),
    position,
    label: stationTypeLabel,
    variant: resolveStationVariant(station),
    detailType: 'station',
    stationMeta: {
      type: station.type,
      name: station.name,
      description: station.description,
      opHour: station.opHour,
      level: station.level,
      comment: station.comment,
      source: station.source,
      visibility: station.visibility,
      verificationStatus: station.verificationStatus,
      confidenceScore: station.confidenceScore,
      isDuplicate: station.isDuplicate,
      isTemporary: station.isTemporary,
      isOfficial: station.isOfficial,
      priorityScore: station.priorityScore,
      createdAt: station.createdAt?.toString() ?? null,
      updatedAt: station.updatedAt?.toString() ?? null,
    },
  };
}

export function mapTicketToMarker(
  ticketRef: GetTicketsQuery['tickets']['items'][number],
): RescueMapMarkerItem | null {
  const ticket = useFragment(TicketFieldsFragmentDoc, ticketRef);
  const position = readPointPosition(ticket.geometry as never);

  if (!position) {
    return null;
  }

  const title =
    ticket.title.trim() || ticket.propertyName?.trim() || ticket.uuid;
  const subtitle =
    ticket.description?.trim() ||
    ticket.taskType?.trim() ||
    ticket.status?.trim() ||
    '救災任務';

  return {
    id: ticket.uuid,
    title,
    subtitle,
    position,
    label: formatTicketStatusLabel(ticket.status, '任務'),
    variant: resolveTicketVariant(ticket),
    detailType: 'ticket',
    ticketMeta: {
      status: ticket.status,
      priority: ticket.priority,
      taskType: ticket.taskType,
      contactName: ticket.contactName,
      contactEmail: ticket.contactEmail,
      contactPhone: ticket.contactPhone,
      createdBy: ticket.createdBy,
      visibility: ticket.visibility,
      verificationStatus: ticket.verificationStatus,
      reviewNote: ticket.reviewNote,
      createdAt: ticket.createdAt?.toString() ?? null,
      updatedAt: ticket.updatedAt?.toString() ?? null,
    },
    requiredVolunteers: 1,
    matchedVolunteers: 0,
  };
}

function convertPolygonCoordinates(coordinates: Polygon['coordinates']) {
  return coordinates.map((ring) =>
    ring.map(([lng, lat]) => [lat, lng] as [number, number]),
  );
}

function readClosureAreaPolygons(
  geometry?: Geometry | null,
): RescueMapClosureArea['polygons'] {
  if (!geometry) {
    return [];
  }

  if (geometry.type === 'Polygon') {
    return [convertPolygonCoordinates(geometry.coordinates)];
  }

  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.map((polygon) =>
      convertPolygonCoordinates(polygon),
    );
  }

  return [];
}

export function mapClosureAreaToOverlay(
  areaRef: GetClosureAreasQuery['closureAreas']['items'][number],
): RescueMapClosureArea | null {
  const area = useFragment(ClosureAreaFieldsFragmentDoc, areaRef);
  const polygons = readClosureAreaPolygons(area.geometry ?? null);

  if (polygons.length === 0) {
    return null;
  }

  return {
    id: area.uuid,
    label: area.propertyName,
    status: area.status,
    informationSource: area.informationSource,
    comment: area.comment,
    polygons,
  };
}

export function closureAreasSignature(
  areas: readonly RescueMapClosureArea[],
): string {
  return areas
    .map((area) => {
      let pointCount = 0;

      area.polygons.forEach((rings) => {
        rings.forEach((ring) => {
          pointCount += ring.length;
        });
      });

      return `${area.id}:${area.status}:${pointCount}`;
    })
    .join('|');
}
