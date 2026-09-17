/**
 * Bridge: design system tokens → Material 3 color roles.
 *
 * `design-tokens.ts` mirrors what the designer ships; MUI wants an M3 color scheme. The two use
 * different taxonomies, so this file owns every judgement call needed to get from one to the other.
 *
 * Every color role resolves to a SEMANTIC design token, with three deliberate exceptions —
 * `inverseSurface`, `inverseOnSurface` and `inversePrimary`, which M3 needs for inverted surfaces
 * (snackbars) and the design system has no counterpart for at all. Those reach into the primitive
 * ramp and are marked where they appear. Nothing here invents a hex value.
 *
 * Adding this file changes no rendering on its own. `tokens.ts` still carries its own hand-written
 * scheme; switching it over to consume `designToM3Light` is a separate step, because the two differ
 * enough to move pixels (the hand-written `primary` is blue `#179BC6`; the design system's is orange
 * `#E3791E`).
 *
 * ## The three structural gaps
 *
 * M3 cannot express everything the design system does. Rather than lose those roles, they live in
 * `designExtensions` and reach components through the theme's `rescue` slot:
 *
 * 1. **`info`** — M3 ships exactly one status color (`error`). The design system has four
 *    (danger / success / warning / info).
 * 2. **Hover solids** — MUI derives hover by compositing `alpha()` over the base fill. The design
 *    system specifies a different solid for every hover state, so the composited result is wrong.
 * 3. **A third foreground tier** — M3 stops at `onSurface` / `onSurfaceVariant`. The design system
 *    has `default` / `subtle` / `muted`.
 *
 * ## Roles M3 asks for that the design system does not define
 *
 * - `tertiary*` — no counterpart. Aliased onto secondary rather than inventing a hue; if a third
 *   accent is ever needed, it has to come from the designer, not from here.
 * - `surfaceContainer{Lowest,Low,_,High,Highest}` — M3 wants five tints of the surface, the design
 *   system has three. See the surface block for the pairing the designer specified.
 */

import {
  designTokens,
  elevationShadow,
  withAlpha,
  semanticElevation,
  semanticMotion,
  semanticRadius,
  semanticShadow,
  semanticSpacing,
} from './design-tokens';
import type { M3ColorScheme } from './m3-color-scheme';

const { color, primitives } = designTokens;
const { brand, fg, bg, border } = color;
const neutral = primitives.color.neutral;

/**
 * Opacity of the modal scrim. The designer's 2026-09-17 answer to "can we have more neutral tiers"
 * was that depth is a scrim problem, not a palette problem — screenshots with and without this
 * value settled it, so it is a design constant rather than a number someone tuned by eye.
 */
const SCRIM_ALPHA = 0.45;

/**
 * The design system's light scheme expressed as M3 color roles.
 *
 * Read the surface block against `design-tokens.ts` before editing: `background` and `surface` are
 * the *subtle* neutral (`#F6FAFF`), not white. White is `surfaceContainerLowest` — it is the raised
 * card sitting on the page, not the page.
 */
export const designToM3Light: M3ColorScheme = {
  // ── Core ──────────────────────────────────────────────────────────────────
  primary: brand.primary.default,
  onPrimary: fg.onPrimary,
  primaryContainer: bg.primary.subtle,
  onPrimaryContainer: brand.primary.subtle,

  secondary: brand.secondary.default,
  onSecondary: fg.onSecondary,
  secondaryContainer: bg.secondary.subtle,
  onSecondaryContainer: brand.secondary.subtle,

  // No tertiary in the design system — aliased onto secondary. See the file docstring.
  tertiary: brand.secondary.default,
  onTertiary: fg.onSecondary,
  tertiaryContainer: bg.secondary.subtle,
  onTertiaryContainer: brand.secondary.subtle,

  error: bg.danger.default,
  onError: fg.onDanger,
  errorContainer: bg.danger.subtle,
  onErrorContainer: fg.danger,

  // ── Surface ───────────────────────────────────────────────────────────────
  // `background` is the page, `surface` is the thing drawn on it — the design system keeps those
  // apart (`base.css` paints the body `subtle`, while cards are `default`), so they differ here.
  background: bg.neutral.subtle,
  onBackground: fg.neutral.default,
  surface: bg.neutral.default,
  onSurface: fg.neutral.default,
  surfaceVariant: bg.neutral.sunken,
  onSurfaceVariant: fg.neutral.subtle,

  // Five M3 rungs onto three design-system tints, pairing exactly as the designer specified on
  // 2026-09-17. Asked whether to add more neutral steps, the answer was no, for two reasons worth
  // recording: the ramp has nowhere to put them (neutral-200 is already `bg.disable`), and the
  // problem they would solve — telling a dialog apart from the card behind it — is solved by a
  // scrim, not by a slightly different grey. See `overlay` in `designExtensions`.
  surfaceContainerLowest: bg.neutral.default,
  surfaceContainerLow: bg.neutral.subtle,
  surfaceContainer: bg.neutral.subtle,
  surfaceContainerHigh: bg.neutral.sunken,
  surfaceContainerHighest: bg.neutral.sunken,

  // ── Outline ───────────────────────────────────────────────────────────────
  // `border.subtle` (neutral-200) is the divider weight the designer added on 2026-09-17, so the
  // two M3 outline roles no longer collapse into one.
  //
  // `border.disable` (neutral-500) is DARKER than `border.default` despite the name, so it is not
  // the fainter variant; it belongs to the disabled trio in `designExtensions`.
  outline: border.default,
  outlineVariant: border.subtle,

  // ── Inverse ───────────────────────────────────────────────────────────────
  // The three roles with no semantic counterpart (see the file docstring). Inverted surfaces are
  // not a concept the design system covers, so these read the primitive ramp directly.
  inverseSurface: neutral[800],
  inverseOnSurface: neutral[50],
  inversePrimary: primitives.color.orange[200],

  // ── Other ─────────────────────────────────────────────────────────────────
  // The design system's elevation is warm: its shadows are orange-400 at three alphas, not black.
  // The composed box-shadow strings live in `designExtensions.shadow`; this is only the base hue.
  shadow: brand.primary.default,
  scrim: withAlpha(neutral[900], SCRIM_ALPHA),
  surfaceTint: brand.primary.default,

  // ── Semantic (rescue) ─────────────────────────────────────────────────────
  danger: bg.danger.default,
  onDanger: fg.onDanger,
  dangerContainer: bg.danger.subtle,
  onDangerContainer: fg.danger,

  warning: bg.warning.default,
  onWarning: fg.onWarning,
  warningContainer: bg.warning.subtle,
  onWarningContainer: fg.warning,

  safe: bg.success.default,
  onSafe: fg.onSuccess,
  safeContainer: bg.success.subtle,
  onSafeContainer: fg.success,
};

