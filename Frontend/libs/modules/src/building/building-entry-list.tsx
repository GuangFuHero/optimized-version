'use client';

import { useMemo, useState } from 'react';

import { Building2, ChevronRight } from 'lucide-react';

import { Box, ButtonBase, Stack, Typography } from '@mui/material';

import { designTokens, displayTextSize } from '@rescue-frontend/ui';

import { BUILDING_ENTRY_LIMIT, buildingEntries } from './building-entry';
import type { BuildingMapEntry } from './use-building-maps';

const { color, radius, spacing } = designTokens;

const ellipsis = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const;

interface BuildingEntryListProps {
  /** Every open building (`useBuildingMaps`), read once by the page for this list and its drawer. */
  buildings: readonly BuildingMapEntry[];
  /** The search the tickets were searched with: none under two characters. */
  q: string | undefined;
  /** Open the building's drawer, the one a ticket's 看各樓層 opens. */
  onOpen: (buildingUuid: string) => void;
}

/**
 * 列表「任務」最上面的「這些大樓可以看各樓層」（原型 `SpaceEntryList`，SPACE-FE-103）：後台開了空間的大樓，
 * 0 張單的也在，一棟一列，點了開同一個樓層抽屜。跟著搜尋框走、不受子分類影響（大樓不是任務單），放在
 * 「沒有符合條件的資料」外面，搜尋某條街沒有單時那棟樓仍找得到。超過 3 棟先收起。件數和缺額等後端的
 * 聚合，現在一律寫「看各樓層」，訪客也一樣（SPACE-FE-104）。
 */
export function BuildingEntryList({
  buildings,
  q,
  onOpen,
}: BuildingEntryListProps) {
  const [expanded, setExpanded] = useState(false);
  const rows = useMemo(() => buildingEntries(buildings, q), [buildings, q]);

  if (rows.length === 0) {
    return null;
  }

  const shown = expanded ? rows : rows.slice(0, BUILDING_ENTRY_LIMIT);

  return (
    <Box
      component="section"
      aria-label="可以看各樓層的大樓"
      sx={{
        display: 'grid',
        gap: `${spacing[2]}px`,
        // Its own, so that the gap above the tickets goes with the block.
        mb: 1.5,
        p: `${spacing[3]}px`,
        borderRadius: `${radius.lg}px`,
        bgcolor: color.bg.neutral.default,
        border: `1px solid ${color.border.default}`,
      }}
    >
      <Stack
        direction="row"
        sx={{
          alignItems: 'baseline',
          columnGap: `${spacing[2]}px`,
          flexWrap: 'wrap',
        }}
      >
        <Typography
          component="h2"
          sx={{
            fontSize: displayTextSize[14],
            fontWeight: 700,
            lineHeight: 1.4,
            color: color.fg.neutral.default,
          }}
        >
          這些大樓可以看各樓層
        </Typography>
        <Typography
          sx={{
            fontSize: displayTextSize[12],
            lineHeight: 1.5,
            color: color.fg.neutral.muted,
          }}
        >
          人在大樓裡要求助，從這裡選樓層
        </Typography>
      </Stack>

      {shown.map((building) => (
        <ButtonBase
          key={building.uuid}
          onClick={() => onOpen(building.uuid)}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: `${spacing[3]}px`,
            width: '100%',
            minHeight: 44,
            px: `${spacing[3]}px`,
            py: `${spacing[2]}px`,
            borderRadius: `${radius.md}px`,
            border: `1px solid ${color.border.default}`,
            bgcolor: color.bg.neutral.subtle,
            textAlign: 'left',
          }}
        >
          <Box sx={{ display: 'flex', color: color.fg.neutral.subtle }}>
            <Building2 size={18} />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0, display: 'grid' }}>
            <Typography
              sx={{
                ...ellipsis,
                fontSize: displayTextSize[14],
                fontWeight: 600,
                lineHeight: 1.4,
                color: color.fg.neutral.default,
              }}
            >
              {building.name}
            </Typography>
            {building.address ? (
              <Typography
                sx={{
                  ...ellipsis,
                  fontSize: displayTextSize[12],
                  lineHeight: 1.4,
                  color: color.fg.neutral.muted,
                }}
              >
                {building.address}
              </Typography>
            ) : null}
          </Box>
          <Typography
            sx={{
              flexShrink: 0,
              fontSize: displayTextSize[12],
              fontWeight: 600,
              lineHeight: 1,
              color: color.fg.neutral.subtle,
            }}
          >
            看各樓層
          </Typography>
          <Box sx={{ display: 'flex', color: color.fg.neutral.muted }}>
            <ChevronRight size={16} />
          </Box>
        </ButtonBase>
      ))}

      {rows.length > BUILDING_ENTRY_LIMIT ? (
        <ButtonBase
          onClick={() => setExpanded((current) => !current)}
          aria-expanded={expanded}
          sx={{
            justifySelf: 'start',
            minHeight: 44,
            px: `${spacing[2]}px`,
            fontSize: displayTextSize[13],
            fontWeight: 600,
            color: color.fg.neutral.subtle,
            textDecoration: 'underline',
          }}
        >
          {expanded ? '收起' : `看全部 ${rows.length} 棟`}
        </ButtonBase>
      ) : null}
    </Box>
  );
}
