'use client';

import { Box, Stack, Typography } from '@mui/material';

import {
  type BadgeTone,
  designTokens,
  displayTextSize,
} from '@rescue-frontend/ui';

import { SiteBadge } from '../shell/site/site-badge';
import type { RoleRequestRow } from './drawer-view';
import { ROLE_REQUEST_LABELS } from './form';
import { teamNoun } from './team';

const { color, radius } = designTokens;

// Prototype `ROLE_REQUEST_STATUS` (site-actions.jsx).
const STATUS_META: Record<string, { label: string; tone: BadgeTone }> = {
  pending: { label: '審核中', tone: 'warning' },
  approved: { label: '已通過', tone: 'success' },
  rejected: { label: '未通過', tone: 'neutral' },
  withdrawn: { label: '已撤回', tone: 'neutral' },
};

// Taiwan time whatever the device's zone, as 我承接的 and 我建立的 show theirs (`formatTaiwanTime`).
const submittedAt = new Intl.DateTimeFormat('zh-TW', {
  timeZone: 'Asia/Taipei',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** The team it asks to join, or the one it asks to found; none for a data auditor. */
function teamLine(request: RoleRequestRow): string | null {
  if (request.team) {
    return request.team.name;
  }

  if (!request.newTeamName) {
    return null;
  }

  const waiting = request.status === 'pending' ? '，待審核' : '';

  return `${request.newTeamName}（新${teamNoun(request.requestedRole)}${waiting}）`;
}

/**
 * One application in the drawer (prototype `RoleRequestCard`, site-actions.jsx:539-575): when it was
 * sent, what it asks for and for which team, who sent it, where it stands, the applicant's reason,
 * and the reviewer's reply to a rejection.
 */
export function RoleRequestCard({ request }: { request: RoleRequestRow }) {
  const meta = STATUS_META[request.status] ?? STATUS_META.pending;
  const team = teamLine(request);
  // The phone comes masked (backend `mask_phone`); applications from before Spec/026 have neither.
  const applicant = [request.applicantName, request.applicantPhone]
    .filter(Boolean)
    .join(' · ');

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
          {applicant ? (
            <Typography
              sx={{
                mt: 0.25,
                color: color.fg.neutral.subtle,
                fontSize: displayTextSize[12],
                lineHeight: 1.4,
              }}
            >
              {applicant}
            </Typography>
          ) : null}
          {team ? (
            <Typography
              sx={{
                mt: 0.25,
                color: color.fg.neutral.subtle,
                fontSize: displayTextSize[13],
                lineHeight: 1.4,
              }}
            >
              {team}
            </Typography>
          ) : null}
        </Box>
        <SiteBadge tone={meta.tone}>{meta.label}</SiteBadge>
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
