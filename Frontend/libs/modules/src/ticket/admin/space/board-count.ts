/**
 * The 任務管理 toolbar's count with spaces in it (designer §開啟空間 3: 「13 筆任務 · 1 個空間」).
 * The board already counts tickets as 「N 筆任務」, so it keeps that word.
 */
export function boardCountLine(
  ticketCount: number,
  spaceCount: number,
): string {
  const tickets = `${ticketCount} 筆任務`;
  return spaceCount > 0 ? `${tickets} · ${spaceCount} 個空間` : tickets;
}
