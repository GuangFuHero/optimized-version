'use client';

import { Box, ButtonBase, Typography } from '@mui/material';
import { designTokens } from '@rescue-frontend/ui';
import type { ReactNode } from 'react';

import {
  nextStatTile,
  STAT_TILE_ALL,
  type StatTileCount,
  type StatTileItem,
  type StatTileParts,
} from './model/stat-tiles';

const { color, radius, typography } = designTokens;

/** A tile that only shows (STAT-105): no filter answers it, and a button would seem not to work. */
export interface StatTileExtra {
  label: string;
  count: StatTileCount | StatTileParts;
  /** Warning colours while the count is above 0. */
  tone?: 'warning';
  icon?: ReactNode;
  title?: string;
}

interface StatTilesProps {
  items: readonly StatTileItem[];
  /** The status filtered by: a tile's key, or STAT_TILE_ALL for none. */
  value: string;
  onChange: (value: string) => void;
  extras?: readonly StatTileExtra[];
}

/**
 * The counts above a back-office list, one low row across its width (prototype wg-stat-tiles.jsx,
 * STAT-101–106): a tile filters the list by its status, picked again it clears the filter; the
 * selected tile is outlined. The counts are the page's to read over every row in scope, whatever
 * the filters (STAT-102): filtered, every other tile would read 0 and there would be nothing to
 * move on to. It scrolls away with the page.
 */
export function StatTiles({
  items,
  value,
  onChange,
  extras = [],
}: StatTilesProps) {
  return (
    <Box
      role="group"
      aria-label="統計（點了篩選狀態）"
      sx={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}
    >
      {items.map((item) => {
        const active = item.key === value;
        return (
          <ButtonBase
            key={item.key}
            aria-pressed={active}
            title={
              item.title ??
              (item.key === STAT_TILE_ALL
                ? undefined
                : active
                  ? '再點一次取消篩選'
                  : `只看「${item.label}」`)
            }
            onClick={() => onChange(nextStatTile(value, item.key))}
            sx={{
              ...tileSx({ active }),
              '&:hover': {
                borderColor: active
                  ? color.bg.primary.default
                  : color.fg.neutral.muted,
              },
              '&.Mui-focusVisible': {
                outline: `2px solid ${color.bg.primary.default}`,
                outlineOffset: '2px',
              },
            }}
          >
            <TileContent
              label={item.label}
              count={item.count}
              active={active}
            />
          </ButtonBase>
        );
      })}
      {extras.map((extra) => {
        const warn =
          extra.tone === 'warning' && extra.count !== null && extra.count !== 0;
        return (
          <Box
            key={extra.label}
            title={extra.title}
            sx={tileSx({ warn, wide: true })}
          >
            <TileContent
              label={extra.label}
              count={extra.count}
              warn={warn}
              icon={extra.icon}
            />
          </Box>
        );
      })}
    </Box>
  );
}

/**
 * 48px high, sharing the row's width; the wider count of a warning tile takes two shares. A tile
 * that cannot keep 120px wraps onto the next row (STAT-101).
 */
function tileSx({
  active = false,
  warn = false,
  wide = false,
}: {
  active?: boolean;
  warn?: boolean;
  wide?: boolean;
}) {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    minHeight: 48,
    minWidth: 0,
    p: '6px 16px',
    flex: wide ? '2 1 220px' : '1 1 120px',
    // The count's size follows the tile's width (STAT-106).
    containerType: 'inline-size',
    boxSizing: 'border-box',
    textAlign: 'left',
    borderRadius: `${radius.md}px`,
    border: `1px solid ${
      active
        ? color.bg.primary.default
        : warn
          ? color.bg.warning.hover
          : color.border.default
    }`,
    bgcolor: active
      ? color.bg.primary.subtle
      : warn
        ? color.bg.warning.subtle
        : color.bg.neutral.default,
  } as const;
}

/**
 * The label, which never shrinks or clips, then the count to its right. A count in two parts first
 * shrinks with the tile, from 20px down to 16px, then puts its second part on a line of its own:
 * it grows the tile rather than cut a word (STAT-106).
 */
function TileContent({
  label,
  count,
  active = false,
  warn = false,
  icon,
}: {
  label: string;
  count: StatTileCount | StatTileParts;
  active?: boolean;
  warn?: boolean;
  icon?: ReactNode;
}) {
  const parts = count !== null && typeof count === 'object' ? count : null;
  const main =
    count === null ? '—' : typeof count === 'object' ? count.main : count;
  return (
    <>
      {icon ? (
        <Box
          component="span"
          sx={{
            display: 'flex',
            color: warn ? color.fg.warning : color.fg.neutral.muted,
          }}
        >
          {icon}
        </Box>
      ) : null}
      <Typography
        component="span"
        sx={{
          ...typography.body[300],
          flexShrink: 0,
          whiteSpace: 'nowrap',
          color: active ? color.fg.neutral.default : color.fg.neutral.muted,
        }}
      >
        {label}
      </Typography>
      <Box
        component="span"
        sx={{
          ml: 'auto',
          flex: '1 1 0',
          minWidth: 0,
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'baseline',
          justifyContent: 'flex-end',
          columnGap: '8px',
          rowGap: '2px',
          textAlign: 'right',
        }}
      >
        <Typography
          component="span"
          sx={{
            ...typography.heading[700],
            fontSize: parts ? 'clamp(16px, 7cqi, 20px)' : 20,
            lineHeight: 1.1,
            whiteSpace: 'nowrap',
            color: warn ? color.fg.warning : color.fg.neutral.default,
          }}
        >
          {main}
        </Typography>
        {parts?.sub ? (
          <Typography
            component="span"
            sx={{
              ...typography.body[300],
              whiteSpace: 'nowrap',
              color: warn ? color.fg.warning : color.fg.neutral.muted,
            }}
          >
            {parts.sub}
          </Typography>
        ) : null}
      </Box>
    </>
  );
}
