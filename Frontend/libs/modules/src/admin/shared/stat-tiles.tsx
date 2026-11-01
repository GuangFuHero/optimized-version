'use client';

import { Box, ButtonBase, Typography } from '@mui/material';
import { designTokens } from '@rescue-frontend/ui';
import { CircleAlert } from 'lucide-react';
import type { ReactNode } from 'react';

import {
  nextStatTile,
  STAT_TILE_ALL,
  type StatTileCount,
  type StatTileItem,
  type StatTileParts,
} from './model/stat-tiles';

const { color, primitives, radius, typography } = designTokens;

/**
 * A count in two parts shrinks with its tile, from 20px down to 16px (STAT-106). No token follows a
 * container's width, so the step between (7cqi, as drawn) is written here; its ends are tokens.
 */
const FITTED_COUNT_SIZE = `clamp(${primitives.fontSize.base}px, 7cqi, ${primitives.fontSize.xl}px)`;

/** A tile that only shows (STAT-105): no filter answers it, and a button would seem not to work. */
export interface StatTileExtra {
  label: string;
  count: StatTileCount | StatTileParts;
  /** Warning colours while the count is above 0. */
  tone?: 'warning';
  icon?: ReactNode;
  title?: string;
}

interface StatTilesProps<K extends string> {
  items: readonly StatTileItem<K>[];
  /** The status filtered by, or null for none (全部). */
  value: K | null;
  onChange: (value: K | null) => void;
  extras?: readonly StatTileExtra[];
}

/**
 * The counts above a back-office list, one low row across its width (prototype wg-stat-tiles.jsx,
 * STAT-101–106): a tile filters the list by its status, picked again it clears the filter; the
 * selected tile is outlined. The counts are the page's to read over every row in scope, whatever
 * the filters (STAT-102): filtered, every other tile would read 0 and there would be nothing to
 * move on to. It does not stick: the page puts it where the list scrolls it away (STAT-101).
 */
export function StatTiles<K extends string>({
  items,
  value,
  onChange,
  extras = [],
}: StatTilesProps<K>) {
  return (
    <Box
      role="group"
      aria-label="統計（點了篩選狀態）"
      sx={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}
    >
      {items.map((item) => {
        const active = item.key === (value ?? STAT_TILE_ALL);
        return (
          <ButtonBase
            key={item.key}
            aria-pressed={active}
            title={
              item.title ??
              (active ? '再點一次取消篩選' : `只看「${item.label}」`)
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
            // Heading 600: the drawn count, 20px in the heading face.
            ...typography.heading[600],
            ...(parts ? { fontSize: FITTED_COUNT_SIZE } : null),
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

/**
 * The counts did not load: one line above the row with its own 重試, as the list may have loaded
 * fine. The counts are only the list's aside, so a line of small text rather than a Callout; the
 * tiles stay, reading — and still filtering (STAT-109).
 */
export function StatTilesRetry({
  retrying,
  onRetry,
}: {
  retrying: boolean;
  onRetry: () => void;
}) {
  return (
    <Box
      role="alert"
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        minHeight: 24,
        ...typography.body[300],
        color: color.fg.danger,
      }}
    >
      <Box
        component={CircleAlert}
        aria-hidden
        sx={{ width: 14, height: 14, flexShrink: 0 }}
      />
      無法載入統計
      <ButtonBase
        disabled={retrying}
        onClick={onRetry}
        sx={{
          px: '4px',
          minHeight: 24,
          font: 'inherit',
          fontWeight: primitives.fontWeight.bold,
          color: 'inherit',
          textDecoration: 'underline',
          '&.Mui-disabled': { color: color.fg.neutral.muted },
        }}
      >
        {retrying ? '重試中…' : '重試'}
      </ButtonBase>
    </Box>
  );
}
