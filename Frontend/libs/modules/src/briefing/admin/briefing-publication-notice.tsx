'use client';

import { Box, Stack } from '@mui/material';
import { EyeOff, Globe, LockKeyhole } from 'lucide-react';

import { designTokens } from '@rescue-frontend/ui';

import { briefingAgo, type Briefing } from './briefing-content';

const { color, radius, typography } = designTokens;

export function BriefingPublicationNotice({
  published,
  versionCount,
  hasDraftChanges,
}: {
  published?: Briefing;
  versionCount: number;
  hasDraftChanges: boolean;
}) {
  const Icon = published ? Globe : EyeOff;

  return (
    <Stack
      direction="row"
      sx={{
        gap: 1,
        alignItems: 'flex-start',
        p: '12px 14px',
        borderRadius: `${radius.md}px`,
        bgcolor: published ? color.bg.success.subtle : color.bg.warning.subtle,
        color: published ? color.fg.success : color.fg.warning,
      }}
    >
      <Icon size={16} aria-hidden style={{ marginTop: 2, flexShrink: 0 }} />
      <Box sx={{ ...typography.body[300], lineHeight: 1.75 }}>
        {published ? (
          <>
            志工在前台<strong>看得到</strong>行前資訊：第 {versionCount} 版，
            {published.publishedAt
              ? `${briefingAgo(published.publishedAt)}發布。`
              : '已發布。'}
            {hasDraftChanges ? (
              <>
                另有一份<strong>還沒發布的修改</strong>。
              </>
            ) : null}
          </>
        ) : (
          <>
            前台<strong>目前沒有行前資訊</strong>
            。志工打開那一頁會看到空白提示。
          </>
        )}
        <Stack
          direction="row"
          sx={{ alignItems: 'center', gap: 0.5, opacity: 0.85 }}
        >
          <LockKeyhole size={12} aria-hidden style={{ flexShrink: 0 }} />
          <span>
            一個專案就是一場災害，所以<strong>只有一份</strong>
            ，民眾也不需要自己選災害類型。
          </span>
        </Stack>
      </Box>
    </Stack>
  );
}
