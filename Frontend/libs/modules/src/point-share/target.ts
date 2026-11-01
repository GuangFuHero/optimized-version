import {
  GetStationDocument,
  GetTicketDocument,
  StationFieldsFragmentDoc,
  TicketFieldsFragmentDoc,
  TicketNeedFieldsFragmentDoc,
  createUrqlClient,
  useFragment,
  type GetStationQuery,
  type GetTicketQuery,
} from '@rescue-frontend/data-access';

import { parseSiteRouteState } from '../route/parse';
import { createSiteHref } from '../route/serialize';
import type { SiteModule, SiteRouteState } from '../route/types';
import type { TicketNeed } from '../ticket/needs/need-claim';
import {
  describeStationForShare,
  describeTicketForShare,
} from './share-description';
import type { PointShareTarget } from './types';

/**
 * What a share is made of. Not a marker's `subtitle`: a ticket says what it needs and a station what
 * it is (`share-description.ts`), the same on the server and in the browser.
 */
type PointShareMarker = {
  id: string;
  title: string;
  detailType: 'station' | 'ticket';
  /** A ticket's needs, when they are known: always on the server, on a list marker in the browser. */
  needs?: readonly TicketNeed[];
  ticketMeta?: { taskType?: string | null };
  stationMeta?: {
    type?: string | null;
    description?: string | null;
    opHour?: string | null;
  };
};

const SHARE_QUERY_CONTEXT = {
  requestPolicy: 'network-only' as const,
  suspense: false,
};

function resolveDataType(marker: PointShareMarker) {
  return marker.detailType === 'ticket' ? 'ticket' : 'station';
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

  return {
    id: station.uuid,
    title,
    detailType: 'station',
    stationMeta: {
      type: station.type,
      description: station.description,
      opHour: station.opHour,
    },
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

  return {
    id: ticket.uuid,
    title,
    detailType: 'ticket',
    // Read here rather than through `readTicketNeeds`, whose module is client-only: this runs in
    // the page's `generateMetadata`. Need names and headcounts reach a guest (ADR-281).
    needs: (ticketRef.tasks ?? []).map((task) =>
      useFragment(TicketNeedFieldsFragmentDoc, task),
    ),
    ticketMeta: { taskType: ticket.taskType },
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
  // The map's own reading, so a link without a base layer still gives the right data type.
  const { baseLayer, dataType } = parseSiteRouteState(
    module,
    segments,
    new URLSearchParams(),
  );

  return { baseLayer, dataType, selectedMarkerId, subDataTypes: [] };
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
    dataType: resolveDataType(marker),
    subDataTypes: [],
    selectedMarkerId: marker.id,
  });
  const title = `${marker.title}｜${marker.detailType === 'ticket' ? '救災任務' : '救災站點'}`;

  return {
    title,
    description:
      marker.detailType === 'ticket'
        ? describeTicketForShare({
            needs: marker.needs,
            taskType: marker.ticketMeta?.taskType,
          })
        : describeStationForShare(marker.stationMeta ?? {}),
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
