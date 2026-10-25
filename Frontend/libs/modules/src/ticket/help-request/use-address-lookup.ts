'use client';

import { useMemo } from 'react';
import { useQuery } from 'urql';

import {
  NormalizeAddressDocument,
  ReverseGeocodeDocument,
} from '@rescue-frontend/data-access';

import {
  lookupPoint,
  readAddressLookup,
  type AddressCheck,
  type AddressLookup,
  type LatLng,
} from '../address-lookup';

// Inside the drawer: a lookup must not suspend the form around it. Sent as a POST, not the GET urql
// sends queries as: the pin and the typed line are someone's home, and a URL is kept in access logs.
// Never answered from the cache: an `unavailable` kept there would come back for a reopened draft
// that asks again, and a token lasts a day. A lookup is only made on a pin drop or a blur.
const ADDRESS_LOOKUP_CONTEXT = {
  suspense: false,
  preferGetMethod: false,
  requestPolicy: 'network-only',
} as const;

/**
 * The nearest 門牌 to the pin, asked once for each place it is put down: the small map reports a
 * tap or the end of a drag, never the drag itself, so there is nothing to debounce. A spot asked
 * before is asked again, not answered from the cache. Null with no pin.
 */
export function usePinAddressLookup(pin: LatLng | null): AddressLookup | null {
  const point = lookupPoint(pin);
  const [{ data, fetching, error, operation }] = useQuery({
    query: ReverseGeocodeDocument,
    variables: point ?? { lat: 0, lng: 0 },
    pause: !point,
    context: ADDRESS_LOOKUP_CONTEXT,
  });
  const asked = point !== null;
  // The answer for the pin before, while this one is asked, is no answer: it names a door elsewhere.
  const current =
    operation?.variables.lat === point?.lat &&
    operation?.variables.lng === point?.lng;

  return useMemo(
    () =>
      asked
        ? readAddressLookup({
            current,
            fetching,
            error,
            answer: data?.reverseGeocode,
          })
        : null,
    [asked, current, fetching, error, data],
  );
}

/** A typed line checked against TGOS, once the address field is left. Null until then. */
export function useTypedAddressLookup(
  check: AddressCheck | null,
): AddressLookup | null {
  const [{ data, fetching, error, operation }] = useQuery({
    query: NormalizeAddressDocument,
    variables: check ?? { address: '' },
    pause: !check,
    context: ADDRESS_LOOKUP_CONTEXT,
  });
  const current =
    operation?.variables.address === check?.address &&
    operation?.variables.lat === check?.lat &&
    operation?.variables.lng === check?.lng;

  return useMemo(
    () =>
      check
        ? readAddressLookup({
            current,
            fetching,
            error,
            answer: data?.normalizeAddress,
          })
        : null,
    [check, current, fetching, error, data],
  );
}