/** A status color the design system defines and M3 has no slot for. */
export interface StatusColor {
  /** Solid fill. */
  main: string;
  /** Readable color on top of `main`. */
  on: string;
  /** Solid fill for the hovered state — not `main` with alpha composited over it. */
  hover: string;
  /** Tinted background for badges, banners and chips. */
  subtle: string;
  /** Readable color on top of `subtle`. */
  onSubtle: string;
}

function statusColor(
  fill: { default: string; hover: string; subtle: string },
  on: string,
  onSubtle: string,
): StatusColor {
  return { main: fill.default, on, hover: fill.hover, subtle: fill.subtle, onSubtle };
}

/**
 * Everything the design system carries that M3 has nowhere to put.
 *
 * Reaches components through the theme's `rescue` slot, alongside the existing module palettes.
 */
export const designExtensions = {
  /** Gap 1 + 2: the full status set, each with its own hover solid. */
  status: {
    primary: statusColor(bg.primary, fg.onPrimary, brand.primary.subtle),
    secondary: statusColor(bg.secondary, fg.onSecondary, brand.secondary.subtle),
    danger: statusColor(bg.danger, fg.onDanger, fg.danger),
    success: statusColor(bg.success, fg.onSuccess, fg.success),
    warning: statusColor(bg.warning, fg.onWarning, fg.warning),
    info: statusColor(bg.info, fg.onInfo, fg.info),
  },

  /** Gap 3: M3 stops at two foreground tiers. */
  foreground: {
    default: fg.neutral.default,
    subtle: fg.neutral.subtle,
    muted: fg.neutral.muted,
    /**
     * White, for text on a genuinely dark fill. Needed because `on*` went black in 2026-09-17:
     * anything sitting on a dark surface has to opt out of that rule explicitly.
     */
    inverse: fg.inverse,
  },

  /** Disabled state. Named `border.disable` upstream, but it is the disabled trio, not an outline. */
  disabled: {
    background: bg.disable,
    foreground: fg.disable,
    border: border.disable,
  },

  /** Warm border accent — no M3 counterpart. */
  borderAccent: border.accent,

  /** Divider weight, one step lighter than `outline`. */
  borderSubtle: border.subtle,

  /**
   * How a floating layer separates itself from what is behind it.
   *
   * Two rules from the designer, both consequences of the shadows being warm: an orange-tinted
   * shadow over a white card is nearly invisible, so shadow alone cannot carry the separation.
   *
   * - `scrim` — dialogs and modals dim the page behind them, then take `shadow.lg`.
   * - `border` — overlays with NO scrim (popovers, menus, scrimless drawers) take `shadow.lg` plus
   *   this hairline, which is what actually draws their edge.
   */
  overlay: {
    scrim: withAlpha(neutral[900], SCRIM_ALPHA),
    border: `1px solid ${border.default}`,
    shadow: semanticShadow.lg,
  },

  /** Composed box-shadow strings, orange-tinted. MUI's own `shadows[]` array stays neutral. */
  shadow: semanticShadow,

  /** z-index ladder, and the shadow expected at each rung. */
  elevation: semanticElevation,
  elevationShadow,

  radius: semanticRadius,
  spacing: semanticSpacing,
  motion: semanticMotion,
} as const;

export type DesignExtensions = typeof designExtensions;
