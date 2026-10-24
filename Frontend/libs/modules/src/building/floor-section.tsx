'use client';

import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import { Box, ButtonBase, Stack, Typography } from '@mui/material';
import { useId, useMemo } from 'react';

import { designTokens, displayTextSize } from '@rescue-frontend/ui';

import type { RescueMapMarkerItem } from '../map/types';
import { resolveNeedClaim } from '../ticket/needs/need-claim';
import { NeedClaimButton } from '../ticket/needs/need-claim-button';
import { useNeedClaim } from '../ticket/needs/need-claim-provider';
import { needTypeIcon } from '../ticket/needs/need-parts';
import { formatTicketStatusLabel } from '../ticket/status';
import {
  formatTicketRowTime,
  isClosedTicket,
  quickClaimNeed,
  removedFloorNote,
  sortTickets,
  summarizeTicket,
  summarizeTickets,
  ticketUnitLabel,
  type BuildingTicket,
} from './summary';

const { color, radius } = designTokens;

/** What the left edge says: how urgent, as judged — a 3px line, not a red brick (prototype 09-21). */
function priorityStripe(ticket: BuildingTicket): string {
  if (isClosedTicket(ticket)) {
    return color.border.default;
  }

  switch (ticket.marker.ticketMeta?.priority?.trim().toLowerCase()) {
    case 'critical':
      return color.bg.danger.default;
    case 'high':
      return color.bg.warning.default;
    default:
      return color.border.default;
  }
}

interface TicketRowProps {
  ticket: BuildingTicket;
  /** On one of the building's floors; an unplaced row says which floor it was on, if one. */
  placed: boolean;
  showKind: boolean;
  /** Someone on this floor gave a room: a row without one then says so. */
  showUnit: boolean;
  isAuthenticated: boolean;
  onOpen: (marker: RescueMapMarkerItem) => void;
}

/**
 * One ticket, narrow (prototype `TicketRow`): the urgency on its edge, what kind, its title and room,
 * a line of what it says and when, and on the right its status over how many are missing. Pressing it
 * opens the ticket's own detail — no fourth way of showing a ticket.
 */
