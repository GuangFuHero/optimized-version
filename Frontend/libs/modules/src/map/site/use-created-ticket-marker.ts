'use client';

import { useEffect, useRef } from 'react';

import { onTicketCreated } from '../../ticket/ticket-changes';
import type { RescueMapMarkerItem } from '../types';
import { mapTicketToMarker } from './markers';

/**
 * Hands each ticket filed through 請求協助 to `listener` as a marker, for the map to add: its view
 * may not fetch again for a while, and a selection it cannot find among its markers is dropped.
 */
export function useCreatedTicketMarker(
  listener: (marker: RescueMapMarkerItem) => void,
): void {
  const listenerRef = useRef(listener);

  listenerRef.current = listener;

  useEffect(
    () =>
      onTicketCreated((ticket) => {
        const marker = mapTicketToMarker(ticket);

        if (marker) {
          listenerRef.current(marker);
        }
      }),
    [],
  );
}
