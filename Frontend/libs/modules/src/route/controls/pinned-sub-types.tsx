'use client';

import { Box, ButtonBase, Stack, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { z } from 'zod';

import { SITE_SUB_DATA_TYPE_OPTIONS } from '../constants';
import type { RescueMapDataType, SiteSubDataTypeOption } from '../types';
import { SiteControlSurface } from './control-surface';

import { designTokens, displayTextSize } from '@rescue-frontend/ui';

const { color } = designTokens;

const SITE_PINNED_SUB_TYPE_STORAGE_KEY = 'site-map:pinned-sub-data-types';

function createEmptyPinnedSubDataTypes(): Record<RescueMapDataType, string[]> {
  return {
    station: [],
    ticket: [],
  };
}

const pinnedSubDataTypes = z.object({
  station: z.array(z.string()).catch([]),
  ticket: z.array(z.string()).catch([]),
});

function normalizePinnedSubDataTypes(
  candidate: z.infer<typeof pinnedSubDataTypes>,
) {
  return {
    station: SITE_SUB_DATA_TYPE_OPTIONS.station
      .map((option) => option.value)
      .filter((optionValue) => candidate.station.includes(optionValue)),
    ticket: SITE_SUB_DATA_TYPE_OPTIONS.ticket
      .map((option) => option.value)
      .filter((optionValue) => candidate.ticket.includes(optionValue)),
  };
}

function readPinnedSubDataTypes(): Record<RescueMapDataType, string[]> {
  if (typeof window === 'undefined') {
    return createEmptyPinnedSubDataTypes();
  }

  // A browser that blocks site data throws on any touch of localStorage: nothing is pinned then.
  try {
    const storedValue = window.localStorage.getItem(
      SITE_PINNED_SUB_TYPE_STORAGE_KEY,
    );

    return storedValue
      ? normalizePinnedSubDataTypes(
          pinnedSubDataTypes.parse(JSON.parse(storedValue)),
        )
      : createEmptyPinnedSubDataTypes();
  } catch {
    return createEmptyPinnedSubDataTypes();
  }
}

function writePinnedSubDataTypes(
  pinnedSubDataTypes: Record<RescueMapDataType, readonly string[]>,
) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(
      SITE_PINNED_SUB_TYPE_STORAGE_KEY,
      JSON.stringify(pinnedSubDataTypes),
    );
  } catch {
    // Blocked site data: the pins hold until the page closes.
  }
}

/**
 * 釘選的常用篩選。地圖與列表共用同一份：在一頁釘的，另一頁也看得到。
 * The key stays `site-map:…` so that pins made before the list had them carry over.
 */
export function usePinnedSubDataTypes(dataType: RescueMapDataType) {
  const [pinnedSubDataTypesByDataType, setPinnedSubDataTypesByDataType] =
    useState<Record<RescueMapDataType, readonly string[]>>(
      createEmptyPinnedSubDataTypes,
    );

  useEffect(() => {
    setPinnedSubDataTypesByDataType(readPinnedSubDataTypes());
  }, []);

  const pinned = pinnedSubDataTypesByDataType[dataType] ?? [];
  const pinnedOptions = SITE_SUB_DATA_TYPE_OPTIONS[dataType].filter((option) =>
    pinned.includes(option.value),
  );

  const togglePinned = (value: string) => {
    setPinnedSubDataTypesByDataType((current) => {
      const nextPinnedValues = new Set(current[dataType] ?? []);

      if (nextPinnedValues.has(value)) {
        nextPinnedValues.delete(value);
      } else {
        nextPinnedValues.add(value);
      }

      const nextPinnedSubDataTypes = {
        ...current,
        [dataType]: SITE_SUB_DATA_TYPE_OPTIONS[dataType]
          .map((option) => option.value)
          .filter((optionValue) => nextPinnedValues.has(optionValue)),
      };

      writePinnedSubDataTypes(nextPinnedSubDataTypes);

      return nextPinnedSubDataTypes;
    });
  };

  return { pinned, pinnedOptions, togglePinned };
}

export function SitePinnedFilterRow({
  items,
  selected,
  onToggle,
}: {
  items: readonly SiteSubDataTypeOption[];
  selected: readonly string[];
  onToggle: (value: string) => void;
}) {
  if (items.length === 0) {
    return null;
  }

  const selectedValues = new Set(selected);

  return (
    <Box
      sx={{
        width: '100%',
        maxWidth: '100%',
        overflowX: 'auto',
        overflowY: 'hidden',
        WebkitOverflowScrolling: 'touch',
        scrollbarWidth: 'thin',
        '&::-webkit-scrollbar': {
          height: 6,
        },
        '&::-webkit-scrollbar-thumb': {
          backgroundColor: color.border.default,
          borderRadius: 999,
        },
      }}
    >
      <Stack
        direction="row"
        spacing={1}
        sx={{ width: 'max-content', minWidth: '100%', pb: 0.25 }}
      >
        {items.map((item) => {
          const active = selectedValues.has(item.value);

          return (
            <SiteControlSurface
              key={item.value}
              sx={{
                flex: '0 0 auto',
                bgcolor: active
                  ? color.bg.secondary.subtle
                  : color.bg.neutral.default,
                borderColor: active
                  ? color.brand.secondary.default
                  : color.border.accent,
              }}
            >
              <ButtonBase
                disableRipple
                aria-pressed={active}
                aria-label={`${active ? '取消套用' : '套用'}${item.label}篩選`}
                onClick={() => onToggle(item.value)}
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  borderRadius: 999,
                  px: 1.5,
                  py: 1,
                  color: active
                    ? color.fg.neutral.default
                    : color.fg.neutral.subtle,
                  whiteSpace: 'nowrap',
                }}
              >
                <Typography
                  sx={{
                    fontSize: displayTextSize[12],
                    fontWeight: active ? 800 : 700,
                    lineHeight: '16px',
                    color: 'inherit',
                  }}
                >
                  {item.label}
                </Typography>
              </ButtonBase>
            </SiteControlSurface>
          );
        })}
      </Stack>
    </Box>
  );
}