function TicketRow({
  ticket,
  placed,
  showKind,
  showUnit,
  isAuthenticated,
  onOpen,
}: TicketRowProps) {
  const { requestClaim } = useNeedClaim();
  const summary = summarizeTicket(ticket);
  const { marker } = ticket;
  const status = marker.ticketMeta?.status;
  const statusText = formatTicketStatusLabel(status);
  const unit = ticketUnitLabel(ticket);
  const removedFloor = removedFloorNote(ticket, placed);
  const description = [
    marker.subtitle.trim(),
    formatTicketRowTime(marker.ticketMeta?.createdAt),
  ]
    .filter(Boolean)
    .join('　·　');
  const quick = quickClaimNeed(ticket, isAuthenticated);
  const KindIcon = needTypeIcon(marker.ticketMeta?.taskType ?? '');
  const textColor = summary.closed
    ? color.fg.neutral.subtle
    : color.fg.neutral.default;

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'stretch',
        borderTop: `1px solid ${color.border.default}`,
      }}
    >
      <ButtonBase
        onClick={() => onOpen(marker)}
        aria-label={[
          marker.title,
          unit,
          removedFloor,
          statusText,
          summary.needText,
        ]
          .filter(Boolean)
          .join('，')}
        sx={{
          flex: 1,
          minWidth: 0,
          minHeight: 44,
          display: 'flex',
          alignItems: 'stretch',
          justifyContent: 'flex-start',
          gap: 1,
          p: 1,
          textAlign: 'left',
        }}
      >
        <Box
          component="span"
          aria-hidden
          sx={{
            width: 3,
            flexShrink: 0,
            borderRadius: '2px',
            bgcolor: priorityStripe(ticket),
          }}
        />
        {showKind ? (
          <KindIcon
            sx={{
              flexShrink: 0,
              mt: '2px',
              fontSize: 16,
              color: summary.closed
                ? color.fg.neutral.muted
                : color.fg.neutral.subtle,
            }}
          />
        ) : null}

        <Box component="span" sx={{ display: 'block', flex: 1, minWidth: 0 }}>
          <Box
            component="span"
            sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}
          >
            <Typography
              component="span"
              noWrap
              sx={{
                fontSize: displayTextSize[13],
                lineHeight: 1.4,
                fontWeight: summary.closed ? 400 : 600,
                color: textColor,
              }}
            >
              {marker.title}
            </Typography>
            {unit || showUnit ? (
              <Typography
                component="span"
                sx={{
                  flexShrink: 0,
                  px: '5px',
                  borderRadius: `${radius.sm}px`,
                  fontSize: displayTextSize[11],
                  lineHeight: 1.6,
                  fontWeight: unit ? 600 : 400,
                  fontStyle: unit ? 'normal' : 'italic',
                  // `subtle`, not `muted`, on the sunken fill: `muted` falls short of 4.5:1 there.
                  bgcolor: unit ? color.bg.neutral.sunken : 'transparent',
                  color: unit
                    ? color.fg.neutral.subtle
                    : color.fg.neutral.muted,
                }}
              >
                {unit ?? '未填戶別'}
              </Typography>
            ) : null}
          </Box>
          {/* Its own line, not the chip: it tells a volunteer which floor to go to. */}
          {removedFloor ? (
            <Typography
              component="span"
              sx={{
                display: 'block',
                mt: '1px',
                fontSize: displayTextSize[12],
                lineHeight: 1.5,
                fontWeight: 600,
                color: color.fg.neutral.subtle,
              }}
            >
              {removedFloor}
            </Typography>
          ) : null}
          {description ? (
            <Typography
              component="span"
              noWrap
              sx={{
                display: 'block',
                mt: '1px',
                fontSize: displayTextSize[12],
                lineHeight: 1.5,
                color: color.fg.neutral.muted,
              }}
            >
              {description}
            </Typography>
          ) : null}
        </Box>

        {/* Status over shortfall, both in words: no solid fill to compete with the urgency. */}
        <Box
          component="span"
          sx={{ display: 'block', flexShrink: 0, pl: 1, textAlign: 'right' }}
        >
          <Typography
            component="span"
            sx={{
              display: 'block',
              whiteSpace: 'nowrap',
              fontSize: displayTextSize[12],
              lineHeight: 1.4,
              color: color.fg.neutral.muted,
            }}
          >
            {statusText}
          </Typography>
          {summary.needText ? (
            <Typography
              component="span"
              sx={{
                display: 'block',
                mt: '1px',
                whiteSpace: 'nowrap',
                fontSize: displayTextSize[11],
                lineHeight: 1.5,
                color: color.fg.neutral.muted,
              }}
            >
              {summary.needText}
            </Typography>
          ) : null}
        </Box>
      </ButtonBase>

      {/* Beside the row, not inside it: a button in a button is not HTML, and claiming should not
          open the detail as well. */}
      {quick ? (
        <Box
          sx={{ display: 'flex', alignItems: 'center', flexShrink: 0, pr: 1 }}
        >
          <NeedClaimButton
            claim={resolveNeedClaim(quick, {
              isAuthenticated,
              ticketStatus: status,
            })}
            needName={quick.taskName}
            onClaim={() => requestClaim(marker.id, quick.uuid)}
          />
        </Box>
      ) : null}
    </Box>
  );
}

interface FloorSectionProps {
  name: string;
  tickets: readonly BuildingTicket[];
  /** On one of the building's floors. False for 未定位. */
  placed: boolean;
  open: boolean;
  /** Null for a box that is always open: 未定位. */
  onToggle: (() => void) | null;
  showClosed: boolean;
  showKind: boolean;
  isAuthenticated: boolean;
  /** A line under the header, for 未定位. */
  note?: string;
  onOpenTicket: (marker: RescueMapMarkerItem) => void;
}

/**
 * One floor's box (prototype `SegmentSection`). Its header leads with the searches not finished — the
 * question a commander asks is where someone is still to be found — then how many are missing, then how
 * many tickets. An empty floor says, in words, that no report is not the same as nothing wrong: with
 * the grid gone, that sentence and the notice at the top are the only ones left to say it.
 */
