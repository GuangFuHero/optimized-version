'use client';

import AssignmentRoundedIcon from '@mui/icons-material/AssignmentRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import GroupsRoundedIcon from '@mui/icons-material/GroupsRounded';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from '@mui/material';
import { useCallback, useState, type ReactNode } from 'react';
import { useMutation, useQuery } from 'urql';

import {
  DeleteTicketTaskDocument,
  GetTicketDocument,
  TicketFieldsFragmentDoc,
  useFragment,
} from '@rescue-frontend/data-access';
import { designTokens, displayTextSize } from '@rescue-frontend/ui';

import { deleteNeedErrorMessage, isNeedAlreadyGone } from './claim-error';
import { describeNeedDeletion } from './delete-need';
import { formatNeedHeadcount, resolveNeedClaim } from './need-claim';
import type { NeedClaimTarget } from './need-claim-dialog';
import {
  readTicketNeeds,
  TICKET_NEEDS_QUERY_CONTEXT,
} from './use-ticket-needs';

const { color, radius, shadow } = designTokens;

interface DeleteNeedDialogProps {
  open: boolean;
  /** The need being deleted — still set while the dialog fades out, so it keeps its content. */
  target: NeedClaimTarget | null;
  /** Why the last try was refused, already in the requester's words. */
  error: string | null;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  /** Once it has faded out. */
  onExited: () => void;
}

/**
 * The delete confirmation's state, and what its buttons do (B's S5). Hosted by the page's
 * `NeedClaimProvider` next to stop-recruiting, so the ⋯ of a drawer row and of a list line open the
 * one dialog, and the reload after it reaches every view of the ticket.
 */
export function useDeleteNeed(
  reloadTicket: (ticketUuid: string) => Promise<unknown>,
) {
  const [, executeDeleteNeed] = useMutation(DeleteTicketTaskDocument);
  // Open is kept apart from the target, so the dialog keeps its content while it fades out.
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<NeedClaimTarget | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleted, setDeleted] = useState(false);

  const request = useCallback((ticketUuid: string, needUuid: string) => {
    setError(null);
    setDeleted(false);
    setTarget({ ticketUuid, needUuid });
    setOpen(true);
  }, []);

  const cancel = useCallback(() => setOpen(false), []);

  const confirm = useCallback(async () => {
    if (!target) {
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const result = await executeDeleteNeed({ uuid: target.needUuid });

      // Gone already — from another tab, or with its ticket — is what the requester asked for.
      if (!result.error || isNeedAlreadyGone(result.error)) {
        setDeleted(true);
        setOpen(false);
        return;
      }

      // As with stopping recruitment: read the ticket again, so the dialog shows the need as it
      // now stands under the refusal.
      await reloadTicket(target.ticketUuid);
      setError(deleteNeedErrorMessage(result.error));
    } finally {
      setSubmitting(false);
    }
  }, [executeDeleteNeed, reloadTicket, target]);

  // Read the ticket again only once the dialog is gone: read sooner, the need drops out of it
  // while it fades and its box flashes 「找不到這筆需求」. The requester then watches the row go.
  const exited = useCallback(() => {
    if (deleted && target) {
      void reloadTicket(target.ticketUuid);
    }
  }, [deleted, reloadTicket, target]);

  return {
    request,
    dialogProps: {
      open,
      target,
      error,
      submitting,
      onCancel: cancel,
      onConfirm: () => void confirm(),
      onExited: exited,
    } satisfies DeleteNeedDialogProps,
  };
}

function DetailLine({
  icon,
  children,
}: {
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <Stack direction="row" sx={{ gap: 0.75, alignItems: 'flex-start' }}>
      <Box
        sx={{
          display: 'grid',
          placeItems: 'center',
          mt: '3px',
          '& svg': { fontSize: 14 },
        }}
      >
        {icon}
      </Box>
      <Typography sx={{ fontSize: displayTextSize[13], lineHeight: 1.6 }}>
        {children}
      </Typography>
    </Stack>
  );
}

/**
 * One look before the requester deletes a need (B's S5): it goes for good, everyone on it hears
 * they need not go, and the last open need takes the ticket to 已完成 with it. Same shape as the
 * stop-recruiting confirmation, in the red F5 kept for deleting; no design of its own exists.
 *
 * It reads the ticket itself, like the other confirmations, so a refusal's reload lands here too.
 */
