'use client';

import { useId, useMemo, type MouseEvent } from 'react';

import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  Skeleton,
  Stack,
  Typography,
  useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { useQuery } from 'urql';

import {
  GetTicketDocument,
  TicketFieldsFragmentDoc,
  useFragment,
} from '@rescue-frontend/data-access';

import { TICKET_STATUS_LABELS } from '../../../status';
import { mapTaskTypeLabel } from '../task-type';
import { buildCandidateMapHref } from './candidate-link';
import type { DedupHint } from './dedup-check';
import { ticketCreatePalette } from './palette';

function formatCandidateCreatedAt(value: unknown): string | null {
  if (value == null || value === '') {
    return null;
  }

  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');

  return `${year}/${month}/${day} ${hour}:${minute} 建立`;
}

function statusLabelOf(status: string): string {
  const key = status.trim().toLowerCase();
  return TICKET_STATUS_LABELS[key] ?? status;
}

export type DedupHintDialogProps = {
  open: boolean;
  hint: DedupHint | null;
  busy: boolean;
  onViewCandidate: () => void;
  onProceedAnyway: () => void;
  onBack: () => void;
  palette: typeof ticketCreatePalette;
};

export function DedupHintDialog({
  open,
  hint,
  busy,
  onViewCandidate,
  onProceedAnyway,
  onBack,
  palette,
}: DedupHintDialogProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('tablet'));
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const titleId = useId();
  const descriptionId = useId();
  const proceedHelperId = useId();
  const uuid = hint?.relatedTicketUuid ?? '';

  const [{ data, fetching, error }] = useQuery({
    query: GetTicketDocument,
    variables: { uuid },
    pause: !open || !hint,
  });

  const ticket = useMemo(() => {
    if (!data?.ticket) {
      return null;
    }

    return useFragment(TicketFieldsFragmentDoc, data.ticket);
  }, [data?.ticket]);

  const candidateHref = buildCandidateMapHref({
    uuid,
    geometry: ticket?.geometry ?? null,
  });
  const showSkeleton = fetching && !ticket;
  const showFallback = !fetching && (Boolean(error) || !ticket);
  const createdAtLabel = formatCandidateCreatedAt(ticket?.createdAt);
  const taskTypeLabel = ticket?.taskType
    ? mapTaskTypeLabel(ticket.taskType)
    : null;

  const handleDialogClose = () => {
    if (busy) {
      return;
    }

    onBack();
  };

  const handleViewCandidate = (event: MouseEvent<HTMLAnchorElement>) => {
    if (busy) {
      event.preventDefault();
      return;
    }

    onViewCandidate();

    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }

    event.preventDefault();
    window.open(candidateHref, '_blank', 'noopener,noreferrer');
  };

  return (
    <Dialog
      open={open}
      onClose={handleDialogClose}
      fullScreen={isMobile}
      fullWidth
      maxWidth="sm"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      aria-busy={busy}
      data-testid="dedup-hint-dialog"
      // 留在 Drawer 的 DOM 樹內：MUI ModalManager 會把 body 底下的其他 modal root 標成 aria-hidden，
      // portal 出去會被外層 Drawer 蓋成 aria-hidden，導致輔助技術與 role 查詢都找不到這個 dialog。
      disablePortal
      transitionDuration={reduceMotion ? 0 : undefined}
      slotProps={{
        backdrop: {
          sx: {
            backgroundColor: 'rgba(15, 63, 117, 0.28)',
          },
        },
        paper: {
          sx: {
            borderRadius: isMobile ? 0 : 3,
            border: isMobile ? 'none' : `1px solid ${palette.border}`,
            bgcolor: palette.surface,
            backgroundImage: 'none',
            boxShadow: isMobile
              ? 'none'
              : '0 18px 48px rgba(15, 63, 117, 0.16)',
          },
        },
      }}
    >
      <DialogTitle
        id={titleId}
        sx={{
          px: 2.5,
          pt: 2.5,
          pb: 1,
          fontSize: 20,
          fontWeight: 800,
          lineHeight: 1.35,
          color: palette.heading,
        }}
      >
        附近可能有相同需求
      </DialogTitle>

      <DialogContent
        sx={{
          px: 2.5,
          pb: 1,
        }}
      >
        <Stack spacing={2}>
          <Typography
            id={descriptionId}
            sx={{
              fontSize: 14,
              lineHeight: 1.7,
              color: palette.bodyText,
            }}
          >
            我們找到一張很像的求助單。如果是同一件事，去那張單看看就好，不用再開一張；如果不是，可以另外開單，系統會分開追蹤。
          </Typography>

          <Box
            sx={{
              p: 1.5,
              borderRadius: 3,
              border: `1px solid ${palette.border}`,
              bgcolor: palette.sectionSurface,
            }}
          >
            {showSkeleton ? (
              <Stack spacing={1} aria-hidden>
                <Skeleton
                  variant="text"
                  width="84%"
                  height={28}
                  animation={reduceMotion ? false : 'pulse'}
                />
                <Skeleton
                  variant="rounded"
                  width={72}
                  height={24}
                  animation={reduceMotion ? false : 'pulse'}
                />
                <Skeleton
                  variant="text"
                  width="46%"
                  height={18}
                  animation={reduceMotion ? false : 'pulse'}
                />
              </Stack>
            ) : showFallback ? (
              <Typography
                sx={{
                  fontSize: 14,
                  lineHeight: 1.7,
                  color: palette.bodyText,
                }}
              >
                找不到這張單的內容，可以直接開啟看看
              </Typography>
            ) : (
              <Stack spacing={1}>
                <Typography
                  sx={{
                    fontSize: 15,
                    fontWeight: 800,
                    lineHeight: 1.4,
                    color: palette.heading,
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {ticket?.title}
                </Typography>
                <Stack
                  direction="row"
                  spacing={1}
                  useFlexGap
                  sx={{ flexWrap: 'wrap', alignItems: 'center' }}
                >
                  {ticket?.status ? (
                    <Chip
                      size="small"
                      label={statusLabelOf(ticket.status)}
                      sx={{
                        height: 24,
                        fontWeight: 700,
                        bgcolor: palette.surface,
                        color: palette.secondaryText,
                        border: `1px solid ${palette.border}`,
                      }}
                    />
                  ) : null}
                  {taskTypeLabel ? (
                    <Typography
                      sx={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: palette.secondaryText,
                      }}
                    >
                      {taskTypeLabel}
                    </Typography>
                  ) : null}
                </Stack>
                {createdAtLabel ? (
                  <Typography
                    sx={{
                      fontSize: 12,
                      color: palette.bodyText,
                    }}
                  >
                    {createdAtLabel}
                  </Typography>
                ) : null}
              </Stack>
            )}
          </Box>
        </Stack>
      </DialogContent>

      <Box
        sx={{
          px: 2.5,
          pt: 1,
          pb: 2.5,
        }}
      >
        <Stack
          direction={{ mobile: 'column', tablet: 'row' }}
          spacing={1}
          sx={{
            alignItems: { mobile: 'stretch', tablet: 'flex-start' },
          }}
        >
          <Button
            component="a"
            href={candidateHref}
            target="_blank"
            rel="noopener noreferrer"
            variant="contained"
            autoFocus
            disabled={busy}
            onClick={handleViewCandidate}
            sx={{
              flex: { tablet: '0 0 auto' },
              borderRadius: '999px',
              bgcolor: palette.primary,
              color: palette.primaryText,
              fontWeight: 800,
              boxShadow: 'none',
              textDecoration: 'none',
              '&:hover': {
                bgcolor: palette.primaryHover,
                boxShadow: 'none',
                textDecoration: 'none',
              },
            }}
          >
            去看看這張求助單
          </Button>

          <Stack spacing={0.5} sx={{ flex: { tablet: '0 1 auto' } }}>
            <Button
              variant="outlined"
              disabled={busy}
              aria-describedby={proceedHelperId}
              onClick={onProceedAnyway}
              sx={{
                borderRadius: '999px',
                fontWeight: 800,
                borderColor: palette.secondaryBorder,
                color: palette.secondaryText,
                '&:hover': {
                  borderColor: palette.primary,
                  bgcolor: palette.sectionSurface,
                },
              }}
            >
              {busy ? '建立中…' : '不是同一件事，另外開單'}
            </Button>
            <Typography
              id={proceedHelperId}
              sx={{
                px: 0.5,
                fontSize: 12,
                lineHeight: 1.6,
                color: palette.bodyText,
              }}
            >
              會建立新的求助單，兩張單分開追蹤
            </Typography>
          </Stack>

          <Button
            variant="text"
            disabled={busy}
            onClick={onBack}
            sx={{
              flex: { tablet: '0 0 auto' },
              borderRadius: '999px',
              fontWeight: 800,
              color: palette.secondaryText,
            }}
          >
            回去修改
          </Button>
        </Stack>
      </Box>
    </Dialog>
  );
}