export function FloorSection({
  name,
  tickets,
  placed,
  open,
  onToggle,
  showClosed,
  showKind,
  isAuthenticated,
  note,
  onOpenTicket,
}: FloorSectionProps) {
  const bodyId = useId();
  const summary = summarizeTickets(tickets);
  const hot = summary.rescueOpen > 0;
  // Decided floor by floor: one floor of rented rooms has them, the rest may not.
  const showUnit = tickets.some((ticket) => ticketUnitLabel(ticket) !== null);
  const shown = useMemo(() => {
    const sorted = sortTickets(tickets);

    return showClosed
      ? sorted
      : sorted.filter((ticket) => !isClosedTicket(ticket));
  }, [showClosed, tickets]);
  const ChevronIcon = open ? ExpandMoreRoundedIcon : ChevronRightRoundedIcon;
  const bodyText = {
    fontSize: displayTextSize[13],
    lineHeight: 1.6,
    color: color.fg.neutral.subtle,
  };
  const pill = {
    fontSize: displayTextSize[11],
    lineHeight: 1.6,
    borderRadius: `${radius.full}px`,
    px: 1,
    whiteSpace: 'nowrap',
  };

  const borderColor = hot ? color.bg.danger.default : color.border.default;

  return (
    <Box
      sx={{
        overflow: 'hidden',
        borderRadius: `${radius.md}px`,
        border: `1px ${onToggle ? 'solid' : 'dashed'} ${borderColor}`,
        bgcolor: summary.ticketCount
          ? color.bg.neutral.default
          : color.bg.neutral.subtle,
      }}
    >
      <ButtonBase
        disabled={!onToggle}
        onClick={onToggle ?? undefined}
        aria-expanded={open}
        aria-controls={open ? bodyId : undefined}
        sx={{
          width: '100%',
          minHeight: 44,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-start',
          gap: 1.5,
          px: 1.5,
          py: 1,
          textAlign: 'left',
          color: color.fg.neutral.default,
          // Not greyed when it cannot be folded: 未定位 is the box that must never look switched off.
          '&.Mui-disabled': { color: color.fg.neutral.default },
        }}
      >
        {onToggle ? (
          <ChevronIcon sx={{ fontSize: 18, color: color.fg.neutral.muted }} />
        ) : (
          <Box component="span" sx={{ width: 18, flexShrink: 0 }} />
        )}
        <Typography
          component="span"
          sx={{
            flexShrink: 0,
            fontSize: displayTextSize[15],
            lineHeight: 1.3,
            fontWeight: 700,
          }}
        >
          {name}
        </Typography>
        <Stack
          component="span"
          direction="row"
          sx={{ ml: 'auto', flexShrink: 0, alignItems: 'center', gap: 1 }}
        >
          {hot ? (
            <Typography
              component="span"
              sx={{
                ...pill,
                fontWeight: 700,
                bgcolor: color.bg.danger.default,
                color: color.fg.onDanger,
              }}
            >
              搜救 {summary.rescueOpen}
            </Typography>
          ) : null}
          {summary.lack > 0 ? (
            <Typography
              component="span"
              sx={{ ...pill, px: 0, color: color.fg.neutral.muted }}
            >
              缺 {summary.lack}
            </Typography>
          ) : null}
          <Typography
            component="span"
            sx={{
              ...pill,
              border: `1px solid ${color.border.default}`,
              color: color.fg.neutral.muted,
            }}
          >
            {summary.ticketCount ? `${summary.ticketCount} 張` : '尚無通報'}
          </Typography>
        </Stack>
      </ButtonBase>

      {open ? (
        <Box id={bodyId} sx={{ px: 1.5, pb: 1.5 }}>
          {note ? (
            <Typography
              sx={{ ...bodyText, pb: 1, fontSize: displayTextSize[12] }}
            >
              {note}
            </Typography>
          ) : null}
          {summary.ticketCount === 0 ? (
            <Typography sx={bodyText}>
              尚未有人通報這一區。這不代表這一區沒事。
            </Typography>
          ) : shown.length === 0 ? (
            <Typography sx={bodyText}>
              這一區的 {summary.ticketCount} 張單都已經結案了。
            </Typography>
          ) : (
            <Stack>
              {shown.map((ticket) => (
                <TicketRow
                  key={ticket.marker.id}
                  ticket={ticket}
                  placed={placed}
                  showKind={showKind}
                  showUnit={showUnit}
                  isAuthenticated={isAuthenticated}
                  onOpen={onOpenTicket}
                />
              ))}
            </Stack>
          )}
        </Box>
      ) : null}
    </Box>
  );
}
