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

interface TaskMatchHistoryPanelProps {
  state: TaskMatchState;
}

const statusToneStyles = {
  neutral: {
    color: '#3D4652',
    backgroundColor: '#EEF2F5',
    borderColor: '#CFD8E2',
  },
  warning: {
    color: '#8B5B00',
    backgroundColor: '#FFF6DA',
    borderColor: '#E9C65D',
  },
  success: {
    color: '#166044',
    backgroundColor: '#DDF4EA',
    borderColor: '#8ECDB7',
  },
  danger: {
    color: '#A13B2B',
    backgroundColor: '#FFF0EB',
    borderColor: '#E6AB9C',
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
          border: '1px solid #D7E0EA',
          borderRadius: '28px',
          bgcolor: '#FFFFFF',
          px: 2.25,
          py: 2.25,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
          <PeopleAltRoundedIcon sx={{ color: '#235A80', fontSize: 20 }} />
          <Typography
            sx={{
              color: '#1F2B37',
              fontSize: 15,
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
            sx={{ color: '#52616F', fontSize: 13, lineHeight: '20px' }}
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
              fontSize: 12,
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
            bgcolor: '#E7EDF3',
            overflow: 'hidden',
            borderRadius: '999px',
          }}
        >
          <Box
            sx={{
              width: statusProgressWidths[state.status],
              height: '100%',
              bgcolor: state.status === 'deleted' ? '#C46A58' : '#3F7DAB',
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
          <HistoryRoundedIcon sx={{ color: '#6D7A86', fontSize: 18 }} />
          <Typography
            sx={{
              color: '#1F2B37',
              fontSize: 14,
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
                  border: '1px solid #D7E0EA',
                  borderRadius: '22px',
                  bgcolor: '#FFFFFF',
                }}
              >
                <Typography
                  sx={{
                    color: '#1F2B37',
                    fontSize: 13,
                    lineHeight: '19px',
                    fontWeight: 700,
                  }}
                >
                  {entry.summary}
                </Typography>
                <Typography
                  sx={{ color: '#667582', fontSize: 12, lineHeight: '18px' }}
                >
                  {entry.actorName} · {formatTaskMatchDate(entry.occurredAt)}
                </Typography>
              </Stack>
            ))}
          </Stack>
        ) : (
          <Box
            sx={{
              border: '1px dashed #C8D3DE',
              borderRadius: '22px',
              bgcolor: '#F7FAFC',
              px: 2,
              py: 1.5,
            }}
          >
            <Typography
              sx={{ color: '#667582', fontSize: 13, lineHeight: '20px' }}
            >
              尚無相關日誌紀錄。
            </Typography>
          </Box>
        )}
      </Stack>
    </Stack>
  );
}
