'use client';

import { Divider, Stack, Typography } from '@mui/material';
import { Clock, FileEdit, Globe } from 'lucide-react';
import type { ReactNode } from 'react';

import { Badge, Card, Markdown, designTokens } from '@rescue-frontend/ui';

import { briefingAgo, briefingTime, type Briefing } from './briefing-content';

const { color, typography } = designTokens;

export function BriefingStamp({
  briefing,
  versionNumber,
  showActor = true,
}: {
  briefing: Briefing;
  versionNumber?: number;
  showActor?: boolean;
}) {
  const published = Boolean(briefing.publishedAt);
  const at = briefing.publishedAt ?? briefing.updatedAt ?? briefing.createdAt;
  const actor = published
    ? briefing.publisher?.name
    : (briefing.updater?.name ?? briefing.creator?.name);

  return (
    <Stack
      direction="row"
      sx={{
        alignItems: 'center',
        gap: 1,
        flexWrap: 'wrap',
        color: color.fg.neutral.muted,
      }}
    >
      <Clock size={13} aria-hidden />
      <Typography
        component="span"
        sx={{ ...typography.data[300], color: color.fg.neutral.muted }}
      >
        {published ? '最後更新' : '草稿儲存於'}{' '}
        {at ? (
          <>
            <time dateTime={at}>{briefingTime(at)}</time>（{briefingAgo(at)}）
          </>
        ) : (
          '時間未提供'
        )}
        {showActor && actor ? ` · ${actor}` : ''}
      </Typography>
      {versionNumber !== undefined ? (
        <Badge>第 {versionNumber} 版</Badge>
      ) : null}
    </Stack>
  );
}

export function BriefingPreview({
  content,
  title,
  briefing,
  versionNumber,
  readOnly = false,
  tone,
}: {
  content: string;
  title: ReactNode;
  briefing?: Briefing;
  versionNumber?: number;
  readOnly?: boolean;
  tone?: 'success' | 'info' | 'warning';
}) {
  return (
    <Card component="article" sx={{ maxWidth: 780, width: '100%' }}>
      <Stack sx={{ gap: 2 }}>
        <Stack
          direction="row"
          sx={{
            alignItems: 'center',
            gap: 1,
            flexWrap: 'wrap',
            color: tone ? color.fg[tone] : color.fg.neutral.default,
          }}
        >
          {tone ? (
            tone === 'success' ? (
              <Globe size={15} aria-hidden />
            ) : (
              <FileEdit size={15} aria-hidden />
            )
          ) : null}
          <Typography
            component="h2"
            sx={{ ...typography.body[300], fontWeight: 700 }}
          >
            {title}
          </Typography>
          {readOnly ? (
            <Typography
              component="span"
              sx={{
                ...typography.body[300],
                ml: 'auto',
                color: color.fg.neutral.muted,
              }}
            >
              唯讀，修改請按「編輯內容」
            </Typography>
          ) : null}
        </Stack>
        <Divider />
        {briefing?.publishedAt ? (
          <BriefingStamp
            briefing={briefing}
            versionNumber={versionNumber}
            showActor={false}
          />
        ) : null}
        {content.trim() ? (
          <Markdown source={content} navigation />
        ) : (
          <Typography sx={{ color: color.fg.neutral.muted }}>
            這一份還沒有任何內容。
          </Typography>
        )}
      </Stack>
    </Card>
  );
}
