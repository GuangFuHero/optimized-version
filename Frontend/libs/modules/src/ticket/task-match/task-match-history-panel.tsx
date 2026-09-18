'use client';

import DownloadRoundedIcon from '@mui/icons-material/FileDownloadRounded';
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded';
import PeopleAltRoundedIcon from '@mui/icons-material/PeopleAltRounded';
import { Box, Button, Stack, Typography } from '@mui/material';

import {
  createTaskMatchSummary,
  downloadTaskMatchLog,
  formatTaskMatchDate,
  taskMatchStatusLabels,
  taskMatchStatusTones,
  type TaskMatchState,
} from './model';

import { designTokens, displayTextSize } from '@rescue-frontend/ui';

const { color, primitives, radius } = designTokens;

interface TaskMatchHistoryPanelProps {
  state: TaskMatchState;
}

const statusToneStyles = {
  neutral: {
    color: color.fg.neutral.subtle,
    backgroundColor: color.bg.neutral.sunken,
    borderColor: color.border.default,
  },
  warning: {
    color: color.fg.warning,
    backgroundColor: color.bg.warning.subtle,
    borderColor: primitives.color.amber[500],
  },
  success: {
    color: color.fg.success,
    backgroundColor: color.bg.success.subtle,
    borderColor: primitives.color.green[500],
  },
  danger: {
    color: color.fg.danger,
    backgroundColor: color.bg.danger.subtle,
    borderColor: primitives.color.red[500],
  },
} as const;

const statusProgressWidths: Record<TaskMatchState['status'], string> = {
  pending: '24%',
  matching: '62%',
  matched: '100%',
  deleted: '100%',
};

export function TaskMatchHistoryPanel({ state }: TaskMatchHistoryPanelProps) {
  const tone = statusToneStyles[taskMatchStatusTones[state.status]];

  return (
    <Stack spacing={2.5}>
      <Stack
        spacing={1.5}
        sx={{
          border: `1px solid ${color.border.default}`,
          borderRadius: `${radius.xl}px`,
          bgcolor: color.bg.neutral.default,
          px: 2.25,
          py: 2.25,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
          <PeopleAltRoundedIcon
            sx={{ color: color.brand.secondary.subtle, fontSize: 20 }}
          />
          <Typography
            sx={{
              color: color.fg.neutral.default,
              fontSize: displayTextSize[15],
              lineHeight: '22px',
              fontWeight: 700,
            }}
          >
            媒合概況
          </Typography>
        </Box>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) auto',
            alignItems: 'center',
            gap: 1.5,
          }}
        >
          <Typography
            sx={{ color: color.fg.neutral.subtle, fontSize: displayTextSize[13], lineHeight: '20px' }}
          >
            {createTaskMatchSummary(state)}。目前前台媒合紀錄以日誌狀態追蹤為主。
          </Typography>
          <Box
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              px: 1.25,
              py: 0.5,
              border: `1px solid ${tone.borderColor}`,
              borderRadius: '999px',
              bgcolor: tone.backgroundColor,
              color: tone.color,
              fontSize: displayTextSize[12],
              lineHeight: '18px',
              fontWeight: 700,
              whiteSpace: 'nowrap',
            }}
          >
            {taskMatchStatusLabels[state.status]}
          </Box>
        </Box>
        <Box
          sx={{
            height: 8,
            bgcolor: color.bg.neutral.sunken,
            overflow: 'hidden',
            borderRadius: '999px',
          }}
        >
          <Box
            sx={{
              width: statusProgressWidths[state.status],
              height: '100%',
              bgcolor:
                state.status === 'deleted'
                  ? color.bg.danger.default
                  : color.brand.secondary.default,
              borderRadius: '999px',
            }}
          />
        </Box>
        <Button
          size="small"
          variant="outlined"
          startIcon={<DownloadRoundedIcon />}
          onClick={() => downloadTaskMatchLog(state)}
          sx={{
            alignSelf: 'flex-start',
            textTransform: 'none',
            fontWeight: 700,
            borderRadius: '999px',
          }}
        >
          匯出日誌
        </Button>
      </Stack>

      <Stack spacing={1.5}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <HistoryRoundedIcon
            sx={{ color: color.fg.neutral.muted, fontSize: 18 }}
          />
          <Typography
            sx={{
              color: color.fg.neutral.default,
              fontSize: displayTextSize[14],
              lineHeight: '20px',
              fontWeight: 700,
            }}
          >
            日誌紀錄
          </Typography>
        </Box>

        {state.operationLog.length > 0 ? (
          <Stack spacing={1.25}>
            {state.operationLog.map((entry) => (
              <Stack
                key={entry.id}
                spacing={0.5}
                sx={{
                  px: 2,
                  py: 1.5,
                  border: `1px solid ${color.border.default}`,
                  borderRadius: `${radius.lg}px`,
                  bgcolor: color.bg.neutral.default,
                }}
              >
                <Typography
                  sx={{
                    color: color.fg.neutral.default,
                    fontSize: displayTextSize[13],
                    lineHeight: '19px',
                    fontWeight: 700,
                  }}
                >
                  {entry.summary}
                </Typography>
                <Typography
                  sx={{ color: color.fg.neutral.muted, fontSize: displayTextSize[12], lineHeight: '18px' }}
                >
                  {entry.actorName} · {formatTaskMatchDate(entry.occurredAt)}
                </Typography>
              </Stack>
            ))}
          </Stack>
        ) : (
          <Box
            sx={{
              border: `1px dashed ${color.border.default}`,
              borderRadius: `${radius.lg}px`,
              bgcolor: color.bg.neutral.subtle,
              px: 2,
              py: 1.5,
            }}
          >
            <Typography
              sx={{ color: color.fg.neutral.muted, fontSize: displayTextSize[13], lineHeight: '20px' }}
            >
              尚無相關日誌紀錄。
            </Typography>
          </Box>
        )}
      </Stack>
    </Stack>
  );
}
