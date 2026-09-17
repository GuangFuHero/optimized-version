/**
 * Design system tokens — TypeScript mirror of `Design/前台/_ds/wan-guard-design-system-.../tokens/`.
 *
 * This file is the single source of truth for every visual constant in the product. It mirrors the
 * designer's Figma export verbatim; the MUI theme is DERIVED from it (see `bridge.ts`), never the
 * other way round. When the designer re-exports, update this file and nothing else.
 *
 * Layering matches the CSS it mirrors:
 *
 *   primitives  raw, context-free values — do NOT consume these in components
 *        ↓
 *   semantic    carries design intent — this is what components use
 *
 * ## Font families come from `fonts.css`, not `primitives.css`
 *
 * The export ships two conflicting sets of font-family definitions: `primitives.css` (no CJK
 * fallback on the latin/display roles) and `fonts.css` (with CJK fallback). `semantic.css` binds to
 * the former, but every component in the prototype consumes the latter. Designer's ruling
 * (2026-09-16): **`fonts.css` wins.** So `fontFamily` below carries the `fonts.css` values and the
 * `primitives.css` font-family block is deliberately not mirrored.
 *
 * Practical effect: headings and labels are a mixed-script pairing — Nunito renders the latin
 * glyphs, Noto Sans TC picks up the CJK ones it has no coverage for.
 *
 * ## This file is currently AHEAD of `semantic.css`
 *
 * The designer's 2026-09-17 ruling changed five colour tokens and added two, but the Figma export
 * has not been regenerated yet. Until it is, `semantic.css` still shows white `on-secondary`,
 * blue-500 hovers, and no `fg-inverse` / `border-subtle`. Those are the STALE values — do not
 * "correct" this file back to match them. Each divergence is marked where it appears.
 */

/* ────────────────────────────────────────────────────────────────────────────
 * Primitives — raw values. Do not consume directly; use `semantic` below.
 * ──────────────────────────────────────────────────────────────────────────── */

export const primitives = {
  color: {
    orange: {
      50: '#FDF3E9', 100: '#FAE0C3', 200: '#F5C08B', 300: '#EC9C50', 400: '#E3791E',
      500: '#C46416', 600: '#9D4F11', 700: '#763B0D', 800: '#4F2708', 900: '#281403',
    },
    blue: {
      50: '#EEF7FB', 100: '#D0EBF5', 200: '#A1D6EA', 300: '#62BADA', 400: '#2592B9',
      500: '#1E7A9D', 600: '#18627E', 700: '#124A5F', 800: '#0C3240', 900: '#061920',
    },
    neutral: {
      50: '#F6FAFF', 100: '#EDF2F7', 200: '#E2E8F0', 300: '#CBD5E1', 400: '#94A3B8',
      500: '#64748B', 600: '#475569', 700: '#334155', 800: '#1E293B', 900: '#0F172A',
      white: '#FFFFFF', black: '#111111',
    },
    red: { 50: '#FFEBEE', 500: '#D32F2F', 700: '#B71C1C' },
    green: { 50: '#E8F5E9', 500: '#2E7D32', 700: '#1B5E20' },
    /**
     * `900` is ours, not Figma's — added 2026-09-17 because the ramp had no step dark enough to
     * set text on `amber-50`. The three status ramps all take their text colour from their own
     * darkest step, but amber-700 is far lighter than its siblings (relative luminance 0.227 vs
     * red-700's 0.110 and green-700's 0.083), so only amber failed: 3.46:1, under WCAG AA.
     *
     * Derived by holding amber-700's hue and saturation (H 21.1°, S 100%) and dropping lightness
     * to 32%. That lands at 6.09:1 on `amber-50` — between red-700's 5.75 and green-700's 7.00,
     * so the three ramps now behave alike. Staying at S 100% is what keeps it apart from the
     * desaturated `orange-600` used by the brand (ΔE 14.1, comfortably distinguishable).
     */
    amber: { 50: '#FFF3E0', 500: '#F57C00', 700: '#E65100', 900: '#A33900' },
  },

  /** Raw px scale backing spacing, radius and sizing. */
  scale: {
    4: 4, 6: 6, 8: 8, 12: 12, 16: 16, 20: 20, 24: 24, 32: 32, 48: 48, 64: 64, 80: 80, 96: 96,
    full: 9999,
  },

  fontSize: {
    xs: 12, sm: 14, base: 16, lg: 18, xl: 20, '2xl': 24, '3xl': 30, '4xl': 36, '5xl': 48,
  },

  lineHeight: { tight: 1.2, snug: 1.4, normal: 1.5, relaxed: 1.75 },

  fontWeight: { regular: 400, medium: 500, semibold: 600, bold: 700 },

  /**
   * Role aliases from `fonts.css` (authoritative — see the file docstring).
   *
   * `display` and `latin` lead with Nunito and fall through to Noto Sans TC for CJK; `body` leads
   * with Noto Sans TC because body copy is predominantly Chinese.
   */
  fontFamily: {
    chinese: '"Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif',
    latin: '"Nunito", "Poppins", "Noto Sans TC", sans-serif',
    data: '"Inter", "Noto Sans TC", sans-serif',
    display: '"Nunito", "Noto Sans TC", sans-serif',
    body: '"Noto Sans TC", "Nunito", sans-serif',
  },

  duration: { fast: '150ms', base: '250ms', slow: '400ms', spring: '350ms' },


  /** Shadows carry a warm orange tint (orange-400 at three alphas), not neutral black. */
  shadow: {
    sm: '0px 1px 4px 0px rgba(227, 121, 30, 0.10)',
    md: '0px 4px 16px 0px rgba(227, 121, 30, 0.15)',
    lg: '0px 8px 32px 0px rgba(227, 121, 30, 0.20)',
  },

  grid: { columns: 12, gap: 24, containerMaxWidth: 1200, containerPadding: 24 },
} as const;

