/**
 * Reads every page of an offset-paginated query. The page needs the whole scope at once: the
 * official and freshness filters and the sort run in the browser.
 */
export async function collectAllPages<T>(
  fetchPage: (
    skip: number,
    limit: number,
  ) => Promise<{ items: T[]; hasNextPage: boolean }>,
  {
    pageSize = 200,
    maxItems = 5000,
  }: { pageSize?: number; maxItems?: number } = {},
): Promise<{ items: T[]; truncated: boolean }> {
  const items: T[] = [];
  for (let skip = 0; ; skip += pageSize) {
    const limit = Math.min(pageSize, maxItems - items.length);
    const page = await fetchPage(skip, limit);
    items.push(...page.items);
    if (!page.hasNextPage || page.items.length === 0) {
      return { items, truncated: false };
    }
    if (items.length >= maxItems) return { items, truncated: true };
  }
}
