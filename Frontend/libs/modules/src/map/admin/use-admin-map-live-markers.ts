// SPDX-License-Identifier: GPL-3.0-only
'use client';

import {
  adminMapStationsQuery,
  adminMapTicketsQuery,
} from '@rescue-frontend/data-access/admin';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useStore } from 'zustand';

import type { RescueMapMarkerItem } from '../types';
import { designTokens } from '@rescue-frontend/ui';
import { ADMIN_MAP_PRIORITIES } from './map-filter';
import {
  dedupeMarkersById,
  mapStationToMarker,
  mapTicketToMarker,
  toBoundsInput,
} from '../markers';
import type { MapViewportStore } from '../viewport-store';

const { color } = designTokens;

export { ADMIN_MAP_LIVE_QUERY_LIMIT } from '@rescue-frontend/data-access/admin';

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

/** Each source can fail or refetch without hiding the other source's pins. */
export function useAdminMapLiveMarkers(viewportStore: MapViewportStore) {
  const viewport = useStore(viewportStore);
  const bounds = toBoundsInput(viewport);
  const tickets = useQuery({
    ...adminMapTicketsQuery(bounds, viewport.position?.zoom),
    placeholderData: keepPreviousData,
    select: ({ tickets }) =>
      tickets.items.flatMap((ticket) => {
        const marker = mapTicketToMarker(ticket);
        return marker
          ? [
              toAdminMapPin({
                ...marker,
                ticketMeta: {
                  ...marker.ticketMeta,
                  responsibleTeams: ticket.responsibleTeams,
                },
              }),
            ]
          : [];
      }),
  });
  const stations = useQuery({
    ...adminMapStationsQuery(bounds),
    placeholderData: keepPreviousData,
    select: ({ stations }) =>
      stations.items.flatMap((station) => {
        const marker = mapStationToMarker(station);
        return marker ? [toAdminMapPin(marker)] : [];
      }),
  });

  return {
    markers: dedupeMarkersById([
      ...(tickets.data ?? []),
      ...(stations.data ?? []),
    ]),
    ticketReadFailed: tickets.isError,
    stationReadFailed: stations.isError,
  };
}
