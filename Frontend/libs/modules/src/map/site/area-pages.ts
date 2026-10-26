import {
  PageInfoFieldsFragmentDoc,
  useFragment,
  type GetMapAreasQuery,
} from '@rescue-frontend/data-access';
import type { CombinedError } from 'urql';

type MapArea = GetMapAreasQuery['areas']['items'][number];

/** One page of `GetMapAreas` as urql gives it back. */
export interface AreaPageResult {
  data?: GetMapAreasQuery;
  error?: CombinedError;
}

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
  fetchPage: (skip: number, limit: number) => Promise<AreaPageResult>,
  {
    pageSize = AREA_PAGE_SIZE,
    maxPages = AREA_PAGE_LIMIT,
  }: { pageSize?: number; maxPages?: number } = {},
): Promise<{ items: MapArea[]; error: CombinedError | null }> {
  const first = await fetchPage(0, pageSize);
  const items = [...(first.data?.areas.items ?? [])];
  const pageInfo = first.data
    ? useFragment(PageInfoFieldsFragmentDoc, first.data.areas.pageInfo)
    : null;

  if (first.error || !pageInfo?.hasNextPage) {
    return { items, error: first.error ?? null };
  }

  const pages = Math.min(Math.ceil(pageInfo.totalCount / pageSize), maxPages);
  const rest = await Promise.all(
    Array.from({ length: pages - 1 }, (_, index) =>
      fetchPage((index + 1) * pageSize, pageSize),
    ),
  );

  return {
    items: [...items, ...rest.flatMap((page) => page.data?.areas.items ?? [])],
    error: rest.find((page) => page.error)?.error ?? null,
  };
}