/* ────────────────────────────────────────────────────────────────────────────
 * Font loading
 *
 * `primitives.fontFamily` above names the faces but does not make them exist. Nothing renders in
 * Noto Sans TC unless the host app actually loads it — otherwise the whole stack falls through to
 * the browser's default, which is what this product did until 2026-09-16.
 *
 * The app loads the three real faces with `next/font` and publishes each one's generated family
 * name as a CSS custom property on `<html>`. `fontStack` below is `primitives.fontFamily` with
 * those properties spliced in front, so the loaded copy wins and the bare name stays as the
 * fallback.
 *
 * Every `var()` carries an inline fallback on purpose. A bare `var(--undefined-thing)` makes the
 * whole `font-family` declaration invalid at computed-value time — the element would inherit some
 * unrelated font rather than degrade to the next name in the list.
 * ──────────────────────────────────────────────────────────────────────────── */

/** CSS custom properties the host app is expected to define. See `apps/demo/src/app/layout.tsx`. */
export const fontVariables = {
  chinese: '--font-noto-sans-tc',
  latin: '--font-nunito',
  data: '--font-inter',
} as const;

const chineseFace = `var(${fontVariables.chinese}, "Noto Sans TC")`;
const latinFace = `var(${fontVariables.latin}, "Nunito")`;
const dataFace = `var(${fontVariables.data}, "Inter")`;

/**
 * What components should actually consume. Same role names and same ordering as
 * `primitives.fontFamily`, but resolving to the loaded copy of each face.
 *
 * Poppins stays an unloaded name inside `latin`: it sits behind Nunito in the design system's own
 * ordering, so once Nunito is loaded it can never be reached for a latin glyph. Shipping it would
 * be bytes nobody renders.
 */
export const fontStack = {
  chinese: `${chineseFace}, "PingFang TC", "Microsoft JhengHei", sans-serif`,
  latin: `${latinFace}, "Poppins", ${chineseFace}, sans-serif`,
  data: `${dataFace}, ${chineseFace}, sans-serif`,
  display: `${latinFace}, ${chineseFace}, sans-serif`,
  body: `${chineseFace}, ${latinFace}, sans-serif`,
} as const satisfies Record<keyof typeof primitives.fontFamily, string>;

