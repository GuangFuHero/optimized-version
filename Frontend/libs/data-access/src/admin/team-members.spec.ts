import { describe, expect, it, vi } from 'vitest';

import { readAllTeamMembers } from './team-members';

describe('complete team roster', () => {
  it('reads past 200 people, including an administrator on the last page', async () => {
    const members = Array.from({ length: 403 }, (_, uuid) => ({
      uuid,
      role: uuid === 402 ? 'admin' : 'member',
    }));
    const readPage = vi.fn(async (skip: number, limit: number) =>
      members.slice(skip, skip + limit),
    );
    expect(await readAllTeamMembers(readPage)).toEqual(members);
    expect(readPage.mock.calls).toEqual([
      [0, 200],
      [200, 200],
      [400, 200],
    ]);
  });

  it('checks for another page when the last page is exactly full', async () => {
    const readPage = vi.fn(async (skip: number) => (skip === 0 ? [1, 2] : []));
    expect(await readAllTeamMembers(readPage, 2)).toEqual([1, 2]);
    expect(readPage.mock.calls).toEqual([
      [0, 2],
      [2, 2],
    ]);
  });

  it('does not return a partial roster if a later page cannot be read', async () => {
    const readPage = vi
      .fn()
      .mockResolvedValueOnce([1, 2])
      .mockRejectedValueOnce(new Error('offline'));
    await expect(readAllTeamMembers(readPage, 2)).rejects.toThrow('offline');
  });
});
