import { ArrowRight, History } from 'lucide-react';
import { Box, Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';

import { designTokens } from '../../theme';

const { color, radius, typography } = designTokens;

export type TimelineTone =
  | 'neutral'
  | 'primary'
  | 'secondary'
  | 'success'
  | 'danger';

const TONES: Record<TimelineTone, { bg: string; fg: string }> = {
  neutral: { bg: color.bg.neutral.sunken, fg: color.fg.neutral.muted },
  primary: { bg: color.bg.primary.subtle, fg: color.brand.primary.subtle },
  secondary: {
    bg: color.bg.secondary.subtle,
    fg: color.brand.secondary.subtle,
  },
  success: { bg: color.bg.success.subtle, fg: color.fg.success },
  danger: { bg: color.bg.danger.subtle, fg: color.fg.danger },
};

export interface TimelineItem {
  id: string;
  title: ReactNode;
  at: string;
  actor?: ReactNode;
  content?: ReactNode;
  icon?: ReactNode;
  tone?: TimelineTone;
}

export const timelineTimeFormatter = new Intl.DateTimeFormat('zh-TW', {
  timeZone: 'Asia/Taipei',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

export interface TimelineProps {
  items: readonly TimelineItem[];
  showIcons?: boolean;
  emptyText?: ReactNode;
}

export function Timeline({
  items,
  showIcons = false,
  emptyText = '尚無紀錄。',
}: TimelineProps) {
  if (!items.length) {
    return (
      <Typography
        sx={{ ...typography.body[300], color: color.fg.neutral.muted }}
      >
        {emptyText}
      </Typography>
    );
  }

  return (
    <Box component="ol" sx={{ m: 0, p: 0, listStyle: 'none' }}>
      {items.map((item, index) => {
        const t = TONES[item.tone ?? 'neutral'];
        const last = index === items.length - 1;

        return (
          <Box
            component="li"
            key={item.id}
            sx={{
              display: 'grid',
              gridTemplateColumns: '26px minmax(0, 1fr)',
              columnGap: '12px',
            }}
          >
            <Stack sx={{ alignItems: 'center' }}>
              {showIcons ? (
                <Box
                  sx={{
                    display: 'grid',
                    placeItems: 'center',
                    width: 26,
                    height: 26,
                    flexShrink: 0,
                    borderRadius: `${radius.full}px`,
                    bgcolor: t.bg,
                    color: t.fg,
                    '& .MuiSvgIcon-root, & .lucide': {
                      width: 14,
                      height: 14,
                      fontSize: 14,
                    },
                  }}
                >
                  {item.icon ?? <History />}
                </Box>
              ) : (
                <Box
                  sx={{
                    width: 9,
                    height: 9,
                    mt: '5px',
                    flexShrink: 0,
                    borderRadius: `${radius.full}px`,
                    bgcolor: t.fg,
                  }}
                />
              )}
              {last ? null : (
                <Box
                  sx={{
                    flex: 1,
                    width: '1px',
                    minHeight: 14,
                    mt: '3px',
                    bgcolor: color.border.default,
                  }}
                />
              )}
            </Stack>
            <Stack sx={{ minWidth: 0, gap: '4px', pb: last ? 0 : '16px' }}>
              <Stack
                direction="row"
                sx={{
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  columnGap: '8px',
                  rowGap: '4px',
                  minHeight: 26,
                }}
              >
                <Box
                  sx={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    gap: '8px',
                    ...typography.label[400],
                    color: color.fg.neutral.default,
                  }}
                >
                  {item.title}
                </Box>
                <Typography
                  sx={{
                    ml: 'auto',
                    ...typography.data[300],
                    color: color.fg.neutral.muted,
                    whiteSpace: 'nowrap',
                  }}
                >
                  <time dateTime={item.at}>
                    {timelineTimeFormatter.format(new Date(item.at))}
                  </time>
                  {item.actor != null ? (
                    <>
                      {' · '}
                      {item.actor}
                    </>
                  ) : null}
                </Typography>
              </Stack>
              {item.content != null ? (
                <Box
                  sx={{
                    ...typography.body[300],
                    color: color.fg.neutral.subtle,
                    overflowWrap: 'anywhere',
                  }}
                >
                  {item.content}
                </Box>
              ) : null}
            </Stack>
          </Box>
        );
      })}
    </Box>
  );
}

export type TimelineChangeData = { field: string } & (
  | { kind: 'withheld' }
  | { kind: 'values'; before: string; after: string }
);

export interface TimelineChangeProps {
  change: TimelineChangeData;
  label?: ReactNode;
}

const changeChipSx = {
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: 22,
  maxWidth: '100%',
  overflowWrap: 'anywhere',
  px: '9px',
  borderRadius: `${radius.md}px`,
  bgcolor: color.bg.neutral.subtle,
  ...typography.data[300],
} as const;

export function TimelineChange({
  change,
  label = change.field,
}: TimelineChangeProps) {
  return (
    <Stack
      direction="row"
      sx={{ flexWrap: 'wrap', alignItems: 'center', gap: '7px', mt: '2px' }}
    >
      {label ? (
        <Box
          component="span"
          sx={{ ...typography.body[300], color: color.fg.neutral.muted }}
        >
          {label}
        </Box>
      ) : null}
      {change.kind === 'withheld' ? (
        <Typography
          sx={{ ...typography.body[300], color: color.fg.neutral.muted }}
        >
          已變更，內容未公開
        </Typography>
      ) : (
        <>
          <Box
            component="span"
            sx={{
              ...changeChipSx,
              color: color.fg.neutral.muted,
              textDecoration: 'line-through',
            }}
          >
            {change.before}
          </Box>
          <Box
            component={ArrowRight}
            sx={{ width: 13, height: 13, color: color.fg.neutral.muted }}
          />
          <Box
            component="span"
            sx={{ ...changeChipSx, color: color.fg.neutral.default }}
          >
            {change.after}
          </Box>
        </>
      )}
    </Stack>
  );
}
