'use client';

import AssignmentRoundedIcon from '@mui/icons-material/AssignmentRounded';
import GroupsRoundedIcon from '@mui/icons-material/GroupsRounded';
import HowToRegRoundedIcon from '@mui/icons-material/HowToRegRounded';
import { Box, Stack, Typography } from '@mui/material';
import { useCallback, useState, type ReactNode } from 'react';
import { useMutation, useQuery } from 'urql';

import {
  GetTicketDocument,
  StopRecruitingDocument,
  TicketFieldsFragmentDoc,
  useFragment,
} from '@rescue-frontend/data-access';
import { designTokens, Dialog, displayTextSize } from '@rescue-frontend/ui';

import { stopRecruitingErrorMessage } from './claim-error';
import { canStopRecruiting } from './need-actions';
import { formatNeedHeadcount, resolveNeedClaim } from './need-claim';
import type { NeedClaimTarget } from './need-claim-dialog';
import { readNeedDialog } from './need-dialog';
import {
  readTicketNeeds,
  TICKET_NEEDS_QUERY_CONTEXT,
} from './use-ticket-needs';

const { color, radius } = designTokens;

interface StopRecruitingDialogProps {
  open: boolean;
  /** The need being stopped — still set while the dialog fades out, so it keeps its content. */
  target: NeedClaimTarget | null;
  /** Why the last try was refused, already in the requester's words. */
  error: string | null;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * The stop-recruiting confirmation's state, and what its buttons do. Hosted by the page's
 * `NeedClaimProvider`, so the ⋯ of a drawer row and of a list line open the one dialog, and the
 * reload after it reaches every view of the ticket.
 */
export function useStopRecruiting(
  reloadTicket: (ticketUuid: string) => Promise<unknown>,
) {
  const [, executeStopRecruiting] = useMutation(StopRecruitingDocument);
  // Open is kept apart from the target, so the dialog keeps its content while it fades out.
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<NeedClaimTarget | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const request = useCallback((ticketUuid: string, needUuid: string) => {
    setError(null);
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
      const result = await executeStopRecruiting({ taskUuid: target.needUuid });
      // Either way, as with a claim: a refusal usually means the need changed meanwhile — filled,
      // stopped from another tab, or left with nobody on it — and the dialog should now say so.
      await reloadTicket(target.ticketUuid);

      if (result.error) {
        setError(stopRecruitingErrorMessage(result.error));
        return;
      }

      setOpen(false);
    } finally {
      setSubmitting(false);
    }
  }, [executeStopRecruiting, reloadTicket, target]);

  return {
    request,
    dialogProps: {
      open,
      target,
      error,
      submitting,
      onCancel: cancel,
      onConfirm: () => void confirm(),
    } satisfies StopRecruitingDialogProps,
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
 * One look before the requester stops recruiting for a need: nothing undoes it, and everyone on
 * the need hears. Same shape as the claim and release confirmations; no design of its own exists —
 * the prototype only had the whole-ticket 刪除媒合單.
 *
 * It reads the ticket itself, like the claim confirmation, so a refusal's reload lands here too.
 */
export function StopRecruitingDialog({
  open,
  target,
  error,
  submitting,
  onCancel,
  onConfirm,
}: StopRecruitingDialogProps) {
  const [{ data, fetching }] = useQuery({
    query: GetTicketDocument,
    variables: { uuid: target?.ticketUuid ?? '' },
    pause: !target,
    context: TICKET_NEEDS_QUERY_CONTEXT,
  });
  const ticket = data?.ticket ?? null;
  const fields = ticket ? useFragment(TicketFieldsFragmentDoc, ticket) : null;
  const need =
    readTicketNeeds(ticket).find((item) => item.uuid === target?.needUuid) ??
    null;
  // After a refused stop the reload may show the need filled, stopped or with nobody left on it:
  // then there is nothing to confirm, and the way out is to close.
  const settled = need !== null && !canStopRecruiting(need, fields?.status);
  // Or gone, which the box says, and then nothing beneath it says again.
  const dialog = readNeedDialog({
    found: Boolean(need && fields),
    fetching,
    refusal: error,
  });
  const headcount = need
    ? formatNeedHeadcount(
        need,
        resolveNeedClaim(need, {
          ticketStatus: fields?.status,
          isAuthenticated: true,
        }).kind,
      )
    : null;

  // The brand's fill, not the prototype's red: stopping is how a need ends once it has its people,
  // not something taken away. Red is for deleting one.
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      onConfirm={onConfirm}
      title="停止招募這筆需求？"
      confirmLabel={submitting ? '停止中...' : '停止招募'}
      confirmIcon={<HowToRegRoundedIcon />}
      confirmDisabled={!need || settled}
      cancelLabel={settled || dialog.box === 'gone' ? '關閉' : '取消'}
      error={dialog.refusal}
      submitting={submitting}
    >
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
              <DetailLine icon={<GroupsRoundedIcon />}>{headcount}</DetailLine>
            </Stack>
          </>
        ) : (
          <Typography
            sx={{
              color: color.fg.neutral.muted,
              fontSize: displayTextSize[13],
            }}
          >
            {/* Deleted between the tap and the load: say so rather than load forever. */}
            {dialog.box === 'loading'
              ? '載入中...'
              : '找不到這筆需求，可能已經被刪除。'}
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
          {`停止後不再接受新的承接，名額固定為目前的 ${need.assignedCount} 人。已承接的志工會收到通知、照常前往，也不能再釋出名額。這個動作無法復原，之後還需要人，請另外新增一筆需求。`}
        </Typography>
      ) : null}
    </Dialog>
  );
}
