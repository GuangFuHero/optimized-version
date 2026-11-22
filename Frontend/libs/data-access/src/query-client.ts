// SPDX-License-Identifier: GPL-3.0-only
import {
  MutationCache,
  QueryCache,
  QueryClient,
  type QueryMeta,
} from '@tanstack/react-query';
import { GraphqlError } from './graphql/request';
import ApiError from './rest/api-error';

/**
 * Set `meta: { [SILENT_ERROR_META]: true }` on a query or mutation that shows its own error state, so
 * a failure is not also raised through `onError`.
 */
export const SILENT_ERROR_META = 'silentError';

export function isPermissionError(error: Error | null) {
  if (error instanceof ApiError) {
    return (
      error.status === 403 &&
      error.code !== 'step_up_required' &&
      error.code !== 'back_office_identity_required' &&
      error.code !== 'origin_not_allowed'
    );
  }
  return (
    error instanceof GraphqlError &&
    // Resolver HTTPExceptions carry permission failures; transport 403s may have other causes.
    error.graphQLErrors.some((item) => item.message.startsWith('403:'))
  );
}

/** The HTTP status behind a REST or GraphQL failure; undefined when there was no response. */
function statusOf(error: Error): number | undefined {
  if (error instanceof ApiError) return error.status;
  if (error instanceof GraphqlError) return error.response?.status;
  return undefined;
}

/** The proxy sends 401 after refresh fails. A refused password or step-up proof keeps the session. */
export function isSessionEndError(error: Error) {
  return (
    statusOf(error) === 401 &&
    !(
      error instanceof ApiError &&
      (error.code === 'password_incorrect' || error.code === 'step_up_invalid')
    )
  );
}

/**
 * `SILENT_ERROR_META`, or `quietErrors` for a read nobody asked for such as a background poll, keeps
 * a failure from `onError`. An expired session still reaches the app so it can sign out.
 */
function keepsQuiet(meta: QueryMeta | undefined, error: Error) {
  return (
    (meta?.quietErrors === true || meta?.[SILENT_ERROR_META] === true) &&
    !isSessionEndError(error)
  );
}

export function createAppQueryClient(
  onError: (error: Error) => void,
  ignoreQueryError?: (error: Error) => boolean,
) {
  const reportError = (error: Error) => {
    if (error instanceof ApiError && error.code === 'step_up_required') return;
    onError(
      error instanceof GraphqlError
        ? new ApiError(error.response?.status ?? 0, error.message)
        : error,
    );
  };

  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        if (keepsQuiet(query.meta, error) || ignoreQueryError?.(error)) return;
        reportError(error);
      },
    }),
    mutationCache: new MutationCache({
      // A mutation can also name the statuses it explains to the user itself, e.g. a review
      // answering 409 because someone else decided first.
      onError: (error, _variables, _context, mutation) => {
        if (keepsQuiet(mutation.meta, error)) return;
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
          const status = statusOf(error);
          if (
            status === 401 ||
            status === 403 ||
            (error instanceof GraphqlError && error.graphQLErrors.length > 0)
          )
            return false;
          return count < 1;
        },
      },
      mutations: { retry: false },
    },
  });
}
