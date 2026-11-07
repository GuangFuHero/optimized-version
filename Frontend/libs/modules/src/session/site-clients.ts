'use client';

import { mutationOptions, queryOptions } from '@tanstack/react-query';

import {
  createGraphqlRequest,
  createRestClient,
  type GraphqlError,
  type TypedDocumentString,
} from '@rescue-frontend/data-access';

import { sessionExpiryFetch } from './end-expired-session';

/**
 * The site's clients, through the app's proxies, which refresh a spent access token on the way.
 * Both end the session here when the proxy says it has ended (`sessionExpiryFetch`).
 */
export const siteRestClient = createRestClient({ fetch: sessionExpiryFetch });
export const siteGraphql = createGraphqlRequest({ fetch: sessionExpiryFetch });

/**
 * For a read by a part of the page that shows its own loading and error states: from the network
 * each time it mounts, not again when the tab comes back, and never toasted.
 */
export const SITE_READ_OPTIONS = {
  staleTime: 0,
  refetchOnWindowFocus: false,
  meta: { quietErrors: true },
} as const;

/** One GraphQL document read with `SITE_READ_OPTIONS`, keyed by the document and its variables. */
export function siteGraphqlQuery<TResult, TVariables>(
  document: TypedDocumentString<TResult, TVariables>,
  variables: TVariables,
) {
  return queryOptions<TResult, GraphqlError>({
    ...SITE_READ_OPTIONS,
    queryKey: [document, variables],
    queryFn: ({ signal }) => siteGraphql(document, variables, signal),
  });
}

/** A GraphQL write whose failure the site explains where it was made, never in a toast. */
export function siteGraphqlMutation<TResult, TVariables>(
  document: TypedDocumentString<TResult, TVariables>,
) {
  return mutationOptions<TResult, GraphqlError, TVariables>({
    mutationFn: (variables) => siteGraphql(document, variables),
    meta: { quietErrors: true },
  });
}
