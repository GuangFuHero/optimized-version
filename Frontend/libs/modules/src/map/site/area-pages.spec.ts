import { describe, expect, it } from 'vitest';

import { fetchAllAreaPages, type AreaPageResult } from './area-pages';

/**
 * A page as `GetMapAreas` returns it, its areas named by their place in the list. The fragment's
 * masking is only in the types.
 */
function page(skip: number, count: number, totalCount: number): AreaPageResult {
  return {
    data: {
      areas: {
        items: Array.from({ length: count }, (_, index) => ({
          uuid: `area-${skip + index}`,
        })),
        pageInfo: {
          totalCount,
          hasNextPage: skip + count < totalCount,
          hasPreviousPage: skip > 0,
        },
      },
    } as never,
  };
}

const uuids = (items: readonly { uuid: unknown }[]) =>
  items.map((item) => item.uuid);

describe('fetchAllAreaPages', () => {
  it('takes a single page as it comes', async () => {
    const calls: [number, number][] = [];

    const result = await fetchAllAreaPages(async (skip, limit) => {
      calls.push([skip, limit]);
      return page(skip, 2, 2);
    });

    expect(calls).toEqual([[0, 100]]);
    expect(uuids(result.items)).toEqual(['area-0', 'area-1']);
    expect(result.error).toBeNull();
  });

  it('asks for the rest at once once the first page gives the total, and keeps the pages in order', async () => {
    const pending = new Map<number, () => void>();
    const asked: number[] = [];

    const fetching = fetchAllAreaPages(
      (skip) => {
        asked.push(skip);
        const result = page(skip, skip < 200 ? 100 : 50, 250);

        return skip === 0
          ? Promise.resolve(result)
          : new Promise((resolve) => pending.set(skip, () => resolve(result)));
      },
      { pageSize: 100 },
    );

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(asked).toEqual([0, 100, 200]);
    // The later page answers first: the areas still come in page order.
    pending.get(200)?.();
    pending.get(100)?.();

    const result = await fetching;

    expect(uuids(result.items)).toEqual(
      Array.from({ length: 250 }, (_, index) => `area-${index}`),
    );
    expect(result.error).toBeNull();
  });

  it('stops at ten pages, however many areas there are', async () => {
    const asked: number[] = [];

    const result = await fetchAllAreaPages(async (skip, limit) => {
      asked.push(skip);
      return page(skip, limit, 5000);
    });

    expect(asked).toEqual([0, 100, 200, 300, 400, 500, 600, 700, 800, 900]);
    expect(result.items).toHaveLength(1000);
  });

  it('keeps the pages that came, with the error of one that did not', async () => {
    const failure = new Error('page 2 failed');

    const result = await fetchAllAreaPages(
      async (skip) =>
        skip === 100 ? { error: failure as never } : page(skip, 100, 300),
      { pageSize: 100 },
    );

    expect(uuids(result.items)).toEqual([
      ...Array.from({ length: 100 }, (_, index) => `area-${index}`),
      ...Array.from({ length: 100 }, (_, index) => `area-${200 + index}`),
    ]);
    expect(result.error).toBe(failure);
  });

  it('gives back the error when the first page fails, and asks for nothing more', async () => {
    const failure = new Error('offline');
    const asked: number[] = [];

    const result = await fetchAllAreaPages(async (skip) => {
      asked.push(skip);
      return { error: failure as never };
    });

    expect(asked).toEqual([0]);
    expect(result).toEqual({ items: [], error: failure });
  });
});
