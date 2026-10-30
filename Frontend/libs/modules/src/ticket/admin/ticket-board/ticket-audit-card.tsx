'use client';

import { Box, Typography } from '@mui/material';
import { Badge, designTokens } from '@rescue-frontend/ui';
import Link from 'next/link';

import { AUDIT_BADGES, auditTag, type AuditStatus } from './model/ticket-row';

const { color, typography } = designTokens;

/** The 重複審核 page (the nav's 資料檢核), where suspected duplicates are worked through. */
export const DUPLICATE_REVIEW_HREF = '/audit';

/**
 * 重複審核 on a ticket: where it stands on duplicates, and nothing to decide here (糖, Discord
 * #uiux, 2026-10-30). Duplicates are settled on the 重複審核 page, so a suspected one links
 * there.
 */
export function TicketAuditCard({ auditStatus }: { auditStatus: string }) {
  const tag = auditTag(auditStatus);

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '8px',
      }}
    >
      {tag ? (
        <Badge tone={tag.tone}>{tag.label}</Badge>
      ) : (
        <Typography
          component="span"
          sx={{ ...typography.body[300], color: color.fg.neutral.default }}
        >
          {AUDIT_BADGES[auditStatus as AuditStatus]?.label ?? auditStatus}
        </Typography>
      )}
      {auditStatus === 'need_audit' ? (
        <Box
          component={Link}
          href={DUPLICATE_REVIEW_HREF}
          sx={{
            ...typography.label[400],
            color: color.fg.neutral.default,
            textDecoration: 'underline',
          }}
        >
          前往重複審核
        </Box>
      ) : null}
    </Box>
  );
}
