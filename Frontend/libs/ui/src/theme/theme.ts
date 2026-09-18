/**
 * MUI v9 theme — built on M3 color tokens.
 *
 * Uses `extendTheme` (CSS variables mode) with the light color scheme only.
 * The frontend is currently locked to light mode, so we do not emit dark
 * color-scheme variables.
 *
 * Provider usage:
 *   import { CssVarsProvider } from '@mui/material/styles';
 *   <CssVarsProvider theme={theme} defaultMode="light">…</CssVarsProvider>
 */
import type { CssVarsTheme } from '@mui/material/styles';
import { extendTheme } from '@mui/material/styles';

import { designExtensions } from './bridge';
import { IOS_NO_ZOOM_INPUT_PX } from './design-tokens';
import {
  colorSchemes as cs,
  moduleColorSchemes,
  shape,
  typography,
  type RescueModuleColorScheme,
} from './tokens';

declare module '@mui/material/styles' {
  interface BreakpointOverrides {
    mobile: true;
    tablet: true;
    desktop: true;
  }

  interface ColorSystemOptions {
    rescue?: RescueModuleColorScheme;
  }

  interface ColorSystem {
    rescue: RescueModuleColorScheme;
  }

  interface ThemeVars {
    rescue: RescueModuleColorScheme;
  }
}

export const theme = extendTheme({
  breakpoints: {
    values: {
      xs: 0,
      sm: 600,
      md: 900,
      lg: 1200,
      xl: 1536,
      mobile: 0,
      tablet: 768,
      desktop: 1200,
    },
  },

  colorSchemes: {
    light: {
      rescue: moduleColorSchemes.light,
      palette: {
        primary: {
          main: cs.light.primary,
          light: cs.light.primaryContainer,
          dark: cs.light.onPrimaryContainer,
          contrastText: cs.light.onPrimary,
        },
        secondary: {
          main: cs.light.secondary,
          light: cs.light.secondaryContainer,
          dark: cs.light.onSecondaryContainer,
          contrastText: cs.light.onSecondary,
        },
        error: {
          main: cs.light.error,
          light: cs.light.errorContainer,
          dark: cs.light.onErrorContainer,
          contrastText: cs.light.onError,
        },
        warning: {
          main: cs.light.warning,
          light: cs.light.warningContainer,
          dark: cs.light.onWarningContainer,
          contrastText: cs.light.onWarning,
        },
        success: {
          main: cs.light.safe,
          light: cs.light.safeContainer,
          dark: cs.light.onSafeContainer,
          contrastText: cs.light.onSafe,
        },
        background: {
          default: cs.light.background,
          // `paper` is what Card, Dialog, Menu and Drawer sit on — surfaces ABOVE the page, so it
          // has to be lighter than `default`, not darker. It was `surfaceContainer`, which under
          // the design system's ramp is the *sunken* tint (#EDF2F7, darker than the #F6FAFF page):
          // every raised surface read as a recess. `surfaceContainerLowest` is the white the design
          // system calls `bg.neutral.default` and uses for cards.
          paper: cs.light.surfaceContainerLowest,
        },
        text: {
          primary: cs.light.onSurface,
          secondary: cs.light.onSurfaceVariant,
          // Was `onSurfaceVariant`, the same value as `secondary` — disabled text rendered
          // identically to ordinary secondary text, so nothing looked disabled. M3 has no
          // disabled role; the design system does.
          disabled: designExtensions.disabled.foreground,
        },
        divider: cs.light.outlineVariant,
      },
    },
  },

  typography: {
    fontFamily: typography.fontFamily,
    h1: { fontWeight: 700, letterSpacing: '-0.025em' },
    h2: { fontWeight: 700, letterSpacing: '-0.015em' },
    h3: { fontWeight: 600, letterSpacing: '-0.01em' },
    h4: { fontWeight: 600 },
    h5: { fontWeight: 600 },
    h6: { fontWeight: 600 },
    subtitle1: { fontWeight: 500 },
    subtitle2: { fontWeight: 500 },
    body1: { fontWeight: 400, lineHeight: 1.6 },
    body2: { fontWeight: 400, lineHeight: 1.5 },
    button: { fontWeight: 600, textTransform: 'none' },
    caption: { fontWeight: 400 },
    overline: { fontWeight: 500, letterSpacing: '0.08em' },
  },

  shape: {
    borderRadius: shape.borderRadius,
  },

  components: {
    // 🔒 A focused input smaller than 16px makes iOS Safari zoom the whole page in, and the user has
    // to pinch back out — worse than small text. `site.css` pins inputs to 16px below its 767px
    // cutoff for exactly this reason; `down('tablet')` is that same cutoff.
    MuiInputBase: {
      styleOverrides: {
        input: ({ theme: t }) => ({
          [t.breakpoints.down('tablet')]: { fontSize: IOS_NO_ZOOM_INPUT_PX },
        }),
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: '100px', // M3 full-pill
          minHeight: 40,
          paddingInline: '24px',
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { borderRadius: '8px', fontWeight: 500 },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: { borderRadius: '12px' },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: 'none' },
      },
      variants: [
        {
          props: { variant: 'elevation' },
          style: {
            background: 'rgba(255, 255, 255, 0.2)',
            border: '1px solid rgba(255, 255, 255, 0.3)',
            backdropFilter: 'blur(20px) saturate(180%)',
            WebkitBackdropFilter: 'blur(20px) saturate(180%)',
            boxShadow:
              '0 4px 30px rgba(0, 0, 0, 0.1), inset 0 0 12px rgba(255, 255, 255, 0.4), inset 0 1px 1px rgba(255, 255, 255, 0.6)',
          },
        },
      ],
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: { borderRadius: '8px' },
      },
    },

    // ── Floating-layer rules (designer, 2026-09-17) ─────────────────────────
    // The design system's shadows are warm — orange at 10–20% alpha. Over a white card that is
    // almost invisible, so a floating layer cannot rely on elevation alone to show its edge. The
    // two rules below are the compensation, and they are set here rather than per component so a
    // new menu or dialog inherits them instead of re-inventing them.

    // Anything with a scrim dims the page behind it at a fixed 45%.
    MuiBackdrop: {
      styleOverrides: {
        root: {
          backgroundColor: designExtensions.overlay.scrim,
          '&.MuiBackdrop-invisible': { backgroundColor: 'transparent' },
        },
      },
    },

    // Overlays with NO scrim draw their own hairline instead.
    MuiPopover: {
      styleOverrides: {
        paper: {
          backgroundImage: 'none',
          border: designExtensions.overlay.border,
          boxShadow: designExtensions.overlay.shadow,
        },
      },
    },
    MuiMenu: {
      styleOverrides: {
        paper: {
          backgroundImage: 'none',
          border: designExtensions.overlay.border,
          boxShadow: designExtensions.overlay.shadow,
        },
      },
    },
  },
});

export function getRescueColorScheme(themeValue: Pick<CssVarsTheme, 'rescue'>) {
  return themeValue.rescue;
}

// Named aliases kept for any existing imports
export const lightTheme = theme;
export const darkTheme = theme;
