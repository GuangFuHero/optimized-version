'use client';

import { Box, Stack, Typography } from '@mui/material';
import { useCallback, useState } from 'react';
import { useMutation } from '@tanstack/react-query';

import {
  DeleteTicketDocument,
  type GraphqlError,
} from '@rescue-frontend/data-access';
import {
  designTokens,
  Dialog,
  displayTextSize,
  Icons,
} from '@rescue-frontend/ui';

import { siteGraphqlMutation } from '../../session/site-clients';
import { SiteToast } from '../../shell/site/site-toast';
import { deleteTicketErrorMessage, isTicketAlreadyGone } from './claim-error';
import { describeTicketDeletion, formatTicketNeedCount } from './delete-ticket';
import { readTicketNeeds, useCachedTicket } from './use-ticket-needs';

const { color, radius } = designTokens;

interface DeleteTicketDialogProps {
  open: boolean;
  /** The ticket being deleted — still set while the dialog fades out, so it keeps its content. */
  ticketUuid: string | null;
  /** Why the last try was refused, already in the requester's words. */
  error: string | null;
  submitting: boolean;
  onCancel: () => void;
  /** With the ticket's title, for the word that it went. */
  onConfirm: (title: string) => void;
  /** Once it has faded out. */
  onExited: () => void;
  /** The word that the ticket went, once the dialog is gone; null before. */
  deletedTitle: string | null;
  toastOpen: boolean;
  onCloseToast: () => void;
}

/**
 * The whole-ticket delete confirmation's state, and what its buttons do. Hosted by the
 * page's `NeedClaimProvider`, next to deleting one need, so the reload after it reaches every view
 * of the ticket — which, finding it gone, takes it off the list or the map and shuts its drawer.
 */
export function useDeleteTicket(
  reloadTicket: (ticketUuid: string) => Promise<unknown>,
) {
  const { mutateAsync: executeDeleteTicket } = useMutation(
    siteGraphqlMutation(DeleteTicketDocument),
  );
  // Open is kept apart from the ticket, so the dialog keeps its content while it fades out.
  const [open, setOpen] = useState(false);
  const [ticketUuid, setTicketUuid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deletedTitle, setDeletedTitle] = useState<string | null>(null);
  const [toastOpen, setToastOpen] = useState(false);

  const request = useCallback((uuid: string) => {
    setError(null);
    setDeletedTitle(null);
    setTicketUuid(uuid);
    setOpen(true);
  }, []);

  const cancel = useCallback(() => setOpen(false), []);

  const confirm = useCallback(
    async (title: string) => {
      if (!ticketUuid) {
        return;
      }

      setSubmitting(true);
      setError(null);

      try {
        const refusal = await executeDeleteTicket({ uuid: ticketUuid }).then(
          () => null,
          (failure: GraphqlError) => failure,
        );

        // Gone already — from another tab — is what the requester asked for.
        if (!refusal || isTicketAlreadyGone(refusal)) {
          setDeletedTitle(title);
          setOpen(false);
          return;
        }

        // As with deleting a need: read the ticket again, so the dialog shows it as it now stands.
        await reloadTicket(ticketUuid);
        setError(deleteTicketErrorMessage(refusal));
      } finally {
        setSubmitting(false);
      }
    },
    [executeDeleteTicket, reloadTicket, ticketUuid],
  );

  // Read the ticket again only once the dialog is gone, as a deleted need is: read sooner, it drops
  // out while the dialog fades. Found gone, the page takes it off and shuts its drawer, and the word
  // that it went comes up — without it, a drawer that shuts reads the same as one that broke.
  const exited = useCallback(() => {
    if (deletedTitle !== null && ticketUuid) {
      void reloadTicket(ticketUuid);
      setToastOpen(true);
    }
  }, [deletedTitle, reloadTicket, ticketUuid]);

  const closeToast = useCallback(() => setToastOpen(false), []);

  return {
    request,
    dialogProps: {
      open,
      ticketUuid,
      error,
      submitting,
      onCancel: cancel,
      onConfirm: (title: string) => void confirm(title),
      onExited: exited,
      deletedTitle,
      toastOpen,
      onCloseToast: closeToast,
    } satisfies DeleteTicketDialogProps,
  };
}

/**
 * One look before the requester deletes their whole ticket (as the team decided, its needs go
 * with it and the people on them hear). Same shape as deleting one need, in the same
 * red; no design of its own exists — the prototype's 刪除媒合單 kept the ticket listed.
 *
 * It reads the ticket itself, like the other confirmations, so a refusal's reload lands here too.
 */
export function DeleteTicketDialog({
  open,
  ticketUuid,
  error,
  submitting,
  onCancel,
  onConfirm,
  onExited,
  deletedTitle,
  toastOpen,
  onCloseToast,
}: DeleteTicketDialogProps) {
  const { ticket, fetching } = useCachedTicket({ ticketUuid, open });
  const needs = readTicketNeeds(ticket);
  // Deleted between the tap and the load: nothing to confirm, and the way out is to close.
  const gone = !ticket && !fetching;

  return (
    <>
      <Dialog
        open={open}
        onClose={onCancel}
        onConfirm={() => ticket && onConfirm(ticket.title)}
        title="刪除整張單？"
        confirmLabel={submitting ? '刪除中…' : '刪除'}
        confirmIcon={<Icons.trash />}
        confirmTone="danger"
        confirmDisabled={!ticket}
        cancelLabel={gone ? '關閉' : '取消'}
        error={error}
        submitting={submitting}
        onExited={onExited}
      >
        <Box
          sx={{
            p: 2,
            borderRadius: `${radius.md}px`,
            bgcolor: color.bg.neutral.subtle,
            border: `1px solid ${color.border.default}`,
          }}
        >
          {ticket ? (
            <>
              <Typography
                sx={{
                  color: color.fg.neutral.default,
                  fontSize: displayTextSize[16],
                  lineHeight: 1.4,
                  fontWeight: 700,
                }}
              >
                {ticket.title}
              </Typography>
              <Stack
                direction="row"
                sx={{
                  mt: 0.75,
                  gap: 0.75,
                  alignItems: 'flex-start',
                  color: color.fg.neutral.subtle,
                }}
              >
                {/* As tall as a line of the text beside it, so the icon sits on that line at any
                    text size. */}
                <Box
                  sx={{
                    display: 'grid',
                    placeItems: 'center',
                    height: '1.6em',
                    fontSize: displayTextSize[13],
                    '& svg': { fontSize: 14 },
                  }}
                >
                  <Icons.heartHandshake />
                </Box>
                <Typography
                  sx={{ fontSize: displayTextSize[13], lineHeight: 1.6 }}
                >
                  {formatTicketNeedCount(needs.length)}
                </Typography>
              </Stack>
            </>
          ) : (
            <Typography
              sx={{
                color: color.fg.neutral.muted,
                fontSize: displayTextSize[13],
              }}
            >
              {gone ? '找不到這張單，可能已經被刪除。' : '載入中…'}
            </Typography>
          )}
        </Box>

        {ticket ? (
          <Typography
            sx={{
              color: color.fg.neutral.muted,
              fontSize: displayTextSize[13],
              lineHeight: 1.6,
            }}
          >
            {describeTicketDeletion(needs)}
          </Typography>
        ) : null}
      </Dialog>

      <SiteToast
        open={toastOpen}
        title={`已刪除「${deletedTitle ?? ''}」`}
        onClose={onCloseToast}
      />
    </>
  );
}
