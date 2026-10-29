'use client';

import { useEffect, useState } from 'react';

import { Box, Typography } from '@mui/material';
import { useQueryClient } from '@tanstack/react-query';
import {
  useAuditTicket,
  type AuditVerdict,
} from '@rescue-frontend/data-access/admin';
import {
  Badge,
  Button,
  Callout,
  designTokens,
  TextInput,
  timelineTimeFormatter,
} from '@rescue-frontend/ui';

import { Muted } from '../../../admin/shared/muted';
import type { ClaimError } from '../../needs/claim-error';
import { auditErrorMessage, isStaleAudit } from './model/task-actions';
import type { DetailTicket } from './model/ticket-detail-view';
import { AUDIT_BADGES, type AuditStatus } from './model/ticket-row';

const { color, radius, typography } = designTokens;

interface TicketAuditCardProps {
  /** Must carry `auditContentHash`: the verdict is given on the content it names. */
  ticket: DetailTicket;
  /** A verdict went through. */
  onDone?: () => void;
  /** A verdict is in flight (or not), as `TicketForm` reports its save. */
  onBusyChange?(busy: boolean): void;
}

/**
 * Moderation (`ticket.audit`): the ticket's audit state, what changed since the last verdict, and
 * the two verdicts. Each is sent with the content hash the drawer loaded, so a ticket edited
 * meanwhile is refused rather than passed unseen.
 */
export function TicketAuditCard({
  ticket,
  onDone,
  onBusyChange,
}: TicketAuditCardProps) {
  const audit = useAuditTicket();
  const queryClient = useQueryClient();
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const submitting = audit.isPending;
  useEffect(() => {
    onBusyChange?.(submitting);
  }, [submitting, onBusyChange]);
  useEffect(() => () => onBusyChange?.(false), [onBusyChange]);
  const badge = AUDIT_BADGES[ticket.auditStatus as AuditStatus];
  const changes = ticket.changesSinceAudit?.length ?? 0;

  async function send(status: AuditVerdict) {
    if (submitting || !ticket.auditContentHash) return;
    const trimmed = note.trim();
    if (status === 'audit_issue' && !trimmed) {
      setNoteError('請填寫有問題的原因');
      return;
    }
    setError(null);
    try {
      await audit.mutateAsync({
        uuid: ticket.uuid,
        status,
        contentHash: ticket.auditContentHash,
        note: status === 'audit_issue' ? trimmed : null,
      });
      setNoteOpen(false);
      setNote('');
      onDone?.();
    } catch (caught) {
      const refusal = caught as ClaimError;
      setError(auditErrorMessage(refusal));
      // The ticket changed under the verdict: reload it, so the next try carries the new hash.
      if (isStaleAudit(refusal)) {
        void queryClient.invalidateQueries({ queryKey: ['admin', 'tickets'] });
      }
    }
  }

  return (
    <Box
      sx={{
        p: '12px',
        border: `1px solid ${color.border.default}`,
        borderRadius: `${radius.md}px`,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '8px',
        }}
      >
        <Badge tone={badge?.tone ?? 'neutral'}>
          {badge?.label ?? ticket.auditStatus}
        </Badge>
        {ticket.auditedAt ? (
          <Muted inline>
            {`審核於 ${timelineTimeFormatter.format(new Date(ticket.auditedAt))}`}
          </Muted>
        ) : null}
        {changes > 0 ? (
          <Badge tone="warning" size="sm">
            {`審核後有 ${changes} 項變更`}
          </Badge>
        ) : null}
      </Box>
      {ticket.auditNote ? (
        <Typography
          sx={{
            ...typography.body[300],
            color: color.fg.neutral.default,
            whiteSpace: 'pre-line',
            overflowWrap: 'anywhere',
          }}
        >
          {ticket.auditNote}
        </Typography>
      ) : null}
      {noteOpen ? (
        <TextInput
          label="有問題的原因"
          required
          multiline
          minRows={2}
          value={note}
          disabled={submitting}
          error={noteError}
          onChange={(event) => {
            setNote(event.target.value);
            setNoteError(null);
          }}
        />
      ) : null}
      {error ? <Callout tone="danger">{error}</Callout> : null}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
        {noteOpen ? (
          <>
            <Button
              size="sm"
              variant="outline"
              disabled={submitting}
              onClick={() => {
                setNoteOpen(false);
                setNoteError(null);
              }}
            >
              取消
            </Button>
            <Button
              size="sm"
              variant="danger"
              disabled={submitting || !note.trim()}
              onClick={() => void send('audit_issue')}
            >
              {submitting ? '送出中…' : '確認標記有問題'}
            </Button>
          </>
        ) : (
          <>
            <Button
              size="sm"
              disabled={submitting}
              onClick={() => void send('audited')}
            >
              {submitting ? '送出中…' : '審核通過'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={submitting}
              onClick={() => {
                setError(null);
                setNoteOpen(true);
              }}
            >
              標記有問題
            </Button>
          </>
        )}
      </Box>
    </Box>
  );
}
