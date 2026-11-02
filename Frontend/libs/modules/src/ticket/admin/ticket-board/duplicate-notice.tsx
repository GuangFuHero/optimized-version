'use client';

import { Box, Link } from '@mui/material';
import { Button, Callout, designTokens } from '@rescue-frontend/ui';

import type { DuplicateSuspect } from './model/task-actions';
import { adminTicketHref } from './model/ticket-detail-view';

const { typography } = designTokens;

interface DuplicateNoticeProps {
  suspects: DuplicateSuspect[];
  /** The resend is on its way: both buttons wait for it. */
  submitting: boolean;
  /** 返回修改: drop the notice and keep editing the draft. */
  onBack: () => void;
  /** 仍要新增: resend, acknowledging the first suspect. */
  onConfirm: () => void;
}

/**
 * The backend held a create back as a likely duplicate (`DuplicatesSuspected`). Shown in place of
 * the form's submit, like the station form's notice: each suspect links to its ticket in a new tab,
 * so the draft stays as it is while the user looks.
 */
export function DuplicateNotice({
  suspects,
  submitting,
  onBack,
  onConfirm,
}: DuplicateNoticeProps) {
  return (
    <Callout tone="warning">
      附近可能已有相同的需求。確認不是重複後再新增。
      {suspects.length ? (
        <Box
          component="ul"
          sx={{
            m: 0,
            mt: '8px',
            pl: '18px',
            ...typography.body[300],
          }}
        >
          {suspects.map((suspect) => (
            <li key={`${suspect.draftIndex}-${suspect.relatedUuid}`}>
              {suspect.draftIndex < 0 ? '相似的求助單' : '相似的需求'}
              {suspect.relatedTicketUuid ? (
                <>
                  {' · '}
                  <Link
                    href={adminTicketHref(suspect.relatedTicketUuid)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    查看
                  </Link>
                </>
              ) : null}
            </li>
          ))}
        </Box>
      ) : null}
      <Box sx={{ display: 'flex', gap: '8px', mt: '8px' }}>
        <Button
          size="sm"
          variant="outline"
          disabled={submitting}
          onClick={onBack}
        >
          返回修改
        </Button>
        <Button size="sm" disabled={submitting} onClick={onConfirm}>
          {submitting ? '新增中…' : '仍要新增'}
        </Button>
      </Box>
    </Callout>
  );
}
