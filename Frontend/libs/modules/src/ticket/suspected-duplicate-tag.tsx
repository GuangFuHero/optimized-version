'use client';

import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import { Box, Button, Stack, Typography } from '@mui/material';

import { designTokens, displayTextSize } from '@rescue-frontend/ui';

import { SiteBadge } from '../shell/site/site-badge';
import {
  DUPLICATE_CLAIM_ADVICE,
  duplicateSentence,
  quoteDuplicateTitle,
  type SuspectedDuplicate,
} from './suspected-duplicate';

const { color, radius } = designTokens;

interface DuplicatesProps {
  /** The ticket's `suspectedDuplicateOf`; nothing is drawn when empty. */
  duplicates?: readonly SuspectedDuplicate[] | null;
}

/** Beside a list card's title (prototype `SiteDupBadge`). */
export function SuspectedDuplicateBadge({ duplicates }: DuplicatesProps) {
  if (!duplicates?.length) {
    return null;
  }

  return (
    <SiteBadge tone="warning" variant="subtle">
      <ContentCopyRoundedIcon sx={{ fontSize: 12 }} />
      疑似重複
    </SiteBadge>
  );
}

/**
 * Under a list card's title, the first ticket it may repeat (prototype `SiteDupLine`). Each card says
 * it for itself: the two are not grouped on the list.
 */
export function SuspectedDuplicateLine({ duplicates }: DuplicatesProps) {
  const first = duplicates?.[0];

  if (!first) {
    return null;
  }

  return (
    <Typography
      sx={{
        mt: 0.5,
        fontSize: displayTextSize[12],
        lineHeight: 1.45,
        color: color.fg.warning,
      }}
    >
      {duplicateSentence(first)}
    </Typography>
  );
}

/**
 * At the top of a ticket's detail (prototype `SiteDupNotice`): a sentence for each ticket it may
 * repeat, with 看那張 under it to open that one, and once, beside the last 看那張, what to do before
 * claiming (DUP-FE-207) — the words carry it, the faint fill only holds the lines together. 看那張 is
 * under the sentence, not beside it: beside it, a 16-character title folds the sentence to three lines
 * on a 390px phone and parts 重 from 複. Not why the two look alike: the backend names the tickets
 * alone.
 */
export function SuspectedDuplicateNotice({
  duplicates,
  onOpenTicket,
}: DuplicatesProps & {
  /** Opens the other ticket; without it, the sentence has no 看那張. */
  onOpenTicket?: (ticketUuid: string) => void;
}) {
  if (!duplicates?.length) {
    return null;
  }

  return (
    <Box
      sx={{
        px: 1.5,
        py: 1.25,
        borderRadius: `${radius.md}px`,
        bgcolor: `color-mix(in srgb, ${color.bg.warning.subtle} 40%, ${color.bg.neutral.default})`,
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
      }}
    >
      {duplicates.map((other, index) => {
        const advised = index === duplicates.length - 1;

        return (
          <Stack
            key={other.uuid}
            direction="row"
            sx={{ alignItems: 'flex-start', gap: 1 }}
          >
            <ContentCopyRoundedIcon
              sx={{ mt: '4px', fontSize: 16, color: color.fg.warning }}
            />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography
                sx={{
                  fontSize: displayTextSize[15],
                  lineHeight: 1.6,
                  color: color.fg.neutral.default,
                }}
              >
                疑似跟<strong>「{quoteDuplicateTitle(other.title)}」</strong>
                重複
              </Typography>
              {onOpenTicket || advised ? (
                <Stack
                  direction="row"
                  sx={{ alignItems: 'baseline', gap: 1.5, mt: 0.25 }}
                >
                  {onOpenTicket ? (
                    <Button
                      variant="text"
                      // Which ticket, for a screen reader: with two or more, every button reads 看那張.
                      aria-label={`看那張：${other.title}`}
                      onClick={() => onOpenTicket(other.uuid)}
                      sx={{
                        flexShrink: 0,
                        minWidth: 0,
                        minHeight: 44,
                        // The 44px a finger needs, without as much air around the line.
                        my: '-10px',
                        ml: -0.5,
                        px: 0.5,
                        fontSize: displayTextSize[14],
                        fontWeight: 700,
                        // A link's blue, as the briefing's: the theme's orange on the faint fill is too
                        // light to read.
                        color: color.fg.info,
                        textDecoration: 'underline',
                      }}
                    >
                      看那張
                    </Button>
                  ) : null}
                  {advised ? (
                    <Typography
                      sx={{
                        flex: 1,
                        minWidth: 0,
                        fontSize: displayTextSize[12],
                        lineHeight: 1.5,
                        color: color.fg.neutral.muted,
                      }}
                    >
                      {DUPLICATE_CLAIM_ADVICE}
                    </Typography>
                  ) : null}
                </Stack>
              ) : null}
            </Box>
          </Stack>
        );
      })}
    </Box>
  );
}
