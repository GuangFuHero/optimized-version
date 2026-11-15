import {
  GetLinkedTicketDocument,
  GetStationDocument,
  GetTicketDocument,
  createGraphqlRequest,
  type GetStationQuery,
  type GetTicketQuery,
} from '@rescue-frontend/data-access';

import {
  linkedTicketUuid,
  resolveLinkedTicket,
} from '../map/site/linked-ticket';
import { parseSiteRouteState } from '../route/parse';
import { createSiteHref } from '../route/serialize';
import type { SiteModule, SiteRouteState } from '../route/types';
import { getBackendGraphqlUrl } from '../server/backend-api-url';
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
    operationalStatus?: string | null;
  };
};

function resolveDataType(marker: PointShareMarker) {
  return marker.detailType === 'ticket' ? 'ticket' : 'station';
}

type GraphqlRequest = ReturnType<typeof createGraphqlRequest>;

function toPointShareMarkerFromStation(
  station: GetStationQuery['station'],
): PointShareMarker | null {
  if (!station) {
    return null;
  }

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
      operationalStatus: station.operationalStatus,
    },
  };
}

function toPointShareMarkerFromTicket(
  ticket: GetTicketQuery['ticket'],
): PointShareMarker | null {
  if (!ticket) {
    return null;
  }

  const title =
    ticket.title.trim() || ticket.propertyName?.trim() || ticket.uuid;

  return {
    id: ticket.uuid,
    title,
    detailType: 'ticket',
    // Read here rather than through `readTicketNeeds`, whose module is client-only: this runs in
    // the page's `generateMetadata`. Need names and headcounts reach a guest (ADR-281).
    needs: ticket.tasks ?? [],
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

/**
 * The ticket a link names, read as the drawer reads it (map/site/linked-ticket): one 重複審核 merged
 * into another is named by that one. The page sets the tab's title itself once the drawer opens, but
 * the metadata from here streams in after it; naming the list instead, it put the tab back to
 * 「救災列表」 on a link to a merged ticket.
 */
export async function fetchTicketShareMarker(
  request: GraphqlRequest,
  uuid: string,
): Promise<PointShareMarker | null> {
  const { ticket } = await request(GetTicketDocument, { uuid });

  if (ticket) {
    return toPointShareMarkerFromTicket(ticket);
  }

  const linked = resolveLinkedTicket(uuid, {
    data: await request(GetLinkedTicketDocument, { uuid }),
  });

  if (linked.kind !== 'replace') {
    return null;
  }

  const merged = await request(GetTicketDocument, { uuid: linked.uuid });

  return toPointShareMarkerFromTicket(merged.ticket);
}

/** A failed read names nothing: the page keeps its own title. */
async function fetchPointShareMarker({
  dataType,
  markerId,
}: {
  dataType: SiteRouteState['dataType'];
  markerId: string;
}): Promise<PointShareMarker | null> {
  const request = createGraphqlRequest({
    url: getBackendGraphqlUrl(),
    cache: 'no-store',
  });

  try {
    if (dataType === 'ticket') {
      const uuid = linkedTicketUuid(markerId);

      return uuid ? await fetchTicketShareMarker(request, uuid) : null;
    }

    const { station } = await request(GetStationDocument, { uuid: markerId });

    return toPointShareMarkerFromStation(station);
  } catch {
    return null;
  }
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
