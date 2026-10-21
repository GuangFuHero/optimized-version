'use client';

import { useEffect, useRef, useState } from 'react';

import { reverseGeocodeResponse } from '../../../map/reverse-geocode';

type ReverseGeocode = ReturnType<(typeof reverseGeocodeResponse)['parse']>;

/**
 * Looks up the address at `position` once per position, through the app's own
 * `/api/google/reverse-geocode` route. A failed lookup is silent: the address is only a head start.
 */
export function useReverseGeocode(
  position: readonly [number, number] | null | undefined,
  onResolved: (geocode: ReverseGeocode) => void,
): boolean {
  const [isResolving, setIsResolving] = useState(false);
  const onResolvedRef = useRef(onResolved);
  onResolvedRef.current = onResolved;
  const lat = position?.[0];
  const lng = position?.[1];

  useEffect(() => {
    if (lat == null || lng == null) return;

    const controller = new AbortController();
    setIsResolving(true);

    void (async () => {
      try {
        const response = await fetch(
          `/api/google/reverse-geocode?lat=${lat}&lng=${lng}`,
          { cache: 'no-store', signal: controller.signal },
        );
        if (!response.ok) return;
        onResolvedRef.current(
          reverseGeocodeResponse.parse(await response.json()),
        );
      } catch {
        // Aborted, offline or an unexpected payload: the form simply stays blank.
      } finally {
        if (!controller.signal.aborted) setIsResolving(false);
      }
    })();

    return () => controller.abort();
  }, [lat, lng]);

  return isResolving;
}
