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
          paper: cs.light.surfaceContainer,
        },
        text: {
          primary: cs.light.onSurface,
          secondary: cs.light.onSurfaceVariant,
          disabled: cs.light.onSurfaceVariant,
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
  },
});

export function getRescueColorScheme(themeValue: Pick<CssVarsTheme, 'rescue'>) {
  return themeValue.rescue;
}

// Named aliases kept for any existing imports
export const lightTheme = theme;
export const darkTheme = theme;
