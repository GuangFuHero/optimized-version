import createClient from 'openapi-fetch';
import { z } from 'zod';

import ApiError from './api-error';
import type { paths } from './openapi';

const backendError = z.object({
  detail: z.string().optional(),
  code: z.string().optional(),
});

export function createRestClient(fetcher: typeof fetch = fetch) {
  const client = createClient<paths>({
    baseUrl: '',
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
