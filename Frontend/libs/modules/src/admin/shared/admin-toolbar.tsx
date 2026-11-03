'use client';

import { Box, Typography } from '@mui/material';
import { designTokens } from '@rescue-frontend/ui';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

import { toolbarLayout, type ToolbarLayout } from './model/toolbar-fit';

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
 *
 * When the buttons alone don't fit either (超級管理員 and 政府隊 have 開啟空間 too, at 1024 with the
 * sidebar), 新增 ▾ has to wrap: the count goes down with it and sits just left of it, the second line
 * kept to the right (BTN-115b), rather than the count taking a third line of its own.
 */
export function AdminToolbar({ search, count, children }: AdminToolbarProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  const countRef = useRef<HTMLSpanElement>(null);
  const [layout, setLayout] = useState<ToolbarLayout>('inline');
  // With 新增 ▾ on the second line: how wide the count is there, so it fills the line up to 新增 ▾.
  const [countBasis, setCountBasis] = useState(0);

  // Before paint, so the page never opens on a frame with 新增 wrapped.
  useLayoutEffect(() => {
    const row = rowRef.current;
    const countText = countRef.current;
    if (!row || !countText) {
      return undefined;
    }

    const measure = () => {
      const next = measureLayout(row, countText);
      setLayout(next.layout);
      setCountBasis(next.countBasis);
    };
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

  const countSx =
    layout === 'below'
      ? { order: 99, flexBasis: '100%' }
      : layout === 'withLast'
        ? { order: 98, flexBasis: countBasis, textAlign: 'right' as const }
        : { ml: 'auto' };

  return (
    <Box
      ref={rowRef}
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: '8px',
        // Moved, the count no longer pushes the buttons to the right end: the first of them does.
        ...(layout !== 'inline'
          ? { '& > [data-toolbar-count] + *': { ml: 'auto' } }
          : null),
        // 新增 ▾ goes to the second line after the count, which sits just left of it.
        ...(layout === 'withLast'
          ? { '& > :last-child': { order: 99 } }
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
          ...countSx,
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
 * Where the count goes. The search box counts at its min-width: it shrinks that far before
 * anything wraps (INP-103).
 */
function measureLayout(
  row: HTMLElement,
  countText: HTMLElement,
): { layout: ToolbarLayout; countBasis: number } {
  const gap = Number.parseFloat(getComputedStyle(row).columnGap);
  const rowWidth = row.getBoundingClientRect().width;
  const others: number[] = [];
  let count = 0;
  let last = 0;
  for (const item of Array.from(row.children)) {
    // Not rendered (display: none): no width, and no gap either.
    if (item.getClientRects().length === 0) continue;
    if (item.contains(countText)) {
      count = countText.getBoundingClientRect().width;
      continue;
    }
    const width = item.hasAttribute('data-toolbar-search')
      ? Number.parseFloat(getComputedStyle(item).minWidth)
      : item.getBoundingClientRect().width;
    others.push(width);
    last = width;
  }
  const layout = toolbarLayout(others, count, gap, rowWidth);

  return { layout, countBasis: Math.max(0, rowWidth - last - gap) };
}
