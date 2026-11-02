/**
 * The 任務管理 toolbar's count with spaces in it (designer §開啟空間 3: 「13 筆任務 · 1 個空間」).
 * The board already counts tickets as 「N 筆任務」, so it keeps that word. `moreSpaces`: the spaces
 * list stopped at its limit, so the count is a floor: 「200+ 個空間」.
 */
export function boardCountLine(
  ticketCount: number,
  spaceCount: number,
  moreSpaces = false,
): string {
  const tickets = `${ticketCount} 筆任務`;
  if (!spaceCount) return tickets;
  return `${tickets} · ${spaceCount}${moreSpaces ? '+' : ''} 個空間`;
}
