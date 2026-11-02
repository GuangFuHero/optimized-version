'use client';

import { Box, Typography } from '@mui/material';
import { designTokens } from '@rescue-frontend/ui';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

import { fitsOneRow } from './model/toolbar-fit';

const { color, typography } = designTokens;

interface AdminToolbarProps {
  /** 篩選, the search box and 清除: a `ToolbarSearch`. */
  search: ReactNode;
  /** 「13 筆任務 · 1 個空間」, 「12 站」. */
  count: ReactNode;
  /** The buttons after the count, 新增 ▾ last. */
  children?: ReactNode;
}

/**
 * An admin list's toolbar: the search, the count, then the buttons. When they don't fit one line,
 * the count drops to a line of its own first (BTN-115), so 新增 ▾, the row's most used action, stays
 * at the right end of the first line. The count stays, since it is the only place that says how
 * many rows a filter left; with room again it comes back.
 */
export function AdminToolbar({ search, count, children }: AdminToolbarProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  const countRef = useRef<HTMLSpanElement>(null);
  const [countDropped, setCountDropped] = useState(false);

  // Before paint, so the page never opens on a frame with 新增 wrapped.
  useLayoutEffect(() => {
    const row = rowRef.current;
    const countText = countRef.current;
    if (!row || !countText) {
      return undefined;
    }

    const measure = () => setCountDropped(!countFits(row, countText));
    const resizes = new ResizeObserver(measure);
    const observeItems = () => {
      resizes.disconnect();
      resizes.observe(row);
      resizes.observe(countText);
      for (const item of Array.from(row.children)) resizes.observe(item);
    };
    observeItems();
    // 清除, and a button shown once the viewer's capabilities load, come and go without resizing
    // the row.
    const additions = new MutationObserver(() => {
      observeItems();
      measure();
    });
    additions.observe(row, { childList: true });
    measure();

    return () => {
      resizes.disconnect();
      additions.disconnect();
    };
  }, []);

  return (
    <Box
      ref={rowRef}
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: '8px',
        // Dropped, the count no longer pushes the buttons to the right end: the first of them does.
        ...(countDropped
          ? { '& > [data-toolbar-count] + *': { ml: 'auto' } }
          : null),
      }}
    >
      {search}

      <Typography
        data-toolbar-count
        sx={{
          ...typography.body[300],
          color: color.fg.neutral.muted,
          whiteSpace: 'nowrap',
          ...(countDropped ? { order: 99, flexBasis: '100%' } : { ml: 'auto' }),
        }}
      >
        {/* Inline-block, so its width is the text's own, on a line of its own too. */}
        <Box component="span" ref={countRef} sx={{ display: 'inline-block' }}>
          {count}
        </Box>
      </Typography>

      {children}
    </Box>
  );
}

/**
 * Whether everything fits one line with the count in it. The search box counts at its min-width:
 * it shrinks that far before anything wraps (INP-103).
 */
function countFits(row: HTMLElement, countText: HTMLElement): boolean {
  const widths = Array.from(row.children).flatMap((item) => {
    // Not rendered (display: none): no width, and no gap either.
    if (item.getClientRects().length === 0) return [];
    if (item.contains(countText)) {
      return [countText.getBoundingClientRect().width];
    }
    if (item.hasAttribute('data-toolbar-search')) {
      return [Number.parseFloat(getComputedStyle(item).minWidth)];
    }
    return [item.getBoundingClientRect().width];
  });
  return fitsOneRow(
    widths,
    Number.parseFloat(getComputedStyle(row).columnGap),
    row.getBoundingClientRect().width,
  );
}
