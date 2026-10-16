/**
 * The Material 3 color-role contract, on its own so both sides of the bridge can name it.
 *
 * It used to live in `tokens.ts`. `bridge.ts` needs the type to describe what it produces, and
 * `tokens.ts` needs bridge's *value* to populate the light scheme — leaving the type in `tokens.ts`
 * would point those two files at each other. A type-only import is erased at build time so nothing
 * would have broken at runtime, but the dependency arrow would read backwards from how the data
 * actually flows: design tokens → bridge → tokens → theme.
 */

export interface M3ColorScheme {
  // ── Core ────────────────────────────────────────────────────
  primary: string;
  onPrimary: string;
  primaryContainer: string;
  onPrimaryContainer: string;

  secondary: string;
  onSecondary: string;
  secondaryContainer: string;
  onSecondaryContainer: string;

  tertiary: string;
  onTertiary: string;
  tertiaryContainer: string;
  onTertiaryContainer: string;

  error: string;
  onError: string;
  errorContainer: string;
  onErrorContainer: string;

  // ── Surface ─────────────────────────────────────────────────
  background: string;
  onBackground: string;
  surface: string;
  onSurface: string;
  surfaceVariant: string;
  onSurfaceVariant: string;
  surfaceContainerLowest: string;
  surfaceContainerLow: string;
  surfaceContainer: string;
  surfaceContainerHigh: string;
  surfaceContainerHighest: string;

  // ── Outline ─────────────────────────────────────────────────
  outline: string;
  outlineVariant: string;

  // ── Inverse ─────────────────────────────────────────────────
  inverseSurface: string;
  inverseOnSurface: string;
  inversePrimary: string;

  // ── Other ───────────────────────────────────────────────────
  shadow: string;
  scrim: string;
  surfaceTint: string;

  // ── Semantic (rescue) ────────────────────────────────────────
  danger: string;
  onDanger: string;
  dangerContainer: string;
  onDangerContainer: string;

  warning: string;
  onWarning: string;
  warningContainer: string;
  onWarningContainer: string;

  safe: string;
  onSafe: string;
  safeContainer: string;
  onSafeContainer: string;
}

export type RescueColorMode = 'light' | 'dark';
