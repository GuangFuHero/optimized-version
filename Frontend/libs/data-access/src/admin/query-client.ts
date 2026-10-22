import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { CombinedError } from 'urql';

import ApiError from '../rest/api-error';

export function isAdminPermissionError(error: Error | null) {
  if (error instanceof ApiError) {
    return (
      error.status === 403 &&
      error.code !== 'step_up_required' &&
      error.code !== 'back_office_identity_required' &&
      error.code !== 'origin_not_allowed'
    );
  }
  return (
    error instanceof CombinedError &&
    // Resolver HTTPExceptions carry permission failures; transport 403s may have other causes.
    error.graphQLErrors.some((item) => item.message.startsWith('403:'))
  );
}

/**
 * Set `meta: { [SILENT_ERROR_META]: true }` on a query that shows its own error state, so a failure
 * is not also raised through `onError` (the admin app toasts it). A 401 is still raised: the
 * app's sign-out on an expired session hangs off `onError`.
 */
export const SILENT_ERROR_META = 'silentError';

/** The HTTP status behind a REST or GraphQL failure; undefined when there was no response. */
function statusOf(error: Error): number | undefined {
  if (error instanceof ApiError) return error.status;
  if (error instanceof CombinedError && error.response instanceof Response) {
    return error.response.status;
  }
  return undefined;
}

export function createAdminQueryClient(onError: (error: Error) => void) {
  const reportError = (error: Error) => {
    if (error instanceof ApiError && error.code === 'step_up_required') return;
    onError(
      error instanceof CombinedError
        ? new ApiError(
            error.response instanceof Response ? error.response.status : 0,
            error.graphQLErrors[0]?.message ??
              error.networkError?.message ??
              'GraphQL request failed.',
          )
        : error,
    );
  };

  return new QueryClient({
    queryCache: new QueryCache({
      // A query nobody asked for, such as a background poll, sets `meta.quietErrors`: its failure
      // is retried on the next poll, not reported.
      onError: (error, query) => {
        if (query.meta?.quietErrors) return;
        const silent = query.meta?.[SILENT_ERROR_META] === true;
        if (silent && statusOf(error) !== 401) return;
        if (!isAdminPermissionError(error)) reportError(error);
      },
    }),
    mutationCache: new MutationCache({ onError: reportError }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: (count, error) => {
          const status = statusOf(error);
          if (
            status === 401 ||
            status === 403 ||
            (error instanceof CombinedError && error.graphQLErrors.length > 0)
          )
            return false;
          return count < 1;
        },
      },
      mutations: { retry: false },
    },
  });
}
