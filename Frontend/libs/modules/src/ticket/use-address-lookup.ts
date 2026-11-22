'use client';

import { useQuery } from '@tanstack/react-query';

import {
  normalizeAddressQueryOptions,
  reverseGeocodeQueryOptions,
  type AddressLookupSource,
} from '@rescue-frontend/data-access';

import {
  lookupPoint,
  readAddressLookup,
  type AddressCheck,
  type AddressLookup,
  type LatLng,
} from './address-lookup';

export function usePinAddressLookup(
  pin: LatLng | null,
  source: AddressLookupSource,
): AddressLookup | null {
  const point = lookupPoint(pin);
  const { data, isFetching, error } = useQuery({
    ...reverseGeocodeQueryOptions(source, point ?? { lat: 0, lng: 0 }),
    enabled: point !== null,
  });

  return point
    ? readAddressLookup({
        fetching: isFetching,
        error,
        answer: data?.reverseGeocode,
      })
    : null;
}

export function useTypedAddressLookup(
  check: AddressCheck | null,
  source: AddressLookupSource,
): AddressLookup | null {
  const { data, isFetching, error } = useQuery({
    ...normalizeAddressQueryOptions(source, check ?? { address: '' }),
    enabled: check !== null,
  });

  return check
    ? readAddressLookup({
        fetching: isFetching,
        error,
        answer: data?.normalizeAddress,
      })
    : null;
}
