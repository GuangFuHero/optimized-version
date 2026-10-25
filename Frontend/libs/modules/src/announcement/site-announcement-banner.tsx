'use client';

import { Box, GlobalStyles } from '@mui/material';
import { useLayoutEffect, useRef } from 'react';

import { AnnouncementBanner } from '@rescue-frontend/ui';

import { SITE_BANNER_HEIGHT, SITE_BANNER_HEIGHT_VAR } from './banner-height';
import { useSiteAnnouncement } from './use-site-announcement';

/**
 * Every modal — a drawer, a dialog and the scrim behind either — starts under the banner, so none
 * covers it and it covers none (prototype `an-banner.jsx:61-79`): someone reading a ticket is the
 * last who should miss that their area is being evacuated. The transform makes the modal the box
 * its fixed scrim and drawer are placed in, so their `top: 0` and `100%` follow it down. Popovers
 * and menus stay put: they place themselves by what opened them.
 */
const MODALS_BELOW_BANNER = {
  '.MuiModal-root:not(.MuiPopover-root)': {
    top: SITE_BANNER_HEIGHT,
    transform: 'translateZ(0)',
  },
} as const;

/**
 * 全站公告橫幅, at the top of every site page and the sign-in pages too (prototype `an-banner.jsx`,
 * EA-AB-141, EA-AB-147). One line, and no ✕: only its publisher takes it down (EA-AB-144, 146).
 * While it shows it writes its height on the document (`SITE_BANNER_HEIGHT`), and what fills the
 * screen makes room for it.
 */
export function SiteAnnouncementBanner() {
  const announcement = useSiteAnnouncement();
  const ref = useRef<HTMLDivElement>(null);
  const shown = announcement !== null;

  // Before paint, so the page never shows a frame a banner's height too tall.
  useLayoutEffect(() => {
    const banner = ref.current;
    if (!shown || !banner) {
      return undefined;
    }

    const root = document.documentElement;
    const write = () =>
      root.style.setProperty(
        SITE_BANNER_HEIGHT_VAR,
        `${banner.offsetHeight}px`,
      );
    write();
    const observer = new ResizeObserver(write);
    observer.observe(banner);

    return () => {
      observer.disconnect();
      root.style.removeProperty(SITE_BANNER_HEIGHT_VAR);
    };
  }, [shown]);

  if (!announcement) {
    return null;
  }

  return (
    <Box ref={ref} sx={{ flexShrink: 0 }}>
      <GlobalStyles styles={MODALS_BELOW_BANNER} />
      {/* A new announcement is a new alert, read out again. */}
      <AnnouncementBanner key={announcement.uuid}>
        {announcement.content}
      </AnnouncementBanner>
    </Box>
  );
}
