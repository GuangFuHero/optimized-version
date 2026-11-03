/** Whether items this wide fit one line of a flex row `rowWidth` wide, `gap` apart. */
export function fitsOneRow(
  widths: readonly number[],
  gap: number,
  rowWidth: number,
): boolean {
  const gaps = gap * Math.max(widths.length - 1, 0);
  return widths.reduce((sum, width) => sum + width, gaps) <= rowWidth;
}

/**
 * Where the count goes when the toolbar does not fit one line:
 * - `inline`: everything fits; the count sits before the buttons.
 * - `below`: the buttons fit without the count, so the count drops to a line of its own.
 * - `withLast`: the buttons alone do not fit either, so the last of them (新增 ▾) has to wrap; the
 *   count goes down with it and sits just left of it, rather than taking a third line.
 */
export type ToolbarLayout = 'inline' | 'below' | 'withLast';

export function toolbarLayout(
  /** Every item but the count, the last button last. */
  others: readonly number[],
  count: number,
  gap: number,
  rowWidth: number,
): ToolbarLayout {
  if (fitsOneRow([...others, count], gap, rowWidth)) {
    return 'inline';
  }
  return fitsOneRow(others, gap, rowWidth) ? 'below' : 'withLast';
}