/* ────────────────────────────────────────────────────────────────────────────
 * Semantic — what components consume.
 * ──────────────────────────────────────────────────────────────────────────── */

const c = primitives.color;

export const semanticColor = {
  brand: {
    primary: { default: c.orange[400], subtle: c.orange[600] },
    secondary: { default: c.blue[400], subtle: c.blue[600] },
  },

  /**
   * Text and icon colors. `on*` are the readable colors laid over the matching `bg` fill.
   *
   * `onSecondary` and `onInfo` are BLACK, not white — designer's ruling of 2026-09-17 after white
   * on `#2592B9` measured 3.56:1, under WCAG AA. Black on the same fill is 5.30:1, and keeping the
   * fill means nothing else in the palette had to move.
   *
   * `inverse` is the escape hatch for the cases that ruling breaks: white, for text that sits on a
   * genuinely dark surface where the `on*` colour would vanish.
   */
  fg: {
    onPrimary: c.neutral.black,
    onSecondary: c.neutral.black,
    onDanger: c.neutral.white,
    onSuccess: c.neutral.white,
    onWarning: c.neutral.black,
    onInfo: c.neutral.black,
    inverse: c.neutral.white,

    danger: c.red[700],
    success: c.green[700],
    // amber-900, not -700: see the primitive's note. -700 measures 3.46:1 on the subtle fill.
    warning: c.amber[900],
    info: c.blue[700],
    disable: c.neutral[500],

    /**
     * `muted` is neutral-500, not the neutral-400 the Figma export carries. Changed 2026-09-17: at
     * neutral-400 it measured 2.56 / 2.45 / 2.28 on the three surfaces — under even the 3:1
     * non-text bar — while the product used it for the search placeholder, empty-state copy and
     * timestamps. neutral-500 reaches 4.76 on `default` and 4.54 on `subtle`.
     *
     * ⚠️ Not for `bg.neutral.sunken`, where it only reaches 4.23. Nothing renders it there today
     * (verified in the browser: every occurrence sits on `subtle`), and the spec pins that.
     *
     * It is the same value as `fg.disable`, deliberately. Disabled controls are identified by
     * `bg.disable` plus `border.disable`, never by their label colour alone, so the two never have
     * to be told apart by hue. neutral-600 would avoid the overlap but lands ΔE 8.6 from
     * `subtle` — close enough to erase the distinction that makes `muted` worth having.
     */
    neutral: { default: c.neutral[900], subtle: c.neutral[700], muted: c.neutral[500] },
  },

  /**
   * Surface and fill colors. Every status carries an explicit `hover` SOLID — the design system
   * does not derive hover states by compositing alpha over the base, so neither should we.
   */
  bg: {
    primary: { default: c.orange[400], hover: c.orange[500], subtle: c.orange[50] },
    // Hover lightens rather than darkens: with black labels, blue-500 would drop to 3.89:1.
    secondary: { default: c.blue[400], hover: c.blue[300], subtle: c.blue[50] },
    danger: { default: c.red[500], hover: c.red[700], subtle: c.red[50] },
    success: { default: c.green[500], hover: c.green[700], subtle: c.green[50] },
    warning: { default: c.amber[500], hover: c.amber[700], subtle: c.amber[50] },
    info: { default: c.blue[400], hover: c.blue[300], subtle: c.blue[50] },
    disable: c.neutral[200],
    neutral: { default: c.neutral.white, subtle: c.neutral[50], sunken: c.neutral[100] },
  },

  /**
   * `subtle` is the divider weight, added 2026-09-17. It shares neutral-200 with `bg.disable`:
   * one is a hairline, the other a filled block, so they never meet — but do not "deduplicate"
   * them into one token, they answer to different design decisions.
   */
  border: {
    disable: c.neutral[500],
    default: c.neutral[300],
    subtle: c.neutral[200],
    accent: c.orange[200],
  },
} as const;

