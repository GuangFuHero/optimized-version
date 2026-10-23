'use client';

import { Box, Stack, Typography } from '@mui/material';

import { Badge, Card, Markdown, designTokens } from '@rescue-frontend/ui';

import { briefingTime, type Briefing } from './briefing-content';

const { color, typography } = designTokens;

export function BriefingVersions({ versions }: { versions: Briefing[] }) {
  return (
    <Stack sx={{ gap: 2 }}>
      <Typography
        sx={{ ...typography.body[300], color: color.fg.neutral.muted }}
      >
        保留每次發布的完整內容，依發布時間由新到舊排列。草稿不會出現在這裡。
      </Typography>
      {versions.length === 0 ? <Card>尚無已發布版本。</Card> : null}
      {versions.map((version, index) => (
        <Card
          key={version.uuid}
          component="details"
          sx={{ p: 0, overflow: 'hidden' }}
        >
          <Box
            component="summary"
            sx={{ p: 2, cursor: 'pointer', ...typography.label[400] }}
          >
            第 {versions.length - index} 版 ·{' '}
            {version.publishedAt
              ? briefingTime(version.publishedAt)
              : '發布時間未提供'}
            {' · '}
            {version.publisher?.name ?? '發布者未提供'}
            {index === 0 ? (
              <Badge tone="success" sx={{ ml: 1 }}>
                目前對外的內容
              </Badge>
            ) : null}
          </Box>
          <Box sx={{ px: 2, pb: 2 }}>
            <Markdown source={version.content} navigation />
          </Box>
        </Card>
      ))}
    </Stack>
  );
}
