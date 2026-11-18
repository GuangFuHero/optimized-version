'use client';

import { Box, ButtonBase, Stack, Typography } from '@mui/material';

import {
  designTokens,
  displayTextSize,
  RowAction,
  Icons,
} from '@rescue-frontend/ui';

import type { RescueMapMarkerItem } from '../map/types';
import { SiteBadge } from '../shell/site/site-badge';
import { resolveStationAvailability } from '../station/availability';
import { StationTypeIcon } from '../station/station-type-icon';
import { NeedLine, type TicketNeed } from '../ticket/needs';
import { TicketPriorityBadge } from '../ticket/priority-badge';
import { getTicketStatusTone } from '../ticket/status';
import {
  SuspectedDuplicateBadge,
  SuspectedDuplicateLine,
} from '../ticket/suspected-duplicate-tag';

const { color, radius, shadow, spacing, motion, iconSize } = designTokens;

interface SiteListRowProps {
  marker: RescueMapMarkerItem;
  /** The ticket's needs to list (`listTickets`); every one of them when not given. */
  needs?: readonly TicketNeed[];
  active: boolean;
  isAuthenticated?: boolean;
  onSelect: () => void;
  onShare?: () => void;
}

const ICON_SIZE = 18;
const ACTION_ICON = { fontSize: iconSize.sm } as const;
// From this width of the card's text column on (a container query, in MUI's `@` shorthand), the
// badges sit beside the title: a guest's 最高優先, 疑似重複, 概略位置 and status take some 370px at a
// phone's text size, which leaves the title about 110px.
const BADGES_BESIDE_TITLE = '@480';

/**
 * 列表單列：顯示標題、分類標籤與摘要，選取時切換選中樣式。
 *
 * Mirrors `SiteListRow` in `Design/前台/js/site/site-list.jsx`: a 36px type glyph leads the row, the
 * title carries an "官方" chip for verified stations, and the badge on the right gives a ticket its
 * status and a station whether it can be gone to now — the detail drawer's own reading of its status
 * and hours (prototype site-list.jsx:271-273). The glyph already says the station's type.
 */
