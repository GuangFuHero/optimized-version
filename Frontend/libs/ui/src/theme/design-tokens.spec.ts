import { describe, expect, it } from 'vitest';

import { AA_TEXT, contrastRatio } from './contrast';
import { designExtensions, designToM3Light } from './bridge';
import {
  designTokens,
  DISPLAY_SCALE_MOBILE_MEDIA,
  displayTextSize,
  displayTextSizeCss,
  fontStack,
  fontVariables,
  IOS_NO_ZOOM_INPUT_PX,
  type DisplayTextStep,
} from './design-tokens';
import { theme } from './theme';

const { color, primitives } = designTokens;

/**
 * These are the checks the compiler cannot make.
 *
 * Every colour in this design system is a `string` to TypeScript, so swapping a legible token for
 * an illegible one type-checks, lints and builds cleanly. Two of the accessibility defects this
 * codebase shipped — white on `#2592B9` at 3.56:1, and `fg.warning` at 3.46:1 on its own fill —
 * were introduced exactly that way and survived until someone measured by hand. This file is the
 * measurement, run automatically.
 */
describe('foreground / fill pairings', () => {
  /**
   * `on*` is the label colour for the matching solid fill. They are declared as a pair precisely so
   * nobody picks a fill and guesses the label, which is how white ended up on light amber.
   */
  const solidPairs: [name: string, fg: string, bg: string][] = [
    ['primary', color.fg.onPrimary, color.bg.primary.default],
    ['primary · hover', color.fg.onPrimary, color.bg.primary.hover],
    ['secondary', color.fg.onSecondary, color.bg.secondary.default],
    ['secondary · hover', color.fg.onSecondary, color.bg.secondary.hover],
    ['danger', color.fg.onDanger, color.bg.danger.default],
    ['danger · hover', color.fg.onDanger, color.bg.danger.hover],
    ['success', color.fg.onSuccess, color.bg.success.default],
    ['success · hover', color.fg.onSuccess, color.bg.success.hover],
    ['warning', color.fg.onWarning, color.bg.warning.default],
    ['warning · hover', color.fg.onWarning, color.bg.warning.hover],
    ['info', color.fg.onInfo, color.bg.info.default],
    ['info · hover', color.fg.onInfo, color.bg.info.hover],
  ];

  it.each(solidPairs)('%s solid fill carries readable label text', (_n, fg, bg) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  /**
   * The tinted variants — badges, status strips, banners. `warning` is the one that failed here at
   * 3.46:1, which is what forced the `amber-900` primitive into existence.
   */
  const subtlePairs: [name: string, fg: string, bg: string][] = [
    ['primary', color.brand.primary.subtle, color.bg.primary.subtle],
    ['secondary', color.brand.secondary.subtle, color.bg.secondary.subtle],
    ['danger', color.fg.danger, color.bg.danger.subtle],
    ['success', color.fg.success, color.bg.success.subtle],
    ['warning', color.fg.warning, color.bg.warning.subtle],
    ['info', color.fg.info, color.bg.info.subtle],
    ['neutral', color.fg.neutral.subtle, color.bg.neutral.sunken],
  ];

  it.each(subtlePairs)('%s subtle fill carries readable label text', (_n, fg, bg) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  /** Body and secondary copy, on each surface they are allowed to sit on. */
  const surfaces = [
    color.bg.neutral.default,
    color.bg.neutral.subtle,
    color.bg.neutral.sunken,
  ];

  it.each(surfaces)('default and subtle text stay readable on %s', (surface) => {
    expect(contrastRatio(color.fg.neutral.default, surface)).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrastRatio(color.fg.neutral.subtle, surface)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  /**
   * `muted` carries real copy — the search placeholder, empty states, timestamps — so it is held to
   * the text bar, not the decorative one. It sat at neutral-400 (2.56 / 2.45 / 2.28, under even the
   * 3:1 bar) until 2026-09-17.
   *
   * `sunken` is excluded on purpose: muted reaches only 4.23 there, and nothing renders it on that
   * surface. The exclusion is the rule, so it is asserted rather than left to memory.
   */
  const mutedSurfaces = [color.bg.neutral.default, color.bg.neutral.subtle];

  it.each(mutedSurfaces)('muted text stays readable on %s', (surface) => {
    expect(contrastRatio(color.fg.neutral.muted, surface)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it('muted is not light enough for the sunken surface, and callers must not use it there', () => {
    expect(contrastRatio(color.fg.neutral.muted, color.bg.neutral.sunken)).toBeLessThan(AA_TEXT);
  });

  it('inverse text is readable on the darkest surface it is used over', () => {
    expect(contrastRatio(color.fg.inverse, primitives.color.neutral[800])).toBeGreaterThanOrEqual(
      AA_TEXT,
    );
  });
});

/**
 * The status ramps are meant to behave alike: each takes its text colour from its own darkest step
 * and sets it on its own lightest. amber silently broke that rule — amber-700 is more than twice as
 * light as red-700 — and nothing noticed until a badge was measured.
 */
describe('status ramps stay consistent with each other', () => {
  const darkest: [name: string, text: string, fill: string][] = [
    ['danger', primitives.color.red[700], primitives.color.red[50]],
    ['success', primitives.color.green[700], primitives.color.green[50]],
    ['warning', primitives.color.amber[900], primitives.color.amber[50]],
  ];

  it.each(darkest)('%s text step is dark enough for its own 50 step', (_n, text, fill) => {
    expect(contrastRatio(text, fill)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it('no status text step is wildly lighter than its siblings', () => {
    const luminances = darkest.map(([, text]) => relativeLuminanceOf(text));
    const spread = Math.max(...luminances) / Math.min(...luminances);

    // amber-700 sat at 2.7x green-700 when this broke. Two ramps can differ, but not by that much.
    expect(spread).toBeLessThan(2);
  });
});

function relativeLuminanceOf(hex: string) {
  // Local re-export keeps the assertion above readable without widening `contrast.ts`'s surface.
  return contrastRatio(hex, '#000000') - 1;
}

describe('M3 bridge', () => {
  const paletteValues = new Set<string>([
    ...Object.values(primitives.color.orange),
    ...Object.values(primitives.color.blue),
    ...Object.values(primitives.color.neutral),
    ...Object.values(primitives.color.red),
    ...Object.values(primitives.color.green),
    ...Object.values(primitives.color.amber),
  ]);

  it('invents no colour of its own', () => {
    const offPalette = Object.entries(designToM3Light)
      .filter(([, value]) => /^#[0-9a-f]{6}$/i.test(value))
      .filter(([, value]) => !paletteValues.has(value.toUpperCase()));

    expect(offPalette).toEqual([]);
  });

  /**
   * An outlined control sitting on a surface of the same colour has an invisible border. The five
   * M3 surface rungs collapse onto three design tints, and an earlier mapping pushed the top rung
   * onto neutral-300 — the same value as `outline`.
   */
  it('keeps every surface rung distinct from the outline colours', () => {
    const rungs = [
      designToM3Light.surface,
      designToM3Light.surfaceContainerLowest,
      designToM3Light.surfaceContainerLow,
      designToM3Light.surfaceContainer,
      designToM3Light.surfaceContainerHigh,
      designToM3Light.surfaceContainerHighest,
      designToM3Light.background,
    ];

    for (const rung of rungs) {
      expect(rung).not.toBe(designToM3Light.outline);
      expect(rung).not.toBe(designToM3Light.outlineVariant);
    }
  });

  /**
   * Nothing in this product identifies a control by its border alone — the design system's
   * `border.default` is 1.48:1 on white and the designer confirmed that is intentional. So this
   * asserts the weaker rule that actually holds: the two outline weights must differ from each
   * other, otherwise `outlineVariant` is not a variant of anything.
   */
  it('keeps the two outline weights distinguishable from each other', () => {
    expect(designToM3Light.outline).not.toBe(designToM3Light.outlineVariant);
    expect(relativeLuminanceOf(designToM3Light.outlineVariant)).toBeGreaterThan(
      relativeLuminanceOf(designToM3Light.outline),
    );
  });

  it('keeps raised surfaces lighter than the page they sit on', () => {
    // `background.paper` maps to `surfaceContainerLowest`; a card must not read as a recess.
    expect(relativeLuminanceOf(designToM3Light.surfaceContainerLowest)).toBeGreaterThan(
      relativeLuminanceOf(designToM3Light.background),
    );
  });

  it('separates disabled text from ordinary secondary text', () => {
    expect(designExtensions.disabled.foreground).not.toBe(designToM3Light.onSurfaceVariant);
  });
});

/**
 * The product is predominantly Traditional Chinese. Before this was wired up, every `font-family`
 * in the theme listed four latin-only faces, so all CJK fell through to whatever the browser chose
 * — a different typeface on every machine, and nothing in the build said so.
 */
describe('font stacks', () => {
  it.each(Object.entries(fontStack))('%s stack can render CJK', (_role, stack) => {
    expect(stack).toContain('Noto Sans TC');
  });

  it.each(Object.entries(fontStack))('%s stack ends in a generic family', (_role, stack) => {
    expect(stack.trim().endsWith('sans-serif')).toBe(true);
  });

  /**
   * A bare `var(--missing)` invalidates the whole declaration at computed-value time, so the
   * element inherits an unrelated font instead of falling through the list.
   */
  it.each(Object.entries(fontStack))('%s stack gives every var() a fallback', (_role, stack) => {
    for (const reference of stack.match(/var\([^)]*\)/g) ?? []) {
      expect(reference).toContain(',');
    }
  });

  it('names the same custom properties the app defines', () => {
    for (const property of Object.values(fontVariables)) {
      expect(property).toMatch(/^--font-[a-z-]+$/);
    }
  });
});

describe('scales', () => {
  it('keeps spacing on the 4px grid', () => {
    for (const step of Object.values(designTokens.spacing)) {
      expect(step % 4).toBe(0);
    }
  });

  it('orders the z-index ladder', () => {
    const { base, card, nav, drawer, modal, toast } = designTokens.elevation;
    const ladder = [base, card, nav, drawer, modal, toast];

    expect(ladder).toEqual([...ladder].sort((a, b) => a - b));
  });

  it('tints every shadow with the brand orange rather than neutral black', () => {
    for (const shadow of Object.values(designTokens.shadow)) {
      expect(shadow).toContain('rgba(227, 121, 30');
    }
  });
});

/**
 * The display scale exists because responders read this outdoors, on a phone, and many of them are
 * elderly. Every rule below is a design ruling that the type system is blind to: `fontSize: 11` and
 * `fontSize: 15` are both `number`, so shrinking the mobile end type-checks perfectly and silently
 * undoes the one thing this scale is for. That regression already happened once in the prototype —
 * the first pass shipped +2 and came back as 「字體沒有變大」.
 */
describe('display text scale', () => {
  const steps = Object.keys(displayTextSize).map(Number) as DisplayTextStep[];

  it('mirrors the --fs-* ladder in site.css', () => {
    expect(steps).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18, 20, 24]);
  });

  it('keys are the desktop size, so porting from the prototype is a lookup', () => {
    for (const step of steps) {
      expect(displayTextSize[step].tablet).toBe(step);
    }
  });

  it.each(steps)('grows rather than shrinks on a phone (%i)', (step) => {
    expect(displayTextSize[step].mobile).toBeGreaterThan(displayTextSize[step].tablet);
  });

  it('shifts the small end by +4 and the large end by +2', () => {
    const delta = (step: DisplayTextStep) =>
      displayTextSize[step].mobile - displayTextSize[step].tablet;

    expect(delta(10)).toBe(4);
    expect(delta(14)).toBe(4);
    expect(delta(18)).toBe(4);
    expect(delta(20)).toBe(3);
    expect(delta(24)).toBe(2);
  });

  /**
   * The whole ladder moves together on purpose. Enlarging only the "important" text would collapse
   * 11-vs-14 — "footnote vs content" — into one size, and the reader would have to relearn the
   * hierarchy on a phone.
   */
  it('keeps every step distinguishable at both widths', () => {
    const mobile = steps.map((s) => displayTextSize[s].mobile);
    const tablet = steps.map((s) => displayTextSize[s].tablet);

    expect(mobile).toStrictEqual([...mobile].sort((a, b) => a - b));
    expect(tablet).toStrictEqual([...tablet].sort((a, b) => a - b));
    expect(new Set(mobile).size).toBe(mobile.length);
    expect(new Set(tablet).size).toBe(tablet.length);
  });

  /**
   * `sx` values switch at the theme's `tablet` breakpoint, computed by MUI. `<GlobalStyles>` rules
   * switch at `DISPLAY_SCALE_MOBILE_MEDIA`, a hand-written string. If the breakpoint ever moves and
   * the string does not, markers and clusters would change size at a different width from the rest
   * of the page — silently, since both paths still render.
   */
  it('uses the same cutoff for sx and non-sx contexts', () => {
    expect(theme.breakpoints.down('tablet')).toBe(DISPLAY_SCALE_MOBILE_MEDIA);
  });

  it('emits the 767px cutoff for contexts MUI will not resolve', () => {
    expect(displayTextSizeCss(13)).toStrictEqual({
      fontSize: 13,
      '@media (max-width:767.95px)': { fontSize: 17 },
    });
    expect(DISPLAY_SCALE_MOBILE_MEDIA).toBe('@media (max-width:767.95px)');
  });

  /** Below 16px, iOS Safari zooms the page on focus and the user has to pinch back out. */
  it('keeps inputs at the size iOS will not zoom', () => {
    expect(IOS_NO_ZOOM_INPUT_PX).toBe(16);
  });
});
