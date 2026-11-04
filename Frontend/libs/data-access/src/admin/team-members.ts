/**
 * Read every page: a roster or its last-administrator check, and the review queue, whose badge and
 * kind chips would otherwise stop at the backend's first page.
 */
export async function readAllPages<T>(
  readPage: (skip: number, limit: number) => Promise<T[]>,
  pageSize = 200,
): Promise<T[]> {
  const rows: T[] = [];
  for (;;) {
    const page = await readPage(rows.length, pageSize);
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}