export function SiteListRow({
  marker,
  needs: listedNeeds,
  active,
  isAuthenticated = false,
  onSelect,
  onShare,
}: SiteListRowProps) {
  const isStation = marker.detailType === 'station';
  const needs =
    marker.detailType === 'ticket' ? (listedNeeds ?? marker.needs ?? []) : [];
  const availability = isStation
    ? resolveStationAvailability({
        operationalStatus: marker.stationMeta?.operationalStatus,
        opHour: marker.stationMeta?.opHour,
      })
    : null;

  return (
    <Box
      sx={{
        width: '100%',
        p: `${spacing[4]}px`,
        borderRadius: `${radius.lg}px`,
        border: '1px solid',
        borderColor: active
          ? color.brand.secondary.default
          : color.border.default,
        bgcolor: active ? color.bg.secondary.subtle : color.bg.neutral.default,
        boxShadow: active ? shadow.md : shadow.sm,
        transition: `background ${motion.transition.fast}, border-color ${motion.transition.fast}, box-shadow ${motion.transition.fast}`,
      }}
    >
      <ButtonBase
        disableRipple
        onClick={onSelect}
        aria-pressed={active}
        sx={{ width: '100%', display: 'block', textAlign: 'left' }}
      >
        <Stack
          direction="row"
          sx={{ alignItems: 'flex-start', gap: `${spacing[3]}px` }}
        >
          <Box
            sx={{
              width: 36,
              height: 36,
              flexShrink: 0,
              borderRadius: `${radius.full}px`,
              display: 'grid',
              placeItems: 'center',
              bgcolor: isStation
                ? color.brand.secondary.default
                : color.bg.primary.default,
              // A white icon on the blue, as on the map's station pins (designer, 2026-10-25).
              color: isStation ? color.fg.inverse : color.fg.onPrimary,
            }}
          >
            {/* Named for a screen reader: the badge on the right no longer says the type. */}
            {isStation ? (
              <StationTypeIcon
                type={marker.stationMeta?.type}
                titleAccess={marker.label}
                sx={{ fontSize: ICON_SIZE }}
              />
            ) : (
              <Icons.clipboardList sx={{ fontSize: ICON_SIZE }} />
            )}
          </Box>

          <Box sx={{ flex: 1, minWidth: 0, containerType: 'inline-size' }}>
            {/* On a narrow card — a phone's, or a tablet's with a ticket open beside the list — the
                badges take a line of their own, under the title and the status: they do not shrink,
                and beside a guest's 概略位置 they squeezed the title to nothing. */}
            <Stack
              direction="row"
              sx={{
                alignItems: 'center',
                flexWrap: { '@': 'wrap', [BADGES_BESIDE_TITLE]: 'nowrap' },
                columnGap: 0.75,
                rowGap: 0.5,
              }}
            >
              <Typography
                sx={{
                  flex: { '@': '1 1 0', [BADGES_BESIDE_TITLE]: '0 1 auto' },
                  minWidth: 0,
                  fontSize: displayTextSize[15],
                  fontWeight: 700,
                  lineHeight: 1.4,
                  color: color.fg.neutral.default,
                }}
                noWrap
              >
                {marker.title}
              </Typography>
              <Stack
                direction="row"
                sx={{
                  order: { '@': 1, [BADGES_BESIDE_TITLE]: 0 },
                  flexBasis: { '@': '100%', [BADGES_BESIDE_TITLE]: 'auto' },
                  flexShrink: 0,
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  gap: 0.75,
                  // No empty line under the title for a card with no badge.
                  '&:empty': { display: 'none' },
                }}
              >
                {/* How urgent, beside the title as the prototype has it (2026-09-21). */}
                <TicketPriorityBadge
                  priority={marker.ticketMeta?.priority}
                  high="solid"
                />
                <SuspectedDuplicateBadge
                  duplicates={marker.ticketMeta?.suspectedDuplicateOf}
                />
                {/* 官方認定：只有官方站點掛 chip，非官方不掛。 */}
                {isStation && marker.stationMeta?.isOfficial ? (
                  <SiteBadge tone="secondary" variant="subtle">
                    <Icons.shieldCheck sx={{ fontSize: 12 }} />
                    官方
                  </SiteBadge>
                ) : null}
                {/* The list shows no coordinates, but its map link and its detail do: say up
                    front that this ticket's place is a region (ADR-281). */}
                {marker.locationCell ? (
                  <SiteBadge tone="neutral" variant="subtle">
                    <Icons.hexagon sx={{ fontSize: 12 }} />
                    概略位置
                  </SiteBadge>
                ) : null}
              </Stack>
              <SiteBadge
                tone={
                  availability?.tone ??
                  getTicketStatusTone(marker.ticketMeta?.status)
                }
                variant="solid"
                sx={{ flexShrink: 0, ml: { [BADGES_BESIDE_TITLE]: 'auto' } }}
              >
                {availability?.headline ?? marker.label}
              </SiteBadge>
            </Stack>

            <SuspectedDuplicateLine
              duplicates={marker.ticketMeta?.suspectedDuplicateOf}
            />

            <Typography
              sx={{
                mt: 0.5,
                fontSize: displayTextSize[13],
                lineHeight: 1.6,
                color: color.fg.neutral.subtle,
              }}
              noWrap
            >
              {marker.subtitle}
            </Typography>
          </Box>
        </Stack>
      </ButtonBase>

      {/* Claiming is per need, never per ticket (PUB-PS-140): each need is its own line with its own
          button. Outside the row's button, which opens the drawer — a button cannot hold buttons. */}
      {needs.length > 0 ? (
        <Box sx={{ mt: `${spacing[2]}px` }}>
          {needs.map((need, index) => (
            <NeedLine
              key={need.uuid}
              need={need}
              ticketUuid={marker.id}
              ticketStatus={marker.ticketMeta?.status}
              ticketCreatedBy={marker.ticketMeta?.createdBy}
              isAuthenticated={isAuthenticated}
              divider={index > 0}
            />
          ))}
        </Box>
      ) : null}

      {onShare ? (
        <Stack
          direction="row"
          sx={{
            mt: `${spacing[3]}px`,
            flexWrap: 'wrap',
            justifyContent: 'flex-end',
            gap: `${spacing[2]}px`,
          }}
        >
          <RowAction
            icon={<Icons.share sx={ACTION_ICON} />}
            label="分享"
            onClick={onShare}
            aria-label={`分享 ${marker.title}`}
          />
        </Stack>
      ) : null}
    </Box>
  );
}
