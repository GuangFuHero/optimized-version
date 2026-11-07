import type { GetMapAreasQuery } from '@rescue-frontend/data-access';

type MapArea = GetMapAreasQuery['areas']['items'][number];

/** The areas a page asks for; the backend sets no upper limit of its own. */
export const AREA_PAGE_SIZE = 100;
/** Pages asked for at most, 1,000 areas: past that something is wrong, and the map stops asking. */
export const AREA_PAGE_LIMIT = 10;

/**
 * Every area in the view, newest first as the backend lists them. One page was not enough: past
 * the first hundred, the oldest areas — of any kind — were left off the map (#117).
 *
 * The first page says how many there are, so the rest are asked for at once. An error on any page
 * comes back with the areas the other pages gave.
 */
export async function fetchAllAreaPages(
  fetchPage: (skip: number, limit: number) => Promise<GetMapAreasQuery>,
  {
    pageSize = AREA_PAGE_SIZE,
    maxPages = AREA_PAGE_LIMIT,
  }: { pageSize?: number; maxPages?: number } = {},
): Promise<{ items: MapArea[]; error: unknown }> {
  const read = (skip: number) =>
    fetchPage(skip, pageSize).then(
      (data) => ({ data, error: null }),
      (error: unknown) => ({ data: undefined, error }),
    );
  const first = await read(0);
  const items = [...(first.data?.areas.items ?? [])];
  const pageInfo = first.data?.areas.pageInfo;

  if (first.error || !pageInfo?.hasNextPage) {
    return { items, error: first.error };
  }

  const pages = Math.min(Math.ceil(pageInfo.totalCount / pageSize), maxPages);
  const rest = await Promise.all(
    Array.from({ length: pages - 1 }, (_, index) =>
      read((index + 1) * pageSize),
    ),
  );

  return {
    items: [...items, ...rest.flatMap((page) => page.data?.areas.items ?? [])],
    error: rest.find((page) => page.error)?.error ?? null,
  };
}
