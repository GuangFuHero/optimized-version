import { describe, expect, it } from 'vitest';

import { fetchAllAreaPages } from './read-map-areas';

/** A page as `GetMapAreas` returns it, its areas named by their place in the list. */
function page(skip: number, count: number, totalCount: number) {
  return {
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
  } as never;
}

const uuids = (items: readonly { uuid: string }[]) =>
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
    expect(result.errors).toEqual([]);
    expect(result.truncated).toBe(false);
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
    expect(result.errors).toEqual([]);
  });

  it('stops at ten pages, and says the list it gives is not the whole one', async () => {
    const asked: number[] = [];

    const result = await fetchAllAreaPages(async (skip, limit) => {
      asked.push(skip);
      return page(skip, limit, 5000);
    });

    expect(asked).toEqual([0, 100, 200, 300, 400, 500, 600, 700, 800, 900]);
    expect(result.items).toHaveLength(1000);
    expect(result.truncated).toBe(true);
  });

  it('keeps the pages that came, with the errors of those that did not', async () => {
    const failure = new Error('page 2 failed');

    const result = await fetchAllAreaPages(
      async (skip) => {
        if (skip === 100) throw failure;
        return page(skip, 100, 300);
      },
      { pageSize: 100 },
    );

    expect(uuids(result.items)).toEqual([
      ...Array.from({ length: 100 }, (_, index) => `area-${index}`),
      ...Array.from({ length: 100 }, (_, index) => `area-${200 + index}`),
    ]);
    expect(result.errors).toEqual([failure]);
  });

  it('gives back the error when the first page fails, and asks for nothing more', async () => {
    const failure = new Error('offline');
    const asked: number[] = [];

    const result = await fetchAllAreaPages(async (skip) => {
      asked.push(skip);
      throw failure;
    });

    expect(asked).toEqual([0]);
    expect(result).toEqual({ items: [], errors: [failure], truncated: false });
  });

  it('keeps the pages that came and hands back an Error for a failure that is not one, so callers can read a status', async () => {
    const result = await fetchAllAreaPages(
      async (skip) => {
        if (skip === 0) return page(0, 100, 150);
        return Promise.reject('offline');
      },
      { pageSize: 100 },
    );

    expect(result.items).toHaveLength(100);
    const [error] = result.errors;
    expect(error).toBeInstanceOf(Error);
    expect(error?.message).toBe('Could not load areas');
    expect(error).toMatchObject({ cause: 'offline' });
  });

  it('does the same for a first page that fails, with no areas to keep', async () => {
    const result = await fetchAllAreaPages(async () =>
      Promise.reject({ status: 502 }),
    );

    expect(result.items).toEqual([]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({ cause: { status: 502 } });
  });
});
