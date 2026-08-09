import {
  GetStationDocument,
  GetTicketDocument,
  StationFieldsFragmentDoc,
  TicketFieldsFragmentDoc,
  createUrqlClient,
  useFragment,
  type GetStationQuery,
  type GetTicketQuery,
} from '@rescue-frontend/data-access';

import { SITE_FALLBACK_BASE_LAYER, SITE_FALLBACK_DATA_TYPE } from '../route/constants';
import { createSiteHref } from '../route/serialize';
import type { SiteModule, SiteRouteState } from '../route/types';
import { getStationTypeLabel } from '../station/type-options';
import { formatTicketStatusLabel } from '../ticket/status';
import type { PointShareTarget } from './types';

type PointShareMarker = {
  id: string;
  title: string;
  subtitle: string;
  detailType: 'station' | 'ticket';
};

const SHARE_QUERY_CONTEXT = {
  requestPolicy: 'network-only' as const,
  suspense: false,
};

function resolveDataType(marker: PointShareMarker) {
  return marker.detailType === 'ticket' ? 'ticket' : 'station';
}

function resolveTicketLabel(status?: string | null) {
  return formatTicketStatusLabel(status, '救災任務');
}

function toPointShareMarkerFromStation(
  stationRef: GetStationQuery['station'],
): PointShareMarker | null {
  if (!stationRef) {
    return null;
  }

  const station = useFragment(StationFieldsFragmentDoc, stationRef);
  const title =
    station.name?.trim() || station.propertyName?.trim() || station.uuid;
  const subtitle =
    station.description?.trim() ||
    station.opHour?.trim() ||
    getStationTypeLabel(station.type);

  return {
    id: station.uuid,
    title,
    subtitle,
    detailType: 'station',
  };
}

function toPointShareMarkerFromTicket(
  ticketRef: GetTicketQuery['ticket'],
): PointShareMarker | null {
  if (!ticketRef) {
    return null;
  }

  const ticket = useFragment(TicketFieldsFragmentDoc, ticketRef);
  const title =
    ticket.title.trim() || ticket.propertyName?.trim() || ticket.uuid;
  const subtitle =
    ticket.description?.trim() ||
    ticket.taskType?.trim() ||
    resolveTicketLabel(ticket.status);

  return {
    id: ticket.uuid,
    title,
    subtitle,
    detailType: 'ticket',
  };
}

function buildRouteStateFromRoute({
  module,
  segments,
  selectedMarkerId,
}: {
  module: SiteModule;
  segments: readonly string[];
  selectedMarkerId?: string;
}): SiteRouteState {
  const dataTypeSegment = module === 'map' ? segments[1] : segments[0];

  return {
    baseLayer:
      module === 'map'
        ? (segments[0] as SiteRouteState['baseLayer'])
        : undefined,
    dataType:
      (dataTypeSegment as SiteRouteState['dataType']) ?? SITE_FALLBACK_DATA_TYPE,
    selectedMarkerId,
    subDataTypes: [],
  };
}

async function fetchPointShareMarker({
  dataType,
  markerId,
}: {
  dataType: SiteRouteState['dataType'];
  markerId: string;
}): Promise<PointShareMarker | null> {
  const client = createUrqlClient({
    runtime: 'server',
    requestPolicy: 'network-only',
    suspense: false,
  });

  if (dataType === 'ticket') {
    const result = await client
      .query(GetTicketDocument, { uuid: markerId }, SHARE_QUERY_CONTEXT)
      .toPromise();

    if (result.error) {
      return null;
    }

    return toPointShareMarkerFromTicket(result.data?.ticket ?? null);
  }

  const result = await client
    .query(GetStationDocument, { uuid: markerId }, SHARE_QUERY_CONTEXT)
    .toPromise();

  if (result.error) {
    return null;
  }

  return toPointShareMarkerFromStation(result.data?.station ?? null);
}

export function createPointShareTarget({
  marker,
  module,
  state,
  origin,
}: {
  marker: PointShareMarker;
  module: SiteModule;
  state: SiteRouteState;
  origin: string;
}): PointShareTarget {
  const href = createSiteHref(module, {
    ...state,
    baseLayer: state.baseLayer ?? SITE_FALLBACK_BASE_LAYER,
    dataType: resolveDataType(marker),
    subDataTypes: [],
    selectedMarkerId: marker.id,
  });
  const title = `${marker.title}｜${marker.detailType === 'ticket' ? '救災任務' : '救災站點'}`;

  return {
    title,
    description: marker.subtitle,
    url: new URL(href, origin).toString(),
  };
}

export function resolvePointShareTargetFromState({
  module,
  state,
  origin,
  markers,
}: {
  module: SiteModule;
  state: SiteRouteState;
  origin: string;
  markers?: readonly PointShareMarker[];
}): PointShareTarget | null {
  if (!state.selectedMarkerId || !markers) {
    return null;
  }

  const marker = markers.find((item) => item.id === state.selectedMarkerId);

  if (!marker) {
    return null;
  }

  return createPointShareTarget({
    marker,
    module,
    state,
    origin,
  });
}

export async function resolvePointShareTargetFromRoute({
  module,
  segments,
  searchParams,
  origin,
}: {
  module: SiteModule;
  segments: readonly string[];
  searchParams: Record<string, string | string[] | undefined>;
  origin: string;
}): Promise<PointShareTarget | null> {
  const selectedId = searchParams.id;
  const selectedMarkerId = Array.isArray(selectedId)
    ? selectedId[0]
    : selectedId;

  if (!selectedMarkerId) {
    return null;
  }

  const state = buildRouteStateFromRoute({
    module,
    segments,
    selectedMarkerId,
  });
  const marker = await fetchPointShareMarker({
    dataType: state.dataType,
    markerId: selectedMarkerId,
  });

  if (!marker) {
    return null;
  }

  return createPointShareTarget({
    marker,
    module,
    state,
    origin,
  });
}
