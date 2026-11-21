import type { GetMapAreasQuery } from './__generated__/graphql';

type MapArea = GetMapAreasQuery['areas']['items'][number];

/** The areas a page asks for; the backend sets no upper limit of its own. */
export const AREA_PAGE_SIZE = 100;
/** Pages asked for at most, 1,000 areas: past that something is wrong, and the map stops asking. */
export const AREA_PAGE_LIMIT = 10;

export interface AreaPages {
  items: MapArea[];
  /** One per page that failed; the pages that came are still in `items`. */
  errors: Error[];
  /** Whether the page cap stopped the read short of the whole list. */
  truncated: boolean;
}

/**
 * Every area in the view, newest first as the backend lists them. One page was not enough: past
 * the first hundred, older areas would be left off the map.
 *
 * The first page says how many there are, so the rest are asked for at once. Pages that fail keep
 * the areas the others gave, each failure handed back for the caller to judge.
 */
export async function fetchAllAreaPages(
  fetchPage: (skip: number, limit: number) => Promise<GetMapAreasQuery>,
  {
    pageSize = AREA_PAGE_SIZE,
    maxPages = AREA_PAGE_LIMIT,
  }: { pageSize?: number; maxPages?: number } = {},
): Promise<AreaPages> {
  const read = (skip: number) =>
    fetchPage(skip, pageSize).then(
      (data) => ({ data, error: null }),
      (cause: unknown) => ({
        data: undefined,
        error:
          cause instanceof Error
            ? cause
            : Object.assign(new Error('Could not load areas'), { cause }),
      }),
    );
  const first = await read(0);
  const items = [...(first.data?.areas.items ?? [])];
  const pageInfo = first.data?.areas.pageInfo;
  const errors = (error: Error | null | undefined): Error[] =>
    error ? [error] : [];

  if (!pageInfo?.hasNextPage) {
    return { items, errors: errors(first.error), truncated: false };
  }

  const listed = Math.ceil(pageInfo.totalCount / pageSize);
  const pages = Math.min(listed, maxPages);
  const rest = await Promise.all(
    Array.from({ length: pages - 1 }, (_, index) =>
      read((index + 1) * pageSize),
    ),
  );

  return {
    items: [...items, ...rest.flatMap((page) => page.data?.areas.items ?? [])],
    errors: [
      ...errors(first.error),
      ...rest.flatMap((page) => errors(page.error)),
    ],
    truncated: listed > pages,
  };
}
