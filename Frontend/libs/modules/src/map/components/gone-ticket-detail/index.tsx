'use client';

import { FileX, SearchX } from 'lucide-react';

import { Box, Button, IconButton, Stack, Typography } from '@mui/material';

import { designTokens, displayTextSize, Icons } from '@rescue-frontend/ui';

import { formatTicketNumber } from '../../../ticket/ticket-number';
import type { RescueMapGoneTicket } from '../../types';
import { goneTicketCopy } from './copy';

const { color, radius, spacing } = designTokens;
const CloseIcon = Icons.close;

interface GoneTicketDetailProps {
  ticket: RescueMapGoneTicket;
  /** 「回到地圖」 or 「回到列表」, after the page it opened on. */
  returnLabel: string;
  onClose: () => void;
}

/**
 * The drawer of a ticket a link names that is not there: 「這張任務單已刪除」 or 「找不到這張任務單」,
 * in the drawer a ticket opens in rather than a page of its own, so the way back is where it was.
 *
 * It shows the ticket's number and nothing else of it — it has nothing else: the item holds the
 * link's uuid and the backend's word on it (ADR-444). A deleted ticket's title, address and contact
 * are not to be read through a link that still goes round.
 */
export function GoneTicketDetail({
  ticket,
  returnLabel,
  onClose,
}: GoneTicketDetailProps) {
  const { title, body } = goneTicketCopy(ticket.availability);

  return (
    <Box
      component="aside"
      aria-label={title}
      sx={{
        position: 'relative',
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: color.bg.neutral.default,
        borderLeft: `1px solid ${color.border.default}`,
        overflow: 'hidden',
      }}
    >
      <IconButton
        aria-label="關閉詳情"
        onClick={onClose}
        sx={{
          position: 'absolute',
          top: 8,
          right: 8,
          width: 44,
          height: 44,
          color: color.fg.neutral.subtle,
        }}
      >
        <CloseIcon />
      </IconButton>

      {/* Scrolls: a small phone held sideways has less height than the words and the button. */}
      <Stack
        sx={{
          minHeight: 0,
          overflowY: 'auto',
          gap: `${spacing[4]}px`,
          px: `${spacing[6]}px`,
          pt: `${spacing[6]}px`,
          pb: `${spacing[6]}px`,
          pr: 8,
        }}
      >
        <Box
          sx={{
            width: 40,
            height: 40,
            display: 'grid',
            placeItems: 'center',
            borderRadius: `${radius.md}px`,
            bgcolor: color.bg.neutral.subtle,
            color: color.fg.neutral.subtle,
          }}
        >
          <Box
            component={ticket.availability === 'deleted' ? FileX : SearchX}
            sx={{ width: 20, height: 20 }}
          />
        </Box>
        <Typography
          component="h2"
          sx={{
            fontSize: displayTextSize[18],
            fontWeight: 700,
            lineHeight: 1.35,
            color: color.fg.neutral.default,
          }}
        >
          {title}
        </Typography>
        <Typography
          sx={{
            fontSize: displayTextSize[14],
            lineHeight: 1.6,
            color: color.fg.neutral.default,
          }}
        >
          {body}
        </Typography>
        <Typography
          sx={{
            fontSize: displayTextSize[13],
            lineHeight: 1.5,
            color: color.fg.neutral.subtle,
          }}
        >
          任務單編號 {formatTicketNumber(ticket.id)}
        </Typography>
        <Button
          variant="contained"
          onClick={onClose}
          sx={{
            alignSelf: 'flex-start',
            textTransform: 'none',
            fontWeight: 700,
          }}
        >
          {returnLabel}
        </Button>
      </Stack>
    </Box>
  );
}
