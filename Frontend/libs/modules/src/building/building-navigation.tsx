'use client';

import { Button, Stack, Typography } from '@mui/material';
import { useMemo } from 'react';

import { designTokens, displayTextSize, Icons } from '@rescue-frontend/ui';

import type { RescueMapMarkerItem } from '../map/types';
import { buildingTicketOrder } from './summary';
import { useBuilding } from './use-building';

const { color, typography } = designTokens;

// One line each: in the ~350px detail panel the default padding left 「上一張」 room for two characters
// a line. Halves of the row, as before, with the space spent on the words.
const STEP_BUTTON_SX = {
  flex: 1,
  minHeight: 44,
  px: 1,
  whiteSpace: 'nowrap',
} as const;

interface BuildingTicketNavigationProps {
  buildingUuid: string;
  /** The ticket whose detail this sits in. */
  ticketUuid: string;
  onOpenBuilding: (buildingUuid: string) => void;
  onSelectTicket: (marker: RescueMapMarkerItem) => void;
}

/**
 * Under a ticket's 位置資訊, for one filed inside a building (prototype `site-detail.jsx:424-450`):
 * 看各樓層 opens the building's drawer, and 上一張／下一張 step through the building's other tickets
 * without going back to it — looking through several on one floor is the usual thing, and back to the
 * list and in again for each turns one act into three (Sucre, 2026-09-21). The steps follow the
 * drawer's order, so 「下一張」 is the row below, and keep working with the drawer shut.
 */
export function BuildingTicketNavigation({
  buildingUuid,
  ticketUuid,
  onOpenBuilding,
  onSelectTicket,
}: BuildingTicketNavigationProps) {
  const { building, tickets } = useBuilding(buildingUuid);
  const order = useMemo(
    () => (building ? buildingTicketOrder(building.floors, tickets) : []),
    [building, tickets],
  );

  // A building deleted since: the ticket stays, standing alone.
  if (!building) {
    return null;
  }

  const index = order.findIndex((ticket) => ticket.marker.id === ticketUuid);
  const previous = index > 0 ? order[index - 1] : null;
  const next = index >= 0 && index < order.length - 1 ? order[index + 1] : null;

  return (
    <Stack spacing={1} sx={{ pt: 1 }}>
      <Button
        variant="outlined"
        startIcon={<Icons.building />}
        onClick={() => onOpenBuilding(buildingUuid)}
        sx={{ minHeight: 44 }}
      >
        {/* The site says 這一棟／這一層, never 分區 or 空間 (designer, 2026-10-26). */}
        看各樓層（{building.floors.length} 層）
      </Button>
      {index >= 0 && order.length > 1 ? (
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Button
            variant="text"
            disabled={!previous}
            onClick={
              previous ? () => onSelectTicket(previous.marker) : undefined
            }
            startIcon={<Icons.chevronLeft />}
            sx={STEP_BUTTON_SX}
          >
            上一張
          </Button>
          <Typography
            sx={{
              flexShrink: 0,
              fontFamily: typography.data[400].fontFamily,
              fontSize: displayTextSize[12],
              color: color.fg.neutral.muted,
            }}
          >
            {index + 1} / {order.length}
          </Typography>
          <Button
            variant="text"
            disabled={!next}
            onClick={next ? () => onSelectTicket(next.marker) : undefined}
            endIcon={<Icons.chevronRight />}
            sx={STEP_BUTTON_SX}
          >
            下一張
          </Button>
        </Stack>
      ) : null}
    </Stack>
  );
}
