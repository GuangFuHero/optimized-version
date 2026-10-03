'use client';

import AddRoundedIcon from '@mui/icons-material/AddRounded';
import { Alert, Button, ButtonBase, Stack, Typography } from '@mui/material';
import { useState } from 'react';
import { useMutation } from 'urql';

import { CreateTicketTaskDocument } from '@rescue-frontend/data-access';
import { designTokens, displayTextSize } from '@rescue-frontend/ui';

import { addNeedErrorMessage } from '../needs/claim-error';
import { useNeedClaim } from '../needs/need-claim-provider';
import { announceTicketChanged } from '../ticket-changes';
import { canAddNeed, toCreateTicketTaskInput } from './add-need';
import { emptyNeed, type NeedDraft } from './help-request-form';
import { NeedDraftRow } from './need-draft-row';

const { color, radius } = designTokens;

/** Whether the viewer is offered 「再加一件」 on this ticket — its requester, while it is not cancelled. */
export function useCanAddNeed(ticket: {
  ticketStatus?: string | null;
  ticketCreatedBy?: string | null;
}): boolean {
  const { viewerId } = useNeedClaim();

  return canAddNeed({ ...ticket, viewerId });
}

interface AddNeedPanelProps {
  ticketUuid: string;
  /** How many needs the ticket has: the one added is the next, for screen readers. */
  needCount: number;
}

/**
 * 「再加一件需要的幫忙」 at the foot of a ticket's needs, for its requester: one need at a
 * time, in the same row the drawer files them with. Added, it shows up in the list above — the
 * word that it went through — as every view of the ticket reloads it.
 */
export function AddNeedPanel({ ticketUuid, needCount }: AddNeedPanelProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<NeedDraft>(emptyNeed);
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, createTicketTask] = useMutation(CreateTicketTaskDocument);

  const close = () => {
    setOpen(false);
    setDraft(emptyNeed());
    setTouched(false);
    setError(null);
  };

  if (!open) {
    return (
      <ButtonBase
        onClick={() => setOpen(true)}
        sx={{
          gap: 0.75,
          width: '100%',
          height: 42,
          borderRadius: `${radius.md}px`,
          border: `1px dashed ${color.border.default}`,
          color: color.brand.secondary.subtle,
          fontSize: displayTextSize[14],
          fontWeight: 500,
        }}
      >
        <AddRoundedIcon sx={{ fontSize: 16 }} />
        再加一件需要的幫忙
      </ButtonBase>
    );
  }

  const submit = async () => {
    setTouched(true);

    const input = toCreateTicketTaskInput(ticketUuid, draft);

    if (!input || submitting) {
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const result = await createTicketTask({ input });

      // Answered either way: added, or the ticket changed under them — deleted, say — which every
      // view of it should now show.
      if (!result.error?.networkError) {
        announceTicketChanged(ticketUuid);
      }

      if (result.error) {
        setError(addNeedErrorMessage(result.error));
        return;
      }

      close();
    } finally {
      setSubmitting(false);
    }
  };

  const unchosen = touched && !draft.need;

  return (
    <Stack spacing={1.5}>
      <Typography
        sx={{
          color: color.fg.neutral.default,
          fontSize: displayTextSize[14],
          lineHeight: 1.2,
          fontWeight: 700,
        }}
      >
        再加一件需要的幫忙
      </Typography>
      {unchosen ? (
        <Typography
          role="alert"
          sx={{
            color: color.fg.danger,
            fontSize: displayTextSize[13],
            lineHeight: 1.5,
          }}
        >
          請選一項你需要的幫忙
        </Typography>
      ) : null}
      <NeedDraftRow
        row={draft}
        index={needCount}
        showIndex={false}
        canRemove={false}
        invalid={unchosen}
        onChange={setDraft}
        onRemove={close}
      />
      {error ? <Alert severity="error">{error}</Alert> : null}
      <Stack direction="row" spacing={1}>
        <Button
          variant="outlined"
          onClick={close}
          disabled={submitting}
          sx={{ flex: 1 }}
        >
          取消
        </Button>
        <Button
          variant="contained"
          onClick={() => void submit()}
          disabled={submitting}
          sx={{ flex: 2 }}
        >
          {submitting ? '加入中…' : '加上這一件'}
        </Button>
      </Stack>
    </Stack>
  );
}
