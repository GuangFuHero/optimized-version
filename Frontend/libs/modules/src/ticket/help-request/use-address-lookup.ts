'use client';

import { useQuery } from '@tanstack/react-query';

import {
  NormalizeAddressDocument,
  ReverseGeocodeDocument,
} from '@rescue-frontend/data-access';

import { siteGraphqlQuery } from '../../session/site-clients';
import {
  lookupPoint,
  readAddressLookup,
  type AddressCheck,
  type AddressLookup,
  type LatLng,
} from '../address-lookup';

// Never kept once nothing asks for it: an `unavailable` kept in the cache would come back for a
// reopened draft that asks again, and a token lasts a day. A lookup is only made on a pin drop or a
// blur, and is not tried again. Sent as a POST, as every read is: the pin and the typed line are
// someone's home, and a URL is kept in access logs.
const ADDRESS_LOOKUP_OPTIONS = { gcTime: 0, retry: false } as const;

/**
 * The nearest 門牌 to the pin, asked once for each place it is put down: the small map reports a
 * tap or the end of a drag, never the drag itself, so there is nothing to debounce. A spot asked
 * before is asked again. Null with no pin.
 */
export function usePinAddressLookup(pin: LatLng | null): AddressLookup | null {
  const point = lookupPoint(pin);
  const { data, isFetching, error } = useQuery({
    ...siteGraphqlQuery(ReverseGeocodeDocument, point ?? { lat: 0, lng: 0 }),
    ...ADDRESS_LOOKUP_OPTIONS,
    enabled: point !== null,
  });
  const asked = point !== null;

  return asked
    ? readAddressLookup({
        fetching: isFetching,
        error,
        answer: data?.reverseGeocode,
      })
    : null;
}

/** A typed line checked against TGOS, once the address field is left. Null until then. */
export function useTypedAddressLookup(
  check: AddressCheck | null,
): AddressLookup | null {
  const { data, isFetching, error } = useQuery({
    ...siteGraphqlQuery(NormalizeAddressDocument, check ?? { address: '' }),
    ...ADDRESS_LOOKUP_OPTIONS,
    enabled: Boolean(check),
  });

  return check
    ? readAddressLookup({
        fetching: isFetching,
        error,
        answer: data?.normalizeAddress,
      })
    : null;
}
