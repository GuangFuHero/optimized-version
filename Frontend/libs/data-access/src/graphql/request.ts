import type { GraphQLFormattedError } from 'graphql';

import type { TypedDocumentString } from './__generated__/graphql';

/**
 * A failed GraphQL request. `graphQLErrors` holds what the backend refused; `networkError` is set
 * when no GraphQL answer came back (no connection, or an HTTP error such as the proxy's 401), with
 * `response` beside it whenever there was one.
 */
export class GraphqlError extends Error {
  readonly graphQLErrors: readonly GraphQLFormattedError[];
  readonly networkError?: Error;
  readonly response?: Response;

  constructor({
    graphQLErrors = [],
    networkError,
    response,
  }: {
    graphQLErrors?: readonly GraphQLFormattedError[];
    networkError?: Error;
    response?: Response;
  }) {
    super(
      graphQLErrors[0]?.message ??
        networkError?.message ??
        'GraphQL request failed.',
    );
    this.name = 'GraphqlError';
    this.graphQLErrors = graphQLErrors;
    this.networkError = networkError;
    this.response = response;
  }
}

/**
 * Sends a generated document to `url` and resolves with its data, or throws `GraphqlError`. The
 * browser calls the app's own `/api/graphql` proxy; the server passes the backend's URL.
 */
export function createGraphqlRequest({
  url = '/api/graphql',
  fetch: fetcher = fetch,
  cache,
}: {
  url?: string;
  fetch?: typeof fetch;
  cache?: RequestCache;
} = {}) {
  return async function request<TResult, TVariables>(
    document: TypedDocumentString<TResult, TVariables>,
    variables: TVariables,
    signal?: AbortSignal,
  ): Promise<TResult> {
    let response: Response;
    try {
      response = await fetcher(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/graphql-response+json, application/json',
        },
        body: JSON.stringify({ query: document, variables }),
        credentials: 'include',
        cache,
        signal,
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new GraphqlError({ networkError: error as Error });
    }

    const body = (await response.json().catch(() => null)) as {
      data?: unknown;
      errors?: GraphQLFormattedError[];
    } | null;
    if (body?.errors?.length) {
      throw new GraphqlError({ graphQLErrors: body.errors, response });
    }
    if (!response.ok || !body?.data) {
      throw new GraphqlError({
        networkError: new Error(
          response.statusText || `HTTP ${response.status}`,
        ),
        response,
      });
    }
    return body.data as TResult;
  };
}
