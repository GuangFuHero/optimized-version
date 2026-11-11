import createClient from 'openapi-fetch';
import { z } from 'zod';

import ApiError from './api-error';
import type { paths } from './openapi';

const backendError = z.object({
  detail: z.string().optional(),
  code: z.string().optional(),
});

/**
 * The REST client: in the browser through the app's own `/api/v1` proxy (`baseUrl` empty), on the
 * server to the backend itself. Throws `ApiError` for any answer that is not OK.
 */
export function createRestClient({
  fetch: fetcher = fetch,
  baseUrl = '',
}: { fetch?: typeof fetch; baseUrl?: string } = {}) {
  const client = createClient<paths>({
    baseUrl,
    credentials: 'include',
    fetch: fetcher,
  });
  client.use({
    async onResponse({ response }) {
      if (!response.ok) {
        const parsed = backendError.safeParse(
          await response
            .clone()
            .json()
            .catch(() => null),
        );
        throw new ApiError(
          response.status,
          parsed.data?.detail ?? `API request failed (${response.status}).`,
          parsed.data?.code,
          response,
        );
      }
    },
  });
  return client;
}

export function responseData<T>(response: { data?: T }): T {
  if (response.data === undefined)
    throw new Error('The backend returned no data.');
  return response.data;
}