export function DeleteNeedDialog({
  open,
  target,
  error,
  submitting,
  onCancel,
  onConfirm,
  onExited,
}: DeleteNeedDialogProps) {
  const [{ data, fetching }] = useQuery({
    query: GetTicketDocument,
    variables: { uuid: target?.ticketUuid ?? '' },
    pause: !target,
    context: TICKET_NEEDS_QUERY_CONTEXT,
  });
  const ticket = data?.ticket ?? null;
  const fields = ticket ? useFragment(TicketFieldsFragmentDoc, ticket) : null;
  const needs = readTicketNeeds(ticket);
  const need = needs.find((item) => item.uuid === target?.needUuid) ?? null;
  // Deleted between the tap and the load: nothing to confirm, and the way out is to close.
  const gone = need === null && !fetching;
  const headcount = need
    ? formatNeedHeadcount(
        need,
        resolveNeedClaim(need, {
          ticketStatus: fields?.status,
          isAuthenticated: true,
        }).kind,
      )
    : null;

  return (
    <Dialog
      open={open}
      onClose={submitting ? undefined : onCancel}
      fullWidth
      maxWidth="xs"
      slotProps={{
        transition: { onExited },
        paper: {
          sx: {
            m: { mobile: 2, tablet: 4 },
            width: { mobile: 'calc(100% - 32px)', tablet: 'calc(100% - 64px)' },
            borderRadius: `${radius.lg}px`,
            bgcolor: color.bg.neutral.default,
            boxShadow: shadow.lg,
            backgroundImage: 'none',
          },
        },
      }}
    >
      <DialogTitle
        sx={{
          px: 3,
          pt: 3,
          pb: 1.5,
          color: color.fg.neutral.default,
          fontSize: displayTextSize[20],
          lineHeight: 1.4,
          fontWeight: 700,
        }}
      >
        刪除這筆需求？
      </DialogTitle>

      <DialogContent sx={{ px: 3, pb: 1 }}>
        <Stack spacing={2}>
          <Box
            sx={{
              p: 2,
              borderRadius: `${radius.md}px`,
              bgcolor: color.bg.neutral.subtle,
              border: `1px solid ${color.border.default}`,
            }}
          >
            {need && fields ? (
              <>
                <Typography
                  sx={{
                    color: color.fg.neutral.default,
                    fontSize: displayTextSize[16],
                    lineHeight: 1.4,
                    fontWeight: 700,
                  }}
                >
                  {need.taskName}
                </Typography>
                <Stack
                  spacing={0.5}
                  sx={{ mt: 0.75, color: color.fg.neutral.subtle }}
                >
                  <DetailLine icon={<AssignmentRoundedIcon />}>
                    {fields.title}
                  </DetailLine>
                  <DetailLine icon={<GroupsRoundedIcon />}>
                    {headcount}
                  </DetailLine>
                </Stack>
              </>
            ) : (
              <Typography
                sx={{
                  color: color.fg.neutral.muted,
                  fontSize: displayTextSize[13],
                }}
              >
                {gone ? '找不到這筆需求，可能已經被刪除。' : '載入中...'}
              </Typography>
            )}
          </Box>

          {need ? (
            <Typography
              sx={{
                color: color.fg.neutral.muted,
                fontSize: displayTextSize[13],
                lineHeight: 1.6,
              }}
            >
              {describeNeedDeletion(need, needs)}
            </Typography>
          ) : null}

          {error ? <Alert severity="error">{error}</Alert> : null}
        </Stack>
      </DialogContent>

      <DialogActions sx={{ px: 3, pt: 1, pb: 3, gap: 1.5 }}>
        <Button
          onClick={onCancel}
          disabled={submitting}
          variant="outlined"
          color="inherit"
          sx={{
            flex: 1,
            height: 44,
            whiteSpace: 'nowrap',
            borderRadius: `${radius.full}px`,
            borderColor: color.border.default,
            color: color.fg.neutral.subtle,
          }}
        >
          {gone ? '關閉' : '取消'}
        </Button>
        <Button
          onClick={onConfirm}
          disabled={submitting || !need}
          variant="contained"
          disableElevation
          startIcon={<DeleteOutlineRoundedIcon />}
          sx={{
            flex: 1,
            height: 44,
            whiteSpace: 'nowrap',
            borderRadius: `${radius.full}px`,
            bgcolor: color.bg.danger.default,
            color: color.fg.onDanger,
            '&:hover': { bgcolor: color.bg.danger.hover },
            '&.Mui-disabled': {
              bgcolor: color.bg.disable,
              color: color.fg.disable,
            },
          }}
        >
          {submitting ? '刪除中...' : '刪除'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
