/** Whether items this wide fit one line of a flex row `rowWidth` wide, `gap` apart. */
export function fitsOneRow(
  widths: readonly number[],
  gap: number,
  rowWidth: number,
): boolean {
  const gaps = gap * Math.max(widths.length - 1, 0);
  return widths.reduce((sum, width) => sum + width, gaps) <= rowWidth;
}
