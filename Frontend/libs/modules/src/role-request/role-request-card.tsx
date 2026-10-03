'use client';

import { Box, Stack, Typography } from '@mui/material';

import {
  Badge,
  type BadgeTone,
  designTokens,
  displayTextSize,
} from '@rescue-frontend/ui';

import type { RoleRequestRow } from './drawer-view';
import { ROLE_REQUEST_LABELS } from './form';

const { color, radius } = designTokens;

// Prototype `ROLE_REQUEST_STATUS` (site-actions.jsx:151-155). A withdrawn application gets no card.
const STATUS_META: Record<string, { label: string; tone: BadgeTone }> = {
  pending: { label: '審核中', tone: 'warning' },
  approved: { label: '已通過', tone: 'success' },
  rejected: { label: '未通過', tone: 'neutral' },
};

const submittedAt = new Intl.DateTimeFormat('zh-TW', {
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/**
 * One application in the drawer (prototype `RoleRequestCard`, site-actions.jsx:267-294): when it was
 * sent, what it asks for, where it stands, the applicant's reason, and the reviewer's reply to a
 * rejection.
 */
export function RoleRequestCard({ request }: { request: RoleRequestRow }) {
  const meta = STATUS_META[request.status] ?? STATUS_META.pending;

  return (
    <Box
      sx={{
        p: 2,
        borderRadius: `${radius.md}px`,
        border: `1px solid ${color.border.default}`,
        bgcolor: color.bg.neutral.subtle,
      }}
    >
      <Stack
        direction="row"
        sx={{
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 1,
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography
            sx={{
              color: color.fg.neutral.muted,
              fontSize: displayTextSize[11],
              lineHeight: 1.4,
            }}
          >
            {submittedAt.format(new Date(request.createdAt))} 送出
          </Typography>
          <Typography
            sx={{
              mt: 0.25,
              color: color.fg.neutral.default,
              fontSize: displayTextSize[15],
              lineHeight: 1.4,
              fontWeight: 700,
            }}
          >
            {ROLE_REQUEST_LABELS[request.requestedRole]}
          </Typography>
        </Box>
        <Badge tone={meta.tone}>{meta.label}</Badge>
      </Stack>
      {request.reason ? (
        <Typography
          sx={{
            mt: 1,
            color: color.fg.neutral.subtle,
            fontSize: displayTextSize[13],
            lineHeight: 1.6,
            whiteSpace: 'pre-wrap',
          }}
        >
          {request.reason}
        </Typography>
      ) : null}
      {request.status === 'rejected' && request.reviewNote ? (
        <Typography
          sx={{
            mt: 1,
            color: color.fg.neutral.default,
            fontSize: displayTextSize[13],
            lineHeight: 1.6,
            whiteSpace: 'pre-wrap',
          }}
        >
          審核回覆：{request.reviewNote}
        </Typography>
      ) : null}
    </Box>
  );
}
