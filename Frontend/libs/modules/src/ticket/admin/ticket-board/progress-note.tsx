'use client';

import { useEffect, useState } from 'react';

import { Box, ButtonBase, Typography } from '@mui/material';
import { useUpdateTicketTask } from '@rescue-frontend/data-access/admin';
import { Button, Callout, designTokens, TextInput } from '@rescue-frontend/ui';
import { PenLine } from 'lucide-react';

import {
  progressNoteErrorMessage,
  type ClaimError,
} from '../../needs/claim-error';
import { progressNoteInput } from './model/task-actions';

const { color, radius, typography } = designTokens;

/**
 * A need's 進度備註 (`progressNote`): how the rescue on it stands, in words, between status changes
 * (BE-036: rescue progress is the need's status, its progress notes and the history). The backend
 * withholds the note without detail on the ticket, so a null reads as none. `ticket.edit` on the
 * ticket (`canEdit`) writes it through `updateTicketTask`, the one field that call changes.
 */
export function ProgressNote({
  taskUuid,
  note,
  canEdit,
  onBusyChange,
}: {
  taskUuid: string;
  note: string | null;
  canEdit: boolean;
  /** The save is in flight (or not), as the need's other writes report theirs. */
  onBusyChange?(busy: boolean): void;
}) {
  const updateTask = useUpdateTicketTask();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const saving = updateTask.isPending;
  useEffect(() => {
    onBusyChange?.(saving);
  }, [saving, onBusyChange]);
  useEffect(() => () => onBusyChange?.(false), [onBusyChange]);

  const open = () => {
    setDraft(note ?? '');
    setError(null);
    setEditing(true);
  };

  async function save() {
    if (saving) return;
    const input = progressNoteInput(note, draft);
    if (!input) {
      setEditing(false);
      return;
    }
    setError(null);
    try {
      await updateTask.mutateAsync({ uuid: taskUuid, input });
      setEditing(false);
    } catch (caught) {
      setError(progressNoteErrorMessage(caught as ClaimError));
    }
  }

  if (editing) {
    return (
      <Box
        component="form"
        noValidate
        aria-label="進度備註"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
        sx={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
      >
        <TextInput
          label="進度備註"
          hint="例如：3F 已清空，B1 待確認。清空後儲存即刪除備註。"
          multiline
          minRows={2}
          autoFocus
          value={draft}
          disabled={saving}
          onChange={(event) => setDraft(event.target.value)}
        />
        {error ? <Callout tone="danger">{error}</Callout> : null}
        <Box sx={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <Button
            size="sm"
            variant="outline"
            disabled={saving}
            onClick={() => setEditing(false)}
          >
            取消
          </Button>
          <Button size="sm" type="submit" disabled={saving}>
            {saving ? '儲存中…' : '儲存'}
          </Button>
        </Box>
      </Box>
    );
  }

  if (!note && !canEdit) return null;

  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
      {note ? (
        <Box
          sx={{
            flex: 1,
            minWidth: 0,
            px: '10px',
            py: '6px',
            borderRadius: `${radius.sm}px`,
            background: color.bg.neutral.subtle,
          }}
        >
          <Typography
            component="span"
            sx={{
              display: 'block',
              ...typography.label[300],
              color: color.fg.neutral.muted,
            }}
          >
            進度備註
          </Typography>
          <Typography
            component="p"
            sx={{
              ...typography.body[300],
              color: color.fg.neutral.default,
              whiteSpace: 'pre-wrap',
              overflowWrap: 'anywhere',
            }}
          >
            {note}
          </Typography>
        </Box>
      ) : null}
      {canEdit ? (
        <ButtonBase
          onClick={open}
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            height: 24,
            px: '10px',
            borderRadius: `${radius.full}px`,
            ...typography.data[300],
            color: color.brand.secondary.default,
          }}
        >
          <PenLine size={12} />
          {note ? '編輯備註' : '寫進度備註'}
        </ButtonBase>
      ) : null}
    </Box>
  );
}
