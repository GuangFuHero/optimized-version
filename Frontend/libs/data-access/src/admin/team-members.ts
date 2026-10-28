/** Read every page before building a roster or checking its last administrator. */
export async function readAllTeamMembers<T>(
  readPage: (skip: number, limit: number) => Promise<T[]>,
  pageSize = 200,
): Promise<T[]> {
  const members: T[] = [];
  for (;;) {
    const page = await readPage(members.length, pageSize);
    members.push(...page);
    if (page.length < pageSize) return members;
  }
}
