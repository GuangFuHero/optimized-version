'use client';

import { useEffect, useRef, type ReactNode } from 'react';

import { Box } from '@mui/material';
import type { SxProps, Theme } from '@mui/material/styles';

export interface AdminListPageLayoutProps {
  /**
   * Above the header, scrolling away with the list (a list's counts). With it the whole page
   * scrolls, the header sticking at the top; without it only the list scrolls, under the header.
   */
  lead?: ReactNode;
  header: ReactNode;
  filterPanel?: ReactNode;
  list: ReactNode;
  footer?: ReactNode;
  minHeight?: number | string;
  height?: number | string;
  canvasColor?: string;
  filterPanelSx?: SxProps<Theme>;
  listContainerSx?: SxProps<Theme>;
}

function toCssSize(value: number | string) {
  return typeof value === 'number' ? `${value}px` : value;
}

function mergeSx(base: SxProps<Theme>, sx?: SxProps<Theme>): SxProps<Theme> {
  if (!sx) {
    return base;
  }

  return (Array.isArray(sx) ? [base, ...sx] : [base, sx]) as SxProps<Theme>;
}

export function AdminListPageLayout({
  lead,
  header,
  filterPanel,
  list,
  footer,
  minHeight = '100%',
  height = minHeight,
  canvasColor = '#FFFFFF',
  filterPanelSx,
  listContainerSx,
}: AdminListPageLayoutProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const stuckHeaderRef = useRef<HTMLDivElement>(null);
  const scrolls = Boolean(lead);

  // With the page scrolling under the sticky header, a row reached by keyboard (Shift+Tab) is scrolled
  // into view below the header rather than behind it.
  useEffect(() => {
    const section = sectionRef.current;
    const stuckHeader = stuckHeaderRef.current;
    if (!scrolls || !section || !stuckHeader) {
      return;
    }
    const write = () => {
      section.style.scrollPaddingTop = `${stuckHeader.offsetHeight}px`;
    };
    write();
    const observer = new ResizeObserver(write);
    observer.observe(stuckHeader);

    return () => {
      observer.disconnect();
      section.style.removeProperty('scroll-padding-top');
    };
  }, [scrolls]);

  return (
    <Box
      ref={sectionRef}
      component="section"
      sx={{
        width: '100%',
        minHeight: toCssSize(minHeight),
        height: toCssSize(height),
        bgcolor: canvasColor,
        display: 'flex',
        flexDirection: 'column',
        ...(lead ? { overflow: 'auto' } : null),
      }}
    >
      {lead}
      {lead ? (
        <Box
          ref={stuckHeaderRef}
          sx={{ position: 'sticky', top: 0, zIndex: 1, bgcolor: canvasColor }}
        >
          {header}
        </Box>
      ) : (
        header
      )}
      {filterPanel ? <Box sx={filterPanelSx}>{filterPanel}</Box> : null}
      <Box
        sx={mergeSx(
          {
            // With a lead the page scrolls, so the list takes its height and fills what is left. Its
            // own stacking context keeps everything in it, a map's overlays too, under the header.
            ...(lead
              ? { flex: '1 0 auto', isolation: 'isolate' }
              : { flex: 1, minHeight: 0, overflow: 'auto' }),
            bgcolor: canvasColor,
          },
          listContainerSx,
        )}
      >
        {list}
      </Box>
      {footer}
    </Box>
  );
}
