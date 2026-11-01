'use client';

import { GlobalStyles } from '@mui/material';
import { ThemeProvider, type Theme } from '@mui/material/styles';
import type { ReactNode } from 'react';

import {
  DISPLAY_SCALE_MOBILE_MEDIA,
  displayTextSize,
  displayTextSizeCss,
  LABEL_400_SIZE_VAR,
  type DisplayTextStep,
} from '@rescue-frontend/ui';

type SlotStyle =
  | Record<string, unknown>
  | ((props: unknown) => Record<string, unknown>);

type Components = Record<
  string,
  { styleOverrides?: Record<string, SlotStyle> }
>;

/**
 * The MUI parts the site uses at their stock size, by slot, and the step of the site's scale each
 * takes instead: the step named for the size MUI gives it, as `--fs-13` in the prototype is step 13.
 */
const SITE_TEXT_STEPS: Record<string, Record<string, DisplayTextStep>> = {
  MuiButton: { root: 14, sizeSmall: 13, sizeLarge: 15 },
  MuiTab: { root: 14 },
  MuiAlert: { root: 14 },
  MuiAlertTitle: { root: 16 },
  MuiFormHelperText: { root: 12 },
};

function withSiteText(
  slot: SlotStyle | undefined,
  step: DisplayTextStep,
): SlotStyle {
  const size = displayTextSizeCss(step);

  return typeof slot === 'function'
    ? (props) => ({ ...slot(props), ...size })
    : { ...slot, ...size };
}

function withSiteTextScale(outer: Theme): Theme {
  const components: Components = { ...(outer.components as Components) };

  for (const [name, slots] of Object.entries(SITE_TEXT_STEPS)) {
    const styleOverrides = { ...components[name]?.styleOverrides };

    for (const [slot, step] of Object.entries(slots)) {
      styleOverrides[slot] = withSiteText(styleOverrides[slot], step);
    }

    components[name] = { ...components[name], styleOverrides };
  }

  return { ...outer, components } as Theme;
}

/**
 * The design system's `label[400]`, 14px, at step 14 of the site's scale on a phone. The phone
 * menu's entries are `label[400]` and stayed 14px there while the text around them grew. Set on
 * `:root`, so every component on that token follows, and gone with this wrapper.
 */
const SITE_LABEL_400 = {
  [DISPLAY_SCALE_MOBILE_MEDIA]: {
    ':root': { [LABEL_400_SIZE_VAR]: `${displayTextSize[14].mobile}px` },
  },
};

/**
 * Puts MUI's buttons, tabs, alerts and field hints on the site's text scale, as the rest of the
 * site's text is, and on a phone the design system's `label[400]` too. At their stock 12–14px they
 * did not grow on a phone with the text around them (16–19px there), and the designer's test
 * (2026-10-10) found the site's text too small. Wraps the site and the sign-in pages only: the back
 * office keeps the design system's own sizes. A size set in `sx` still wins over these.
 */
export function SiteTextScale({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider theme={withSiteTextScale}>
      <GlobalStyles styles={SITE_LABEL_400} />
      {children}
    </ThemeProvider>
  );
}
