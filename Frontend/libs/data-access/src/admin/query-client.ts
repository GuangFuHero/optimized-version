import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { CombinedError } from 'urql';

import ApiError from '../rest/api-error';

export function createAdminQueryClient(onError: (error: Error) => void) {
  const reportError = (error: Error) => {
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
    queryCache: new QueryCache({ onError: reportError }),
    mutationCache: new MutationCache({ onError: reportError }),
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
