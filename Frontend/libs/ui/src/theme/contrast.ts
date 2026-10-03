/**
 * WCAG 2.x contrast maths.
 *
 * Lives in `src` rather than in a test helper because the numbers it produces are design facts the
 * team argues about — the answer to "is this pair legible" should come from one implementation, not
 * from whichever spreadsheet someone had open.
 */

/** Minimum contrast for body-sized text (WCAG 2.1 AA, 1.4.3). */
export const AA_TEXT = 4.5;

/** Minimum for large text (≥18pt, or ≥14pt bold) and for UI components (1.4.11). */
export const AA_LARGE = 3;

function channelLuminance(value: number): number {
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

/**
 * Relative luminance per WCAG 2.x.
 *
 * @param hex - `#RRGGBB`. Shorthand and alpha forms are rejected: a contrast figure computed from a
 *   colour that was silently mis-parsed is worse than no figure, because it reads as verified.
 */
export function relativeLuminance(hex: string): number {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim());

  if (!match) {
    throw new Error(`relativeLuminance expects #RRGGBB, received ${hex}`);
  }

  const value = parseInt(match[1], 16);
  const [r, g, b] = [(value >> 16) & 255, (value >> 8) & 255, value & 255].map(
    (channel) => channelLuminance(channel / 255),
  );

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contrast ratio between two opaque colours, 1–21. Order does not matter. */
export function contrastRatio(a: string, b: string): number {
  const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort(
    (x, y) => y - x,
  );

  return (lighter + 0.05) / (darker + 0.05);
}
