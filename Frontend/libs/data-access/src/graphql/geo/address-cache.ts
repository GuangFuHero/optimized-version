import { queryOptions } from '@tanstack/react-query';

import {
  NormalizeAddressDocument,
  ReverseGeocodeDocument,
  type NormalizeAddressQueryVariables,
  type ReverseGeocodeQueryVariables,
  type TypedDocumentString,
} from '../__generated__/graphql';

export type AddressLookupRequest = <TResult, TVariables>(
  document: TypedDocumentString<TResult, TVariables>,
  variables: TVariables,
  signal?: AbortSignal,
) => Promise<TResult>;

export interface AddressLookupSource {
  readonly scope: string;
  readonly request: AddressLookupRequest;
}

// Never kept once unmounted: TGOS tokens expire and unavailable lookups should retry next time.
// Sent over GraphQL POST so coordinates and addresses do not land in URL access logs.
export const ADDRESS_LOOKUP_OPTIONS = {
  gcTime: 0,
  staleTime: 0,
  retry: false,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
  meta: { quietErrors: true },
} as const;

const round6 = (value: number) => Math.round(value * 1e6) / 1e6;

export function roundLookupPoint(point: ReverseGeocodeQueryVariables) {
  return { lat: round6(point.lat), lng: round6(point.lng) };
}

export function reverseGeocodeQueryOptions(
  source: AddressLookupSource,
  point: ReverseGeocodeQueryVariables,
) {
  const variables = roundLookupPoint(point);
  return queryOptions({
    ...ADDRESS_LOOKUP_OPTIONS,
    queryKey: [source.scope, 'address', 'reverseGeocode', variables] as const,
    queryFn: ({ signal }) =>
      source.request(ReverseGeocodeDocument, variables, signal),
  });
}

export function normalizeAddressQueryOptions(
  source: AddressLookupSource,
  variables: NormalizeAddressQueryVariables,
) {
  return queryOptions({
    ...ADDRESS_LOOKUP_OPTIONS,
    queryKey: [source.scope, 'address', 'normalizeAddress', variables] as const,
    queryFn: ({ signal }) =>
      source.request(NormalizeAddressDocument, variables, signal),
  });
}
