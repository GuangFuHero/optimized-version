import {
  ArrowRight,
  History,
  Plus,
  Pencil,
  Trash2,
  RotateCcw,
  UserPlus,
  UserMinus,
} from 'lucide-react';
import { Box, Stack, Typography } from '@mui/material';
import type { components } from '@rescue-frontend/data-access/openapi';
import type { ReactNode } from 'react';
import { z } from 'zod';

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

export type TimelineItem = components['schemas']['HistoryEventResponse'];

const EVENTS = [
  { type: 'CREATED', label: '建立', tone: 'success', Icon: Plus },
  { type: 'UPDATED', label: '更新', tone: 'neutral', Icon: Pencil },
  { type: 'DELETED', label: '刪除', tone: 'danger', Icon: Trash2 },
  { type: 'RESTORED', label: '還原', tone: 'success', Icon: RotateCcw },
  { type: 'ASSIGNED', label: '指派', tone: 'primary', Icon: UserPlus },
  { type: 'UNASSIGNED', label: '解除指派', tone: 'secondary', Icon: UserMinus },
] as const;

const ENTITY_LABELS = new Map([
  ['ticket', '任務單'],
  ['station', '站點'],
  ['task', '任務'],
  ['task_property', '任務資源'],
  ['task_assignment', '任務指派'],
  ['station_property', '站點資源'],
  ['secondary_location', '位置'],
]);

const eventTime = new Intl.DateTimeFormat('zh-TW', {
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
        const event = EVENTS.find((event) => event.type === item.event_type);
        const t = TONES[event?.tone ?? 'neutral'];
        const Icon = event?.Icon ?? History;
        const last = index === items.length - 1;

        return (
          <Box
            component="li"
            key={`${item.entity}:${item.at}:${item.event_type}:${index}`}
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
                  <Icon />
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
                <Typography
                  sx={{
                    ...typography.label[400],
                    color: color.fg.neutral.default,
                  }}
                >
                  {event?.label ?? item.event_type}
                  {' · '}
                  {ENTITY_LABELS.get(item.entity) ?? item.entity}
                </Typography>
                <Typography
                  sx={{
                    ml: 'auto',
                    ...typography.data[300],
                    color: color.fg.neutral.muted,
                    whiteSpace: 'nowrap',
                  }}
                >
                  <time dateTime={item.at}>
                    {eventTime.format(new Date(item.at))}
                  </time>
                  {' · '}
                  {item.actor.name ??
                    (item.actor.kind === 'system' ? '系統' : item.actor.kind)}
                  {item.actor.is_removed ? '（已移除）' : null}
                </Typography>
              </Stack>
              {item.changes.length ? (
                <Box
                  sx={{
                    ...typography.body[300],
                    color: color.fg.neutral.subtle,
                  }}
                >
                  {item.changes.map((change, changeIndex) => (
                    <TimelineChange
                      key={`${change.field}:${changeIndex}`}
                      change={change}
                    />
                  ))}
                </Box>
              ) : null}
            </Stack>
          </Box>
        );
      })}
    </Box>
  );
}

export interface TimelineChangeProps {
  change: components['schemas']['ChangeResponse'];
  label?: ReactNode;
}

const changeValue = z
  .union([
    z.string(),
    z.null().transform(() => '未設定'),
    z.json().transform((value) => JSON.stringify(value)),
  ])
  .catch('未設定');

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
      {change.changed ? (
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
            {changeValue.parse(change.before)}
          </Box>
          <Box
            component={ArrowRight}
            sx={{ width: 13, height: 13, color: color.fg.neutral.muted }}
          />
          <Box
            component="span"
            sx={{ ...changeChipSx, color: color.fg.neutral.default }}
          >
            {changeValue.parse(change.after)}
          </Box>
        </>
      )}
    </Stack>
  );
}
