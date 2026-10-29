/**
 * Bottom space for something that meets the foot of a phone's screen: a bottom sheet's last row, a
 * floating button, a bar under the map. `space` px, plus the height of an iPhone's home indicator
 * (`env(safe-area-inset-bottom)`), so every such place clears it the same way, as the prototype does.
 * Use it for `pb`, or for `bottom` on something fixed.
 *
 * The inset is 0 unless the page's viewport sets `viewport-fit=cover`, and a browser without it
 * takes 0.
 */
export function safeAreaBottom(space: number): string {
  const inset = 'env(safe-area-inset-bottom, 0px)';

  return space === 0 ? inset : `calc(${space}px + ${inset})`;
}
