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
        if (!isAdminPermissionError(error)) reportError(error);
      },
    }),
    mutationCache: new MutationCache({
      // A mutation can name the statuses it explains to the user itself, e.g. a review answering
      // 409 because someone else decided first; those are not reported a second time.
      onError: (error, _variables, _context, mutation) => {
        const handled = mutation.meta?.['handledStatuses'];
        if (
          error instanceof ApiError &&
          Array.isArray(handled) &&
          handled.includes(error.status)
        )
          return;
        reportError(error);
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: (count, error) => {
          const status =
            error instanceof ApiError
              ? error.status
              : error instanceof CombinedError &&
                  error.response instanceof Response
                ? error.response.status
                : undefined;
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
