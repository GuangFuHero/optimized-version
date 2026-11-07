'use client';

import {
  GetStationsDocument,
  GetAdminMapTicketsDocument,
} from '@rescue-frontend/data-access';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useStore } from 'zustand';

import type { RescueMapMarkerItem } from '../types';
import { designTokens } from '@rescue-frontend/ui';
import { ADMIN_MAP_PRIORITIES } from './map-filter';
import { siteGraphql, SITE_READ_OPTIONS } from '../../session/site-clients';
import {
  dedupeMarkersById,
  mapStationToMarker,
  mapTicketToMarker,
  toBoundsInput,
} from '../site/markers';
import type { SiteMapViewportStore } from '../site/use-site-map-viewport-state';

const { color } = designTokens;

export const ADMIN_MAP_LIVE_QUERY_LIMIT = 200;

/**
 * How a marker is drawn on 互助地圖 (prototype `map-canvas.jsx`): a ticket is a dot in its
 * priority's colour, a station a dark square with its type's icon, and hovering either names it.
 * The pins are the legend's: a 生命危急 ticket is found by its red.
 */
export function toAdminMapPin(
  marker: RescueMapMarkerItem,
): RescueMapMarkerItem {
  if (marker.detailType === 'station') {
    return {
      ...marker,
      pin: { shape: 'station', color: color.fg.neutral.default },
      tooltip: { title: marker.title, subtitle: marker.subtitle || undefined },
    };
  }

  const priority = marker.ticketMeta?.priority?.trim().toLowerCase();
  const teams = marker.ticketMeta?.responsibleTeams
    ?.map((team) => team.name)
    .join('、');

  return {
    ...marker,
    pin: {
      shape: 'dot',
      color:
        ADMIN_MAP_PRIORITIES.find((entry) => entry.value === priority)?.color ??
        color.bg.info.default,
    },
    tooltip: { title: marker.title, subtitle: teams || undefined },
  };
}
const NO_MARKERS: readonly RescueMapMarkerItem[] = [];

/**
 * Tickets and stations inside the map's view, both at once: unlike the public map, which shows one
 * kind at a time, 互助地圖 lays them side by side. Read again whenever the view moves; the last view's
 * stay up meanwhile. Either kind that fails to load is left off, the other kept.
 */
export function useAdminMapLiveMarkers(
  viewportStore: SiteMapViewportStore,
): readonly RescueMapMarkerItem[] {
  const viewport = useStore(viewportStore);
  // No view yet: the map reports one once it has laid itself out.
  const bounds = toBoundsInput(viewport);
  const zoom = viewport.position?.zoom;
  const { data } = useQuery({
    ...SITE_READ_OPTIONS,
    queryKey: ['admin-map', 'markers', { bounds, zoom }],
    queryFn: async ({ signal }) => {
      const [tickets, stations] = await Promise.all([
        siteGraphql(
          GetAdminMapTicketsDocument,
          { bounds, skip: 0, limit: ADMIN_MAP_LIVE_QUERY_LIMIT, zoom },
          signal,
        ).then(
          ({ tickets }) =>
            tickets.items.map((ticket) => {
              const marker = mapTicketToMarker(ticket);

              return marker
                ? toAdminMapPin({
                    ...marker,
                    ticketMeta: {
                      ...marker.ticketMeta,
                      responsibleTeams: ticket.responsibleTeams,
                    },
                  })
                : null;
            }),
          () => [],
        ),
        siteGraphql(
          GetStationsDocument,
          { bounds, skip: 0, limit: ADMIN_MAP_LIVE_QUERY_LIMIT },
          signal,
        ).then(
          ({ stations }) =>
            stations.items.map((station) => {
              const marker = mapStationToMarker(station);

              return marker ? toAdminMapPin(marker) : null;
            }),
          () => [],
        ),
      ]);

      return dedupeMarkersById(
        [...tickets, ...stations].filter(
          (marker): marker is RescueMapMarkerItem => Boolean(marker),
        ),
      );
    },
    enabled: Boolean(bounds),
    placeholderData: keepPreviousData,
  });

  return data ?? NO_MARKERS;
}
