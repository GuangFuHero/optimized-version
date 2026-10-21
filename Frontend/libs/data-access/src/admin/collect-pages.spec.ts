import { describe, expect, it, vi } from 'vitest';

import { collectAllPages } from './collect-pages';

describe('collectAllPages', () => {
  it('pages until hasNextPage is false', async () => {
    const data = Array.from({ length: 450 }, (_, i) => i);
    const fetchPage = vi.fn(async (skip: number, limit: number) => ({
      items: data.slice(skip, skip + limit),
      hasNextPage: skip + limit < data.length,
    }));
    const result = await collectAllPages(fetchPage, { pageSize: 200 });
    expect(result).toEqual({ items: data, truncated: false });
    expect(fetchPage).toHaveBeenCalledTimes(3);
  });

  it('stops at maxItems and reports truncation', async () => {
    const result = await collectAllPages(
      async (skip, limit) => ({
        items: Array<number>(limit).fill(skip),
        hasNextPage: true,
      }),
      { pageSize: 100, maxItems: 250 },
    );
    expect(result.items).toHaveLength(250);
    expect(result.truncated).toBe(true);
  });
});
