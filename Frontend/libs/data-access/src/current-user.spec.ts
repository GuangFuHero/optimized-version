// SPDX-License-Identifier: GPL-3.0-only
import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

import { currentUserQuery } from './current-user';
import ApiError from './rest/api-error';

const user = {
  uuid: 'user-1',
  name: '王小明',
  capabilities: ['work_zone.view'],
};

function clientWith(get: ReturnType<typeof vi.fn>) {
  return { GET: get } as never;
}

function read(client: ReturnType<typeof clientWith>) {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  }).fetchQuery({ ...currentUserQuery(client), retryDelay: 0 });
}

describe('currentUserQuery', () => {
  it('reads the signed-in user without letting the browser cache the answer across identities', async () => {
    const get = vi.fn().mockResolvedValue({ data: user } as never);

    await expect(read(clientWith(get))).resolves.toBe(user);
    expect(get).toHaveBeenCalledWith(
      '/api/v1/users/me',
      expect.objectContaining({ cache: 'no-store' }),
    );
  });

  it('takes an ended session as no current user, not as a failure to retry', async () => {
    const get = vi
      .fn()
      .mockRejectedValue(new ApiError(401, 'Could not validate credentials'));

    await expect(read(clientWith(get))).resolves.toBeNull();
  });

  it('asks again a bounded number of times before reporting a failure that is not the session ending', async () => {
    const failure = new ApiError(503, 'Service Unavailable');
    const get = vi.fn().mockRejectedValue(failure);

    await expect(read(clientWith(get))).rejects.toBe(failure);
    expect(get).toHaveBeenCalledTimes(3);
  });

  it('gets past a proxy that cannot refresh the session for a moment', async () => {
    const get = vi
      .fn()
      .mockRejectedValueOnce(new ApiError(503, 'Service Unavailable'))
      .mockResolvedValue({ data: user } as never);

    await expect(read(clientWith(get))).resolves.toBe(user);
  });
});