export const semanticShadow = {
  sm: primitives.shadow.sm,
  md: primitives.shadow.md,
  lg: primitives.shadow.lg,
} as const;

export const semanticRadius = {
  sm: primitives.scale[6],
  md: primitives.scale[12],
  lg: primitives.scale[20],
  xl: primitives.scale[32],
  full: primitives.scale.full,
} as const;

/**
 * 4px grid. The key tracks Figma's own numbering, so it is not a dense sequence — 5, 7, 9… do not
 * exist on purpose. Note 4, 12 and 20 are not multiples of 8, so MUI's default 8px `spacing()` unit
 * cannot express them as whole steps; consume these values rather than `theme.spacing()`.
 */
export const semanticSpacing = {
  1: primitives.scale[4],
  2: primitives.scale[8],
  3: primitives.scale[12],
  4: primitives.scale[16],
  6: primitives.scale[24],
  8: primitives.scale[32],
  12: primitives.scale[48],
  16: primitives.scale[64],
  20: primitives.scale[80],
  24: primitives.scale[96],
} as const;

/* ────────────────────────────────────────────────────────────────────────────
 * Typography
 * ──────────────────────────────────────────────────────────────────────────── */

export interface TypeStyle {
  fontFamily: string;
  /** px */
  fontSize: number;
  fontWeight: number;
  /** unitless multiplier */
  lineHeight: number;
}

// `fontStack`, not `primitives.fontFamily`: these styles are consumed by components, so they have
// to name the loaded copy of each face.
const f = fontStack;
const fs = primitives.fontSize;
const fw = primitives.fontWeight;
const lh = primitives.lineHeight;

/**
 * Four families of text, each with a numeric weight scale borrowed from the Figma naming.
 *
 * - `heading` display family, for titles
 * - `body`    reading copy
 * - `label`   UI chrome — buttons, tabs, chips, nav
 * - `data`    tabular numerals; pair with `font-variant-numeric: tabular-nums`
 */
export const semanticTypography = {
  heading: {
    600: { fontFamily: f.display, fontSize: fs.xl, fontWeight: fw.bold, lineHeight: lh.snug },
    700: { fontFamily: f.display, fontSize: fs['2xl'], fontWeight: fw.bold, lineHeight: lh.snug },
    800: { fontFamily: f.display, fontSize: fs['3xl'], fontWeight: fw.bold, lineHeight: lh.tight },
    900: { fontFamily: f.display, fontSize: fs['4xl'], fontWeight: fw.bold, lineHeight: lh.tight },
  },
  body: {
    300: { fontFamily: f.body, fontSize: fs.sm, fontWeight: fw.regular, lineHeight: lh.normal },
    400: { fontFamily: f.body, fontSize: fs.base, fontWeight: fw.regular, lineHeight: lh.normal },
    500: { fontFamily: f.body, fontSize: fs.lg, fontWeight: fw.regular, lineHeight: lh.relaxed },
  },
  label: {
    300: { fontFamily: f.latin, fontSize: fs.xs, fontWeight: fw.regular, lineHeight: lh.normal },
    400: { fontFamily: f.latin, fontSize: fs.sm, fontWeight: fw.bold, lineHeight: lh.tight },
    500: { fontFamily: f.latin, fontSize: fs.base, fontWeight: fw.bold, lineHeight: lh.tight },
  },
  data: {
    300: { fontFamily: f.data, fontSize: fs.xs, fontWeight: fw.regular, lineHeight: lh.normal },
    400: { fontFamily: f.data, fontSize: fs.sm, fontWeight: fw.bold, lineHeight: lh.tight },
    500: { fontFamily: f.data, fontSize: fs.base, fontWeight: fw.bold, lineHeight: lh.tight },
  },
} as const satisfies Record<string, Record<number, TypeStyle>>;

