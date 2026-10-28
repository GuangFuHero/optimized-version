'use client';

import { useEffect, useState } from 'react';

import { Box, MenuItem, TextField } from '@mui/material';
import { useCreateTicketTask } from '@rescue-frontend/data-access/admin';
import { Button, Callout, TextInput } from '@rescue-frontend/ui';

import { addNeedErrorMessage, type ClaimError } from '../../needs/claim-error';
import { formatTicketTypeLabel } from '../../status';
import { DuplicateNotice } from './duplicate-notice';
import {
  buildNeedInput,
  isForbidden,
  NEED_TYPES,
  readCreateResult,
  validateNeedDraft,
  type DuplicateSuspect,
  type NeedDraft,
  type NeedDraftErrors,
} from './model/task-actions';

const EMPTY_DRAFT: NeedDraft = {
  taskType: 'hr',
  taskName: '',
  quantity: '',
  description: '',
};

function addError(error: unknown): string {
  const refusal = error as ClaimError;
  return isForbidden(refusal)
    ? '你的帳號沒有新增需求的權限。'
    : addNeedErrorMessage(refusal);
}

/**
 * 再加一項需求 (`ticket.add`): a collapsed button that opens a small form under the ticket's needs.
 * A likely duplicate holds the create back behind `DuplicateNotice` until the user resends it.
 */
export function AddNeedForm({
  ticketUuid,
  onBusyChange,
}: {
  ticketUuid: string;
  /** The create is in flight (or not), as `TicketForm` reports its save. */
  onBusyChange?(busy: boolean): void;
}) {
  const createTask = useCreateTicketTask();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<NeedDraft>(EMPTY_DRAFT);
  const [errors, setErrors] = useState<NeedDraftErrors>({});
  const [suspects, setSuspects] = useState<DuplicateSuspect[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const submitting = createTask.isPending;
  useEffect(() => {
    onBusyChange?.(submitting);
  }, [submitting, onBusyChange]);
  useEffect(() => () => onBusyChange?.(false), [onBusyChange]);

  const change = (key: keyof NeedDraft, value: string) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
    // The notice was about the draft as sent; an edit makes it a new one to check.
    setSuspects(null);
  };

  const close = () => {
    if (submitting) return;
    setOpen(false);
    setDraft(EMPTY_DRAFT);
    setErrors({});
    setSuspects(null);
    setError(null);
  };

  async function create(acknowledgedDuplicateOf?: string) {
    if (submitting) return;
    setError(null);
    try {
      const { createTicketTask: result } = await createTask.mutateAsync({
        input: buildNeedInput(ticketUuid, draft),
        acknowledgedDuplicateOf,
      });
      const read = readCreateResult(result);
      if (read.kind === 'duplicates') {
        setSuspects(read.suspects);
        return;
      }
      setSuspects(null);
      setOpen(false);
      setDraft(EMPTY_DRAFT);
    } catch (caught) {
      setError(addError(caught));
    }
  }

  const submit = () => {
    const next = validateNeedDraft(draft);
    setErrors(next);
    if (Object.keys(next).length === 0) void create();
  };

  if (!open) {
    return (
      <Button
        size="sm"
        variant="outline"
        onClick={() => setOpen(true)}
        sx={{ mt: '8px' }}
      >
        再加一項需求
      </Button>
    );
  }

  return (
    <Box
      component="form"
      noValidate
      aria-label="再加一項需求"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      sx={{ display: 'flex', flexDirection: 'column', gap: '12px', mt: '8px' }}
    >
      <TextField
        select
        fullWidth
        size="small"
        label="類型"
        value={draft.taskType}
        disabled={submitting}
        onChange={(event) => change('taskType', event.target.value)}
      >
        {NEED_TYPES.map((type) => (
          <MenuItem key={type} value={type}>
            {formatTicketTypeLabel(type)}
          </MenuItem>
        ))}
      </TextField>
      <TextInput
        label="需求名稱"
        required
        value={draft.taskName}
        disabled={submitting}
        error={errors.taskName}
        onChange={(event) => change('taskName', event.target.value)}
      />
      <TextInput
        label="數量"
        required={draft.taskType !== 'rescue'}
        hint={draft.taskType === 'rescue' ? '救援可不填' : undefined}
        type="number"
        inputProps={{ min: 1, step: 1 }}
        value={draft.quantity}
        disabled={submitting}
        error={errors.quantity}
        onChange={(event) => change('quantity', event.target.value)}
      />
      <TextInput
        label="說明"
        multiline
        minRows={2}
        value={draft.description}
        disabled={submitting}
        onChange={(event) => change('description', event.target.value)}
      />
      {error ? <Callout tone="danger">{error}</Callout> : null}
      {suspects ? (
        <DuplicateNotice
          suspects={suspects}
          submitting={submitting}
          onBack={() => setSuspects(null)}
          onConfirm={() => void create(suspects[0]?.relatedUuid)}
        />
      ) : (
        <Box sx={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <Button
            size="sm"
            variant="outline"
            disabled={submitting}
            onClick={close}
          >
            取消
          </Button>
          <Button size="sm" type="submit" disabled={submitting}>
            {submitting ? '新增中…' : '新增'}
          </Button>
        </Box>
      )}
    </Box>
  );
}