/**
 * Heading and body shrink below 600px; label and data keep their physical size so UI chrome and
 * numerals stay legible. 600px is the design system's only breakpoint — it lines up with MUI's `sm`,
 * NOT with the bespoke `tablet: 768` in this theme.
 *
 * ⚠️ MIRRORED BUT NOT YET APPLIED. `theme.ts` sets no breakpoint-dependent type sizes, so the
 * product currently renders desktop sizes at every width. This table is here so the values are not
 * lost, not because responsive typography works — wiring it up changes what every heading looks
 * like on a phone, which is a deliberate step, not a side effect of mirroring the tokens.
 */
export const MOBILE_BREAKPOINT_PX = 600;

export const semanticTypographyMobile = {
  heading: {
    600: { ...semanticTypography.heading[600], fontSize: 18 },
    700: { ...semanticTypography.heading[700], fontSize: 20 },
    800: { ...semanticTypography.heading[800], fontSize: 24 },
    900: { ...semanticTypography.heading[900], fontSize: 28 },
  },
  body: {
    300: { ...semanticTypography.body[300], fontSize: 12 },
    400: { ...semanticTypography.body[400], fontSize: 14 },
    500: { ...semanticTypography.body[500], fontSize: 16 },
  },
} as const satisfies Record<string, Record<number, TypeStyle>>;

/* ────────────────────────────────────────────────────────────────────────────
 * Elevation & motion
 * ──────────────────────────────────────────────────────────────────────────── */

/** z-index ladder. Each rung is paired with the shadow the design system expects at that depth. */
export const semanticElevation = {
  base: 1,
  card: 10,
  nav: 100,
  drawer: 500,
  modal: 1000,
  toast: 2000,
} as const;

/**
 * Shadow expected at each z rung. `base` is none, confirmed by the designer 2026-09-17: z-base is
 * ordinary in-flow content, not a raised layer.
 *
 * A card's `shadow.md` travels with the CARD, not with the z rung — a card that happens to sit at
 * base still casts it. Read this table as "what a layer at this depth gets", not as a lookup that
 * overrides a component's own elevation.
 */
export const elevationShadow = {
  base: 'none',
  card: semanticShadow.md,
  nav: semanticShadow.sm,
  drawer: semanticShadow.lg,
  modal: semanticShadow.lg,
  toast: semanticShadow.lg,
} as const;

export const semanticMotion = {
  duration: primitives.duration,
  easing: {
    /** Signature gentle overshoot. */
    spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
    out: 'cubic-bezier(0.22, 1, 0.36, 1)',
  },
  transition: {
    fast: '150ms ease',
    base: '250ms ease',
    slow: '400ms ease',
    spring: '350ms cubic-bezier(0.34, 1.56, 0.64, 1)',
  },
} as const;

/* ────────────────────────────────────────────────────────────────────────────
 * Utilities
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * A token colour at partial opacity.
 *
 * For scrims, hover washes and highlight tints — the places a design needs "this colour, but
 * faint". Those were previously written as literal `rgba(...)` triples, which meant they kept
 * pointing at whatever the base colour used to be long after the token moved; deriving them keeps
 * the hue in one place.
 *
 * Emits `rgba()` rather than `color-mix()` so the result composites over whatever is behind it,
 * which is what a scrim has to do.
 *
 * @param hex - `#RRGGBB`. Anything else is returned unchanged rather than throwing: a bad colour
 *   should degrade to a visible wrong colour, not blank out the element that uses it.
 * @param alpha - 0–1.
 */
export function withAlpha(hex: string, alpha: number): string {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim());

  if (!match) {
    return hex;
  }

  const value = parseInt(match[1], 16);

  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Aggregate
 * ──────────────────────────────────────────────────────────────────────────── */

export const designTokens = {
  primitives,
  fontVariables,
  fontStack,
  color: semanticColor,
  shadow: semanticShadow,
  radius: semanticRadius,
  spacing: semanticSpacing,
  typography: semanticTypography,
  typographyMobile: semanticTypographyMobile,
  elevation: semanticElevation,
  elevationShadow,
  motion: semanticMotion,
  grid: primitives.grid,
  mobileBreakpointPx: MOBILE_BREAKPOINT_PX,
} as const;

export type DesignTokens = typeof designTokens;
